'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { checkActiveSubscription, checkServerModuleAccess } from '@/lib/subscription-access'

export type PurchaseItemInput = {
    raw_material_id?: string | null
    item_name: string
    quantity: number
    price: number
    unit?: string | null
}

export async function addPurchase(payload: {
    branch_id: string
    supplier_id?: string | null
    supplier?: string
    purchase_date: string
    items: PurchaseItemInput[]
    idempotency_key?: string
    distribution_mode?: 'split' | 'each'
    payment_status?: 'paid' | 'unpaid'
    payment_method?: string
    account_id?: string | null
    due_date?: string | null
}) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profile tidak ditemukan.' }
    if (profile.role !== 'owner') return { error: 'Hanya Owner yang dapat mencatat pembelian bahan baku.' }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const modCheck = await checkServerModuleAccess(profile.business_id, 'raw_materials', supabase)
    if (!modCheck.allowed) {
        return { error: modCheck.error || 'Fitur ini memerlukan paket Business atau Pro.' }
    }

    if (!payload.branch_id) return { error: 'Pilih cabang terlebih dahulu.' }
    if (!payload.purchase_date) return { error: 'Tanggal pembelian wajib diisi.' }
    if (!payload.items || payload.items.length === 0) {
        return { error: 'Tambahkan minimal 1 bahan baku.' }
    }

    const validatedItems = payload.items.map((item) => {
        const qty = Number(item.quantity) || 0
        const price = Number(item.price) || 0
        return {
            raw_material_id: item.raw_material_id || null,
            item_name: item.item_name.trim(),
            quantity: qty,
            price: price,
            subtotal: qty * price,
            unit: item.unit?.trim() || null,
        }
    })

    const invalidItem = validatedItems.find((i) => !i.item_name || i.quantity <= 0 || i.price < 0)
    if (invalidItem) {
        return { error: 'Pastikan nama item diisi dengan benar, kuantitas > 0, dan harga tidak negatif.' }
    }

    // Pastikan setiap item terhubung ke master bahan baku (ambil yang sudah ada atau buat bahan baru otomatis)
    for (const item of validatedItems) {
        if (!item.raw_material_id) {
            // 1. Coba cari bahan yang namanya sama (case-insensitive) di bisnis ini
            const { data: existingMat } = await supabase
                .from('raw_materials')
                .select('id, unit, cost_per_unit')
                .eq('business_id', profile.business_id)
                .ilike('name', item.item_name)
                .maybeSingle()

            if (existingMat) {
                item.raw_material_id = existingMat.id
                if (!item.unit && existingMat.unit) item.unit = existingMat.unit
            } else {
                // 2. Apabila belum ada di master bahan baku, otomatis buat bahan baru!
                const effectiveUnit = item.unit?.trim().toLowerCase() || 'pcs'
                const { data: newMat, error: newMatErr } = await supabase
                    .from('raw_materials')
                    .insert({
                        business_id: profile.business_id,
                        name: item.item_name,
                        category: 'Bahan Baku',
                        unit: effectiveUnit,
                        cost_per_unit: item.price,
                        min_stock: 0,
                        status: 'active',
                        stock: 0,
                    })
                    .select('id, unit')
                    .single()

                if (!newMatErr && newMat) {
                    item.raw_material_id = newMat.id
                    item.unit = newMat.unit

                    // Inisialisasi stok cabang untuk bahan baru tersebut
                    const { data: branches } = await supabase
                        .from('branches')
                        .select('id')
                        .eq('business_id', profile.business_id)

                    if (branches && branches.length > 0) {
                        const branchRows = branches.map((b) => ({
                            business_id: profile.business_id,
                            raw_material_id: newMat.id,
                            branch_id: b.id,
                            quantity: 0,
                            updated_at: new Date().toISOString(),
                        }))
                        await supabase
                            .from('raw_material_branch_stocks')
                            .upsert(branchRows, { onConflict: 'raw_material_id,branch_id' })
                    }
                }
            }
        }
    }

    // Tentukan cabang tujuan (bisa satu cabang atau semua cabang)
    let targetBranches: { id: string; name: string }[] = []
    if (payload.branch_id === 'all') {
        const { data: bList, error: bErr } = await supabase
            .from('branches')
            .select('id, name')
            .eq('business_id', profile.business_id)
            .order('name')
        if (bErr || !bList || bList.length === 0) {
            return { error: 'Tidak ditemukan cabang untuk bisnis ini.' }
        }
        targetBranches = bList
    } else {
        const { data: bSingle, error: bErr } = await supabase
            .from('branches')
            .select('id, name')
            .eq('business_id', profile.business_id)
            .eq('id', payload.branch_id)
            .maybeSingle()
        if (bErr || !bSingle) {
            return { error: 'Cabang penerima tidak valid atau tidak ditemukan.' }
        }
        targetBranches = [bSingle]
    }

    const branchCount = targetBranches.length
    const isAll = payload.branch_id === 'all' && branchCount > 1
    const distMode = payload.distribution_mode || 'split'
    let lastPurchaseId: string | null = null

    // Proses pembelian untuk setiap cabang tujuan
    for (let bIdx = 0; bIdx < branchCount; bIdx++) {
        const branch = targetBranches[bIdx]

        // Hitung kuantitas & subtotal untuk cabang ini
        const branchValidatedItems = validatedItems.map((item) => {
            let itemQty = item.quantity
            if (isAll) {
                if (distMode === 'split') {
                    const baseQty = Math.floor((item.quantity / branchCount) * 100) / 100
                    itemQty = bIdx === branchCount - 1
                        ? Number((item.quantity - baseQty * (branchCount - 1)).toFixed(2))
                        : baseQty
                } else {
                    itemQty = item.quantity
                }
            }
            return {
                ...item,
                quantity: itemQty,
                subtotal: Number((itemQty * item.price).toFixed(2)),
            }
        })

        const paymentStatus = payload.payment_status || 'paid'
        const paymentMethod = payload.payment_method || 'cash'
        let accountId = paymentStatus === 'paid' ? (payload.account_id || null) : null

        // Jika dibayar tunai tapi akun tidak dipilih, cari akun kas default
        if (paymentStatus === 'paid' && !accountId) {
            const { data: defaultAcc } = await supabase
                .from('financial_accounts')
                .select('id')
                .eq('business_id', profile.business_id)
                .eq('status', 'active')
                .order('is_default_cash', { ascending: false })
                .limit(1)
                .maybeSingle()
            if (defaultAcc) {
                accountId = defaultAcc.id
            }
        }

        // 1. Coba eksekusi via RPC Atomik jika tersedia di database
        const { data: rpcData, error: rpcError } = await supabase.rpc('record_purchase_with_stock_atomic', {
            p_business_id: profile.business_id,
            p_branch_id: branch.id,
            p_supplier_id: payload.supplier_id || null,
            p_supplier_name: payload.supplier?.trim() || null,
            p_purchase_date: payload.purchase_date,
            p_items: branchValidatedItems.map((i) => ({
                raw_material_id: i.raw_material_id,
                item_name: i.item_name,
                quantity: i.quantity,
                price: i.price,
                unit: i.unit,
            })),
            p_idempotency_key: !isAll ? (payload.idempotency_key || null) : null,
            p_payment_status: paymentStatus,
            p_payment_method: paymentMethod,
            p_account_id: accountId,
            p_due_date: payload.due_date || null,
        })

        if (!rpcError && rpcData?.success) {
            lastPurchaseId = rpcData.purchase_id
            continue
        }

        // 2. Fallback manual jika RPC belum tersedia atau error
        const branchTotal = branchValidatedItems.reduce((sum, i) => sum + i.subtotal, 0)
        const paidAmount = paymentStatus === 'paid' ? branchTotal : 0

        const { data: purchase, error: purchaseError } = await supabase
            .from('purchases')
            .insert({
                business_id: profile.business_id,
                branch_id: branch.id,
                supplier_id: payload.supplier_id || null,
                supplier: payload.supplier?.trim() || null,
                purchase_date: payload.purchase_date,
                total: branchTotal,
                payment_status: paymentStatus,
                payment_method: paymentMethod,
                account_id: accountId,
                paid_amount: paidAmount,
                due_date: payload.due_date || null,
            })
            .select('id')
            .single()

        if (purchaseError || !purchase) {
            return { error: purchaseError?.message || `Gagal menyimpan pembelian untuk cabang ${branch.name}.` }
        }

        lastPurchaseId = purchase.id

        // Integrasi Keuangan: Potong Kas jika Lunas / Buat Utang jika Tempo
        if (paymentStatus === 'paid' && branchTotal > 0 && accountId) {
            const { data: curAcc } = await supabase
                .from('financial_accounts')
                .select('current_balance')
                .eq('id', accountId)
                .single()
            if (curAcc) {
                await supabase
                    .from('financial_accounts')
                    .update({
                        current_balance: Number(curAcc.current_balance || 0) - branchTotal,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', accountId)
            }

            await supabase.from('financial_transactions').insert({
                business_id: profile.business_id,
                account_id: accountId,
                type: 'expense',
                category: 'expense',
                amount: branchTotal,
                reference_id: purchase.id,
                description: `Pembelian Bahan Baku #${purchase.id.slice(0, 8)} (${payload.supplier || 'Supplier'})`,
                transaction_date: payload.purchase_date,
            })
        } else if (paymentStatus === 'unpaid' && branchTotal > 0) {
            await supabase.from('debts_payables').insert({
                business_id: profile.business_id,
                branch_id: branch.id,
                supplier_id: payload.supplier_id || null,
                creditor_name: payload.supplier?.trim() || 'Supplier Bahan Baku',
                purchase_id: purchase.id,
                title: `Utang Pembelian Bahan Baku #${purchase.id.slice(0, 8)}`,
                total_amount: branchTotal,
                paid_amount: 0,
                due_date: payload.due_date || null,
                status: 'unpaid',
                notes: `Pembelian tempo bahan baku cabang ${branch.name}`,
            })
        }

        const itemsToInsert = branchValidatedItems.map((item) => ({
            purchase_id: purchase.id,
            raw_material_id: item.raw_material_id,
            item_name: item.item_name,
            quantity: item.quantity,
            price: item.price,
            subtotal: item.subtotal,
            unit: item.unit,
        }))

        const { error: itemsError } = await supabase.from('purchase_items').insert(itemsToInsert)

        if (itemsError) {
            await supabase.from('purchases').delete().eq('id', purchase.id)
            return { error: itemsError.message }
        }

        // Update stok cabang & catat kartu mutasi untuk item yang terhubung master bahan baku
        for (const item of branchValidatedItems) {
            if (item.raw_material_id) {
                const noteText = isAll
                    ? `Pembelian (${branch.name} - Semua Cabang) #${purchase.id.slice(0, 8)}`
                    : `Pembelian #${purchase.id.slice(0, 8)}`

                try {
                    const { error: mutRpcError } = await supabase.rpc('record_inventory_mutation_atomic', {
                        p_business_id: profile.business_id,
                        p_branch_id: branch.id,
                        p_raw_material_id: item.raw_material_id,
                        p_mutation_type: 'purchase_in',
                        p_quantity_change: item.quantity,
                        p_notes: noteText,
                        p_reference_id: purchase.id,
                    })

                    if (mutRpcError) {
                        const { data: curStock } = await supabase
                            .from('raw_material_branch_stocks')
                            .select('quantity')
                            .eq('raw_material_id', item.raw_material_id)
                            .eq('branch_id', branch.id)
                            .maybeSingle()

                        const newQty = (Number(curStock?.quantity) || 0) + item.quantity
                        await supabase
                            .from('raw_material_branch_stocks')
                            .upsert(
                                {
                                    business_id: profile.business_id,
                                    raw_material_id: item.raw_material_id,
                                    branch_id: branch.id,
                                    quantity: newQty,
                                    updated_at: new Date().toISOString(),
                                },
                                { onConflict: 'raw_material_id,branch_id' }
                            )

                        await supabase.from('inventory_mutations').insert({
                            business_id: profile.business_id,
                            branch_id: branch.id,
                            raw_material_id: item.raw_material_id,
                            mutation_type: 'purchase_in',
                            quantity_change: item.quantity,
                            balance_after: newQty,
                            notes: noteText,
                            reference_id: purchase.id,
                            user_id: user.id,
                        })
                    }

                    // Update harga beli terakhir (HPP) acuan pada master bahan
                    await supabase
                        .from('raw_materials')
                        .update({
                            cost_per_unit: item.price,
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', item.raw_material_id)
                        .eq('business_id', profile.business_id)
                } catch (err) {
                    console.error('Failed to record stock mutation for purchase item:', err)
                }
            }
        }
    }

    // Sinkronkan stok global (raw_materials.stock) dengan penjumlahan stok seluruh cabang
    const uniqueMaterialIds = Array.from(
        new Set(validatedItems.map((i) => i.raw_material_id).filter((id): id is string => Boolean(id)))
    )
    for (const matId of uniqueMaterialIds) {
        const { data: allStocks } = await supabase
            .from('raw_material_branch_stocks')
            .select('quantity')
            .eq('raw_material_id', matId)
            .eq('business_id', profile.business_id)
        if (allStocks) {
            const total = allStocks.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
            await supabase
                .from('raw_materials')
                .update({ stock: total, updated_at: new Date().toISOString() })
                .eq('id', matId)
                .eq('business_id', profile.business_id)
        }
    }

    revalidatePath('/dashboard/bahan-baku')
    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard')
    return { success: true, purchase_id: lastPurchaseId, branch_count: targetBranches.length }
}

export async function deletePurchase(purchaseId: string) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'owner') {
        return { error: 'Hanya Owner yang dapat menghapus data pembelian.' }
    }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const modCheck = await checkServerModuleAccess(profile.business_id, 'raw_materials', supabase)
    if (!modCheck.allowed) {
        return { error: modCheck.error || 'Fitur ini memerlukan paket Business atau Pro.' }
    }

    // 1. Ambil data pembelian beserta item dan relasi bahan bakunya
    const { data: purchase } = await supabase
        .from('purchases')
        .select('id, branch_id, business_id, total, paid_amount, payment_status, account_id, purchase_items (raw_material_id, quantity, item_name)')
        .eq('id', purchaseId)
        .eq('business_id', profile.business_id)
        .single()

    if (!purchase) return { error: 'Data pembelian tidak ditemukan.' }

    // 2. Jika ada item yang terhubung ke bahan baku, cek apakah reversal stok membuat stok negatif
    const items = (purchase.purchase_items || []) as { raw_material_id: string | null; quantity: number; item_name: string }[]
    for (const it of items) {
        if (it.raw_material_id) {
            const { data: stockRow } = await supabase
                .from('raw_material_branch_stocks')
                .select('quantity')
                .eq('raw_material_id', it.raw_material_id)
                .eq('branch_id', purchase.branch_id)
                .single()

            const currentStock = stockRow ? Number(stockRow.quantity) : 0
            if (currentStock < Number(it.quantity)) {
                return {
                    error: `Tidak dapat membatalkan pembelian: Stok bahan '${it.item_name}' di cabang ini telah terpakai (sisa saat ini: ${currentStock}, pembelian: ${it.quantity}).`,
                }
            }
        }
    }

    // 3. Kurangkan kembali stok (reversal) sebelum menghapus pembelian
    for (const it of items) {
        if (it.raw_material_id) {
            await supabase.rpc('record_inventory_mutation_atomic', {
                p_business_id: profile.business_id,
                p_branch_id: purchase.branch_id,
                p_raw_material_id: it.raw_material_id,
                p_mutation_type: 'adjustment',
                p_quantity_change: -Number(it.quantity),
                p_notes: `Pembatalan Pembelian #${purchaseId.slice(0, 8)}`,
                p_reference_id: `cancel_${purchaseId}`,
            })

            const { data: allStocks } = await supabase
                .from('raw_material_branch_stocks')
                .select('quantity')
                .eq('raw_material_id', it.raw_material_id)
                .eq('business_id', profile.business_id)
            if (allStocks) {
                const total = allStocks.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
                await supabase
                    .from('raw_materials')
                    .update({ stock: total, updated_at: new Date().toISOString() })
                    .eq('id', it.raw_material_id)
                    .eq('business_id', profile.business_id)
            }
        }
    }

    // 4. Periksa apakah pembelian memiliki utang terkait
    const { data: linkedDebt } = await supabase
        .from('debts_payables')
        .select('id, total_amount, paid_amount')
        .eq('purchase_id', purchaseId)
        .eq('business_id', profile.business_id)
        .maybeSingle()

    // 4a. Jika utang pernah dicicil melalui payDebt, balikkan saldo kas dari setiap transaksi pembayaran utang
    if (linkedDebt) {
        const { data: debtTxs } = await supabase
            .from('financial_transactions')
            .select('id, account_id, amount')
            .eq('reference_id', linkedDebt.id)
            .eq('category', 'debt_payment')
            .eq('type', 'expense')

        for (const dTx of debtTxs || []) {
            if (dTx.account_id && Number(dTx.amount || 0) > 0) {
                const { data: curAcc } = await supabase
                    .from('financial_accounts')
                    .select('current_balance')
                    .eq('id', dTx.account_id)
                    .single()

                if (curAcc) {
                    await supabase
                        .from('financial_accounts')
                        .update({
                            current_balance: Number(curAcc.current_balance || 0) + Number(dTx.amount),
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', dTx.account_id)
                }
            }
        }

        // Hapus catatan mutasi pembayaran utang
        await supabase
            .from('financial_transactions')
            .delete()
            .eq('reference_id', linkedDebt.id)

        // Hapus entitas utang
        await supabase
            .from('debts_payables')
            .delete()
            .eq('id', linkedDebt.id)
            .eq('business_id', profile.business_id)
    }

    // 4b. Balikkan Saldo Kas pembayaran awal/langsung jika ada mutasi pembelian awal
    const { data: purchaseTxs } = await supabase
        .from('financial_transactions')
        .select('id, account_id, amount')
        .eq('reference_id', purchaseId)
        .eq('type', 'expense')

    for (const pTx of purchaseTxs || []) {
        if (pTx.account_id && Number(pTx.amount || 0) > 0) {
            const { data: curAcc } = await supabase
                .from('financial_accounts')
                .select('current_balance')
                .eq('id', pTx.account_id)
                .single()

            if (curAcc) {
                await supabase
                    .from('financial_accounts')
                    .update({
                        current_balance: Number(curAcc.current_balance || 0) + Number(pTx.amount),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', pTx.account_id)
            }
        }
    }

    await supabase
        .from('financial_transactions')
        .delete()
        .eq('reference_id', purchaseId)

    // 5. Hapus pembelian (cascade akan menghapus purchase_items)
    const { error } = await supabase.from('purchases').delete().eq('id', purchaseId)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/bahan-baku')
    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/arus-kas')
    revalidatePath('/dashboard/keuangan/utang-piutang')
    revalidatePath('/dashboard/keuangan/kas-rekening')
    revalidatePath('/dashboard/keuangan/neraca')
    revalidatePath('/dashboard')
    return { success: true }
}

