'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { RawMaterial } from '@/types/inventory'
import { checkActiveSubscription } from '@/lib/subscription-access'

export interface CreateRawMaterialInput {
    sku?: string
    name: string
    category?: string
    unit: string
    cost_per_unit: number
    min_stock: number
    initial_stocks?: {
        branch_id: string
        quantity: number
    }[]
}

export interface UpdateRawMaterialInput {
    sku?: string
    name: string
    category?: string
    unit: string
    cost_per_unit: number
    min_stock: number
    status?: 'active' | 'inactive'
}

export async function createRawMaterial(payload: CreateRawMaterialInput) {
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

    if (!profile) return { error: 'Profil pengguna tidak ditemukan.' }
    if (profile.role !== 'owner') return { error: 'Hanya Owner yang dapat menambahkan master bahan baku.' }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const name = payload.name?.trim()
    if (!name) return { error: 'Nama bahan baku wajib diisi.' }

    const unit = payload.unit?.trim() || 'pcs'
    const costPerUnit = Number(payload.cost_per_unit) || 0
    const minStock = Number(payload.min_stock) || 0
    const sku = payload.sku?.trim() || null

    if (costPerUnit < 0) return { error: 'Biaya per satuan (HPP) tidak boleh negatif.' }
    if (minStock < 0) return { error: 'Batas stok minimum tidak boleh negatif.' }

    // Cek duplikasi SKU dalam bisnis yang sama jika SKU diisi
    if (sku) {
        const { data: existingSku } = await supabase
            .from('raw_materials')
            .select('id')
            .eq('business_id', profile.business_id)
            .ilike('sku', sku)
            .maybeSingle()

        if (existingSku) {
            return { error: `SKU '${sku}' sudah digunakan oleh bahan baku lain dalam bisnis ini.` }
        }
    }

    // 1. Simpan master bahan baku
    const { data: material, error: insertError } = await supabase
        .from('raw_materials')
        .insert({
            business_id: profile.business_id,
            sku,
            name,
            category: payload.category?.trim() || null,
            unit,
            cost_per_unit: costPerUnit,
            min_stock: minStock,
            status: 'active',
        })
        .select()
        .single()

    if (insertError || !material) {
        return { error: insertError?.message || 'Gagal menyimpan bahan baku.' }
    }

    // 2. Jika ada saldo awal (initial_stocks) untuk cabang, catat mutasi opening_balance secara atomik
    if (payload.initial_stocks && payload.initial_stocks.length > 0) {
        for (const item of payload.initial_stocks) {
            const qty = Number(item.quantity) || 0
            if (qty > 0) {
                const { error: rpcError } = await supabase.rpc('record_inventory_mutation_atomic', {
                    p_business_id: profile.business_id,
                    p_branch_id: item.branch_id,
                    p_raw_material_id: material.id,
                    p_mutation_type: 'opening_balance',
                    p_quantity_change: qty,
                    p_notes: 'Saldo awal bahan baku saat pembuatan master',
                    p_reference_id: `opening_${material.id}_${item.branch_id}`,
                    p_idempotency_key: `opening_${material.id}_${item.branch_id}`,
                })

                if (rpcError) {
                    console.error('Initial stock RPC error:', rpcError)
                    // Fallback jika RPC belum ter-apply: update langsung via service role / owner
                    await supabase
                        .from('raw_material_branch_stocks')
                        .upsert(
                            {
                                business_id: profile.business_id,
                                raw_material_id: material.id,
                                branch_id: item.branch_id,
                                quantity: qty,
                            },
                            { onConflict: 'raw_material_id,branch_id' }
                        )

                    await supabase.from('inventory_mutations').insert({
                        business_id: profile.business_id,
                        branch_id: item.branch_id,
                        raw_material_id: material.id,
                        mutation_type: 'opening_balance',
                        quantity_change: qty,
                        balance_after: qty,
                        notes: 'Saldo awal bahan baku saat pembuatan master',
                        reference_id: `opening_${material.id}_${item.branch_id}`,
                        user_id: user.id,
                    })
                }
            }
        }
    }

    revalidatePath('/dashboard/bahan-baku')
    return { success: true, data: material as RawMaterial }
}

export async function updateRawMaterial(id: string, payload: UpdateRawMaterialInput) {
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

    if (!profile) return { error: 'Profil tidak ditemukan.' }
    if (profile.role !== 'owner') return { error: 'Hanya Owner yang dapat mengubah master bahan baku.' }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const name = payload.name?.trim()
    if (!name) return { error: 'Nama bahan baku wajib diisi.' }

    const unit = payload.unit?.trim() || 'pcs'
    const costPerUnit = Number(payload.cost_per_unit) || 0
    const minStock = Number(payload.min_stock) || 0
    const sku = payload.sku?.trim() || null

    if (costPerUnit < 0) return { error: 'Biaya per satuan (HPP) tidak boleh negatif.' }
    if (minStock < 0) return { error: 'Batas stok minimum tidak boleh negatif.' }

    // Cek duplikasi SKU jika berubah
    if (sku) {
        const { data: existingSku } = await supabase
            .from('raw_materials')
            .select('id')
            .eq('business_id', profile.business_id)
            .ilike('sku', sku)
            .neq('id', id)
            .maybeSingle()

        if (existingSku) {
            return { error: `SKU '${sku}' sudah digunakan oleh bahan baku lain.` }
        }
    }

    const { error: updateError } = await supabase
        .from('raw_materials')
        .update({
            sku,
            name,
            category: payload.category?.trim() || null,
            unit,
            cost_per_unit: costPerUnit,
            min_stock: minStock,
            status: payload.status || 'active',
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('business_id', profile.business_id)

    if (updateError) return { error: updateError.message }

    revalidatePath('/dashboard/bahan-baku')
    return { success: true }
}

export async function deleteRawMaterial(id: string) {
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

    if (!profile) return { error: 'Profil tidak ditemukan.' }
    if (profile.role !== 'owner') return { error: 'Hanya Owner yang dapat menghapus bahan baku.' }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    // Cek apakah bahan baku sudah memiliki riwayat mutasi atau pembelian
    const { count: mutationCount } = await supabase
        .from('inventory_mutations')
        .select('id', { count: 'exact', head: true })
        .eq('raw_material_id', id)

    if (mutationCount && mutationCount > 0) {
        return {
            error: `Bahan baku tidak dapat dihapus karena memiliki ${mutationCount} riwayat mutasi/pembelian. Ubah status menjadi non-aktif jika tidak digunakan lagi.`,
        }
    }

    const { error } = await supabase
        .from('raw_materials')
        .delete()
        .eq('id', id)
        .eq('business_id', profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/bahan-baku')
    return { success: true }
}

export type StockReductionReason = 'waste_expired' | 'lost_shrinkage' | 'production_usage' | 'input_correction'
export type InventoryAdjustmentMutationType = 'adjustment' | 'waste' | 'opening_balance' | StockReductionReason

export interface RecordStockAdjustmentPayload {
    raw_material_id: string
    branch_id: string
    mutation_type: InventoryAdjustmentMutationType
    quantity_change: number // bertanda positif (tambah) atau negatif (kurang)
    notes?: string
    record_as_expense?: boolean // toggle opsional apakah dicatat sebagai beban operasional (misal pemakaian produksi)
}

export async function updateRawMaterialGlobalStock(id: string, newStock: number) {
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

    if (!profile || profile.role !== 'owner') {
        return { error: 'Hanya owner yang dapat mengubah stok global (induk) bahan baku.' }
    }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const cleanStock = Math.max(0, Number(newStock) || 0)

    const { error } = await supabase
        .from('raw_materials')
        .update({ stock: cleanStock, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('business_id', profile.business_id)

    if (error) {
        if (error.code === '42703') {
            return { error: 'Kolom stok induk belum tersedia di database. Jalankan migrasi 0026.' }
        }
        return { error: error.message }
    }

    revalidatePath('/dashboard/bahan-baku')
    return { success: true }
}

export async function recordStockAdjustment(payload: RecordStockAdjustmentPayload) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role, branch_id')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil pengguna tidak ditemukan.' }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    if (!payload.raw_material_id) return { error: 'Pilih bahan baku terlebih dahulu.' }

    // Jika branch_id tidak disediakan (atau 'all'), targetkan ke Cabang Utama
    let targetBranchId = payload.branch_id
    if (!targetBranchId || targetBranchId === 'all') {
        const { data: primaryB } = await supabase
            .from('branches')
            .select('id')
            .eq('business_id', profile.business_id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
        targetBranchId = primaryB?.id || ''
    }

    if (!targetBranchId) return { error: 'Pilih cabang terlebih dahulu.' }

    // Pegawai hanya boleh di cabangnya sendiri
    if (profile.role !== 'owner' && profile.branch_id !== targetBranchId) {
        return { error: 'Anda hanya memiliki akses untuk mencatat mutasi stok di cabang Anda sendiri.' }
    }

    const qtyChange = Number(payload.quantity_change)
    if (isNaN(qtyChange) || qtyChange === 0) {
        return { error: 'Jumlah perubahan stok tidak boleh 0.' }
    }

    // Ambil data master bahan baku untuk perhitungan HPP & pelaporan kerugian
    const { data: material } = await supabase
        .from('raw_materials')
        .select('id, name, unit, cost_per_unit')
        .eq('id', payload.raw_material_id)
        .eq('business_id', profile.business_id)
        .maybeSingle()

    // Untuk kategori pengurangan stok (waste, waste_expired, lost_shrinkage, production_usage),
    // pastikan perubahan bertanda negatif
    const isReductionType = [
        'waste',
        'waste_expired',
        'lost_shrinkage',
        'production_usage',
    ].includes(payload.mutation_type)

    const finalChange = isReductionType ? -Math.abs(qtyChange) : qtyChange

    // Eksekusi mutasi stok secara atomik
    let mutationTypeToRecord = payload.mutation_type
    let { data: rpcResult, error: rpcError } = await supabase.rpc('record_inventory_mutation_atomic', {
        p_business_id: profile.business_id,
        p_branch_id: targetBranchId,
        p_raw_material_id: payload.raw_material_id,
        p_mutation_type: mutationTypeToRecord,
        p_quantity_change: finalChange,
        p_notes: payload.notes?.trim() || null,
        p_reference_id: `manual_${Date.now()}`,
    })

    // Fallback jika constraint check mutation_type di database belum diperbarui: gunakan 'waste' atau 'adjustment'
    if (rpcError && rpcError.code === '23514') {
        mutationTypeToRecord = isReductionType ? 'waste' : 'adjustment'
        const retry = await supabase.rpc('record_inventory_mutation_atomic', {
            p_business_id: profile.business_id,
            p_branch_id: targetBranchId,
            p_raw_material_id: payload.raw_material_id,
            p_mutation_type: mutationTypeToRecord,
            p_quantity_change: finalChange,
            p_notes: payload.notes?.trim() || null,
            p_reference_id: `manual_${Date.now()}`,
        })
        rpcResult = retry.data
        rpcError = retry.error
    }

    if (rpcError) {
        if (rpcError.code === 'P0003') {
            return { error: 'Stok tidak mencukupi untuk melakukan pengurangan ini.' }
        }
        return { error: rpcError.message }
    }

    // PENCATATAN AKUNTANSI NON-KAS (Non-Cash Inventory Loss):
    // Ketika bahan baku berkurang karena rusak/kadaluarsa (waste_expired) atau hilang/selisih minus (lost_shrinkage),
    // atau pemakaian produksi dengan opsi beban aktif, catat otomatis ke tabel expenses sebagai Beban Non-Kas.
    // Uang fisik TIDAK keluar lagi (karena sudah dibayar saat pembelian bahan di awal).
    const isLossAccountingType =
        payload.mutation_type === 'waste' ||
        payload.mutation_type === 'waste_expired' ||
        payload.mutation_type === 'lost_shrinkage' ||
        (payload.mutation_type === 'production_usage' && payload.record_as_expense)

    if (isLossAccountingType && material) {
        const qty = Math.abs(finalChange)
        const costPerUnit = Number(material.cost_per_unit) || 0
        const lossAmount = Math.round(qty * costPerUnit * 100) / 100

        if (lossAmount > 0) {
            let reasonTag = '[WASTE/RUSAK]'
            if (payload.mutation_type === 'lost_shrinkage') {
                reasonTag = '[HILANG/SELISIH]'
            } else if (payload.mutation_type === 'production_usage') {
                reasonTag = '[PEMAKAIAN OPERASIONAL]'
            }

            const desc = `${reasonTag} ${material.name} (${qty} ${material.unit || 'pcs'} x Rp ${costPerUnit.toLocaleString('id-ID')})${payload.notes ? ` - ${payload.notes.trim()}` : ''}`

            const expensePayload: {
                business_id: string
                branch_id: string | null
                category: 'lainnya'
                amount: number
                expense_date: string
                description: string
                is_non_cash?: boolean
            } = {
                business_id: profile.business_id,
                branch_id: targetBranchId || null,
                category: 'lainnya',
                amount: lossAmount,
                expense_date: new Date().toISOString().split('T')[0],
                description: desc,
                is_non_cash: true,
            }

            const { error: expErr } = await supabase.from('expenses').insert(expensePayload)
            if (expErr && expErr.code === '42703') {
                // Fallback jika kolom is_non_cash belum tersedia di database target
                delete expensePayload.is_non_cash
                await supabase.from('expenses').insert(expensePayload)
            }
        }
    }

    // Sinkronkan total stok di raw_materials sebagai penjumlahan seluruh cabang
    const { data: allStocks } = await supabase
        .from('raw_material_branch_stocks')
        .select('quantity')
        .eq('raw_material_id', payload.raw_material_id)
        .eq('business_id', profile.business_id)

    if (allStocks) {
        const total = allStocks.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
        await supabase
            .from('raw_materials')
            .update({ stock: total, updated_at: new Date().toISOString() })
            .eq('id', payload.raw_material_id)
            .eq('business_id', profile.business_id)
    }

    revalidatePath('/dashboard/bahan-baku')
    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/beban')
    revalidatePath('/dashboard/keuangan/laba-rugi')
    revalidatePath('/dashboard/keuangan/neraca')
    revalidatePath('/dashboard/keuangan/arus-kas')
    return { success: true, data: rpcResult }
}

export interface RecordStockTransferPayload {
    raw_material_id: string
    source_branch_id: string
    target_branch_id: string
    quantity: number
    notes?: string
}

export async function recordStockTransfer(payload: RecordStockTransferPayload) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role, branch_id')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil tidak ditemukan.' }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    if (payload.source_branch_id === payload.target_branch_id) {
        return { error: 'Cabang asal dan cabang tujuan transfer tidak boleh sama.' }
    }

    const qty = Number(payload.quantity)
    if (!qty || qty <= 0) return { error: 'Jumlah transfer harus lebih dari 0.' }

    // Pegawai hanya bisa transfer keluar dari cabangnya sendiri
    if (profile.role !== 'owner' && profile.branch_id !== payload.source_branch_id) {
        return { error: 'Anda hanya dapat melakukan transfer keluar dari cabang Anda sendiri.' }
    }

    const transferRef = `transfer_${Date.now()}`

    // 1. Mutasi keluar dari cabang asal
    const { error: outError } = await supabase.rpc('record_inventory_mutation_atomic', {
        p_business_id: profile.business_id,
        p_branch_id: payload.source_branch_id,
        p_raw_material_id: payload.raw_material_id,
        p_mutation_type: 'transfer_out',
        p_quantity_change: -qty,
        p_notes: payload.notes ? `Transfer keluar: ${payload.notes}` : 'Transfer antar cabang keluar',
        p_reference_id: transferRef,
    })

    if (outError) {
        if (outError.code === 'P0003') {
            return { error: 'Stok di cabang asal tidak mencukupi untuk ditransfer.' }
        }
        return { error: `Gagal transfer keluar: ${outError.message}` }
    }

    // 2. Mutasi masuk ke cabang tujuan
    const { error: inError } = await supabase.rpc('record_inventory_mutation_atomic', {
        p_business_id: profile.business_id,
        p_branch_id: payload.target_branch_id,
        p_raw_material_id: payload.raw_material_id,
        p_mutation_type: 'transfer_in',
        p_quantity_change: qty,
        p_notes: payload.notes ? `Transfer masuk: ${payload.notes}` : 'Transfer antar cabang masuk',
        p_reference_id: transferRef,
    })

    if (inError) {
        // Kompensasi rollback cabang asal jika cabang tujuan gagal
        await supabase.rpc('record_inventory_mutation_atomic', {
            p_business_id: profile.business_id,
            p_branch_id: payload.source_branch_id,
            p_raw_material_id: payload.raw_material_id,
            p_mutation_type: 'adjustment',
            p_quantity_change: qty,
            p_notes: `Rollback kegagalan transfer ${transferRef}`,
            p_reference_id: `rollback_${transferRef}`,
        })
        return { error: `Gagal transfer masuk: ${inError.message}` }
    }

    revalidatePath('/dashboard/bahan-baku')
    return { success: true }
}
