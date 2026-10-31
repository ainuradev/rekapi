'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkActiveSubscription } from '@/lib/subscription-access'
import {
    resolveBranchProductStock,
    shouldFallbackFromUpdateSaleRpc,
    validateSaleEditable,
    validateSaleStockAvailability,
} from '@/lib/sale-stock-integrity'

type EditItem = {
    product_id: string
    name: string
    quantity: number
    price: number
    cost_price: number
}

type DbSaleItem = {
    product_id: string
    quantity: number
    branch_stock_deducted?: number | null
    price: number
    cost_price: number
    subtotal?: number
    products?: { name: string; unit?: string } | null
}

type DbProduct = {
    id: string
    name: string
    selling_price: number
    cost_price: number
    status: string
    business_id: string
}

const ALLOWED_CHANNELS = ['offline', 'gofood', 'grabfood', 'shopeefood', 'whatsapp', 'qris', 'lainnya']
const ALLOWED_PAYMENT_METHODS = ['cash', 'qris', 'transfer', 'lainnya']

export async function updateSale(
    saleId: string,
    input: { channel: string; payment_method: string; items: EditItem[]; reason?: string }
) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, branch_id, business_id')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil pengguna tidak ditemukan.' }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    // 1. Ambil data sale + item LAMA sebelum diubah (termasuk status transaksi & stok terpotong)
    let oldSaleRes = await supabase
        .from('sales')
        .select('id, business_id, status, payment_status, channel, payment_method, total, branch_id, user_id, invoice_number, sale_items(product_id, quantity, branch_stock_deducted, price, cost_price, subtotal, products(name))')
        .eq('id', saleId)
        .single()

    if (oldSaleRes.error && oldSaleRes.error.code === '42703') {
        oldSaleRes = await supabase
            .from('sales')
            .select('id, business_id, status, payment_status, channel, payment_method, total, branch_id, user_id, invoice_number, sale_items(product_id, quantity, price, cost_price, subtotal, products(name))')
            .eq('id', saleId)
            .single() as typeof oldSaleRes
    }

    const { data: oldSale, error: oldSaleError } = oldSaleRes

    if (oldSaleError || !oldSale) {
        return { error: 'Transaksi tidak ditemukan atau Anda tidak berhak mengaksesnya.' }
    }

    // 2. Validasi isolasi tenant, penolakan status voided, & hak akses cabang
    const editableCheck = validateSaleEditable(oldSale, profile)
    if (!editableCheck.ok) {
        return { error: editableCheck.error }
    }

    // 3. Kebijakan Edit Hibrida: Tolak edit jika ada cicilan bertahap / pembayaran lanjutan
    const { count: paymentCount, data: payments } = await supabase
        .from('sale_payments')
        .select('id, notes', { count: 'exact' })
        .eq('sale_id', saleId)

    if (paymentCount && paymentCount > 1) {
        return {
            error: `Transaksi ini telah memiliki ${paymentCount} kali riwayat pembayaran cicilan bertahap dan tidak dapat diedit langsung. Silakan gunakan fitur Batalkan (Void) dan buat transaksi baru yang sesuai.`,
        }
    }

    if (
        (oldSale.payment_status === 'unpaid' || oldSale.payment_status === 'partial') &&
        payments &&
        payments.length === 1
    ) {
        const note = (payments[0]?.notes || '').toLowerCase()
        const isInitialPayment = note.includes('dp') || note.includes('uang muka') || note.includes('kasir')
        if (!isInitialPayment) {
            return {
                error: 'Transaksi ini telah memiliki pembayaran cicilan piutang lanjutan dan tidak dapat diedit langsung. Silakan gunakan fitur Batalkan (Void) dan buat transaksi baru yang sesuai.',
            }
        }
    }

    // 4. Validasi daftar item
    if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
        return { error: 'Item transaksi tidak boleh kosong.' }
    }

    for (const item of input.items) {
        if (!item.product_id || typeof item.product_id !== 'string') {
            return { error: 'Format ID produk tidak valid.' }
        }
        if (typeof item.quantity !== 'number' || isNaN(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.quantity)) {
            return { error: 'Kuantitas item harus berupa angka positif (> 0).' }
        }
    }

    // 5. Verifikasi integritas harga, HPP, dan kepemilikan produk
    const oldItemMap = new Map<string, { price: number; cost_price: number; name: string }>()
    for (const oldItem of (oldSale.sale_items as unknown as DbSaleItem[]) ?? []) {
        oldItemMap.set(oldItem.product_id, {
            price: Number(oldItem.price),
            cost_price: Number(oldItem.cost_price ?? 0),
            name: oldItem.products?.name ?? 'Item',
        })
    }

    // Identifikasi produk baru jika ada yang ditambahkan di luar item lama
    const newProductIds = Array.from(
        new Set(input.items.map((i) => i.product_id).filter((id) => !oldItemMap.has(id)))
    )

    const dbProductMap = new Map<string, DbProduct>()
    if (newProductIds.length > 0) {
        let dbProducts: DbProduct[] | null = null
        let dbProdError: { message: string } | null = null

        if (profile.role === 'owner') {
            const ownerRes = await supabase
                .from('owner_products_view')
                .select('id, name, selling_price, cost_price, status, business_id')
                .eq('business_id', profile.business_id)
                .in('id', newProductIds)
            if (ownerRes.error && ownerRes.error.code === '42P01') {
                const fallbackRes = await supabase
                    .from('products')
                    .select('id, name, selling_price, cost_price, status, business_id')
                    .eq('business_id', profile.business_id)
                    .in('id', newProductIds)
                dbProducts = fallbackRes.data as unknown as DbProduct[] | null
                dbProdError = fallbackRes.error
            } else {
                dbProducts = ownerRes.data as unknown as DbProduct[] | null
                dbProdError = ownerRes.error
            }
        } else {
            const empRes = await supabase
                .from('products')
                .select('id, name, selling_price, status, business_id')
                .eq('business_id', profile.business_id)
                .in('id', newProductIds)
            dbProducts = (empRes.data as unknown as DbProduct[])?.map((p) => ({ ...p, cost_price: 0 })) ?? null
            dbProdError = empRes.error
        }

        if (dbProdError || !dbProducts) {
            return { error: 'Gagal memverifikasi produk baru: ' + (dbProdError?.message ?? '') }
        }

        for (const p of dbProducts) {
            dbProductMap.set(p.id, p as unknown as DbProduct)
        }
    }

    // Deduplikasi input.items per product_id agar pengiriman baris ganda tidak mem-bypass validasi stok
    const mergedInputMap = new Map<string, EditItem>()
    for (const item of input.items) {
        const existing = mergedInputMap.get(item.product_id)
        if (existing) {
            existing.quantity = Math.round((existing.quantity + item.quantity) * 100) / 100
        } else {
            mergedInputMap.set(item.product_id, {
                ...item,
                quantity: Math.round(item.quantity * 100) / 100,
            })
        }
    }
    const normalizedInputItems = Array.from(mergedInputMap.values())

    const verifiedItems: Array<{
        product_id: string
        name: string
        quantity: number
        price: number
        cost_price: number
        subtotal: number
    }> = []

    let newTotal = 0

    for (const item of normalizedInputItems) {
        let itemName = item.name || 'Item'
        let verifiedPrice: number
        let verifiedCostPrice: number

        if (oldItemMap.has(item.product_id)) {
            const old = oldItemMap.get(item.product_id)!
            itemName = old.name

            // Kebijakan harga Rekapi:
            // Transaksi historis mempertahankan harga jual dan HPP saat penjualan terjadi.
            // Hanya jika user ber-role OWNER dan secara eksplisit memberikan harga positif baru,
            // harga diperbolehkan disesuaikan. Untuk non-owner (pegawai), payload harga dari client
            // DIABAIKAN sepenuhnya dan harga historis tetap dipertahankan.
            if (
                profile.role === 'owner' &&
                typeof item.price === 'number' &&
                !isNaN(item.price) &&
                item.price > 0 &&
                item.price !== old.price
            ) {
                verifiedPrice = Math.round(item.price * 100) / 100
            } else {
                verifiedPrice = old.price
            }

            // HPP historis dipertahankan dari catatan penjualan asli
            verifiedCostPrice = old.cost_price
        } else {
            // Produk baru yang ditambahkan ke transaksi
            const dbProd = dbProductMap.get(item.product_id)
            if (!dbProd) {
                return { error: `Produk dengan ID ${item.product_id} tidak ditemukan atau bukan milik bisnis Anda.` }
            }
            if (dbProd.status !== 'aktif') {
                return { error: `Produk "${dbProd.name}" berstatus nonaktif dan tidak dapat ditambahkan.` }
            }

            itemName = dbProd.name
            if (
                profile.role === 'owner' &&
                typeof item.price === 'number' &&
                !isNaN(item.price) &&
                item.price > 0
            ) {
                verifiedPrice = Math.round(item.price * 100) / 100
            } else {
                verifiedPrice = Number(dbProd.selling_price)
            }

            verifiedCostPrice = Number(dbProd.cost_price ?? 0)
        }

        const subtotal = Math.round(verifiedPrice * item.quantity * 100) / 100
        newTotal += subtotal

        verifiedItems.push({
            product_id: item.product_id,
            name: itemName,
            quantity: item.quantity,
            price: verifiedPrice,
            cost_price: verifiedCostPrice,
            subtotal,
        })
    }

    newTotal = Math.round(newTotal * 100) / 100

    // 5b. Validasi Ketat Ketersediaan Stok Cabang (Strict Stock Validation / No Oversell)
    // Rumus: Stok Efektif Tersedia = Stok Cabang Saat Ini + Kuantitas Lama di Transaksi Ini (old_qty)
    const allProductIds = verifiedItems.map((i) => i.product_id)
    const [branchStocksRes, prodStocksRes] = await Promise.all([
        supabase
            .from('product_branch_stocks')
            .select('product_id, branch_id, stock')
            .eq('business_id', profile.business_id)
            .in('product_id', allProductIds),
        supabase
            .from('products')
            .select('id, name, stock')
            .eq('business_id', profile.business_id)
            .in('id', allProductIds),
    ])

    if (branchStocksRes.error) {
        return { error: `Gagal memeriksa ketersediaan stok cabang: ${branchStocksRes.error.message}` }
    }
    if (prodStocksRes.error && prodStocksRes.error.code !== '42703') {
        return { error: `Gagal memeriksa data stok produk: ${prodStocksRes.error.message}` }
    }

    const fallbackStockMap = new Map<string, { name: string; stock: number }>()
    for (const p of (prodStocksRes.data ?? []) as Array<{ id: string; name: string; stock?: number | null }>) {
        fallbackStockMap.set(p.id, {
            name: p.name,
            stock: Number(p.stock ?? 0),
        })
    }

    const stockByProductId = new Map<string, { currentStock: number; name?: string }>()
    for (const item of verifiedItems) {
        const fb = fallbackStockMap.get(item.product_id)
        const currentBranchStock = resolveBranchProductStock({
            productId: item.product_id,
            branchId: oldSale.branch_id,
            branchStocks: branchStocksRes.data ?? [],
            fallbackProductStock: fb?.stock ?? 0,
        })
        stockByProductId.set(item.product_id, {
            currentStock: currentBranchStock,
            name: item.name || fb?.name || 'Produk',
        })
    }

    const oldSaleItems = ((oldSale.sale_items as unknown as DbSaleItem[]) ?? []).map((i) => ({
        product_id: i.product_id,
        quantity: Number(i.quantity),
        branch_stock_deducted: i.branch_stock_deducted ?? null,
    }))

    const stockValidation = validateSaleStockAvailability({
        requestedItems: verifiedItems,
        oldItems: oldSaleItems,
        stockByProductId,
    })

    if (!stockValidation.ok) {
        return { error: stockValidation.error }
    }

    const channel = ALLOWED_CHANNELS.includes(input.channel) ? input.channel : oldSale.channel
    const paymentMethod = ALLOWED_PAYMENT_METHODS.includes(input.payment_method)
        ? input.payment_method
        : oldSale.payment_method

    // Snapshot audit log
    const oldDataSnapshot = {
        channel: oldSale.channel,
        payment_method: oldSale.payment_method,
        total: oldSale.total,
        items: (oldSale.sale_items as unknown as DbSaleItem[])?.map((i) => ({
            product_id: i.product_id,
            name: i.products?.name ?? 'Item',
            quantity: i.quantity,
            price: i.price,
            cost_price: i.cost_price,
        })),
    }

    const newDataSnapshot = {
        channel,
        payment_method: paymentMethod,
        total: newTotal,
        items: verifiedItems.map((i) => ({
            product_id: i.product_id,
            name: i.name,
            quantity: i.quantity,
            price: i.price,
            cost_price: i.cost_price,
        })),
        edited_by_role: profile.role,
    }

    // 6. Coba eksekusi atomik melalui RPC Stored Procedure
    const { data: rpcResult, error: rpcError } = await supabase.rpc('update_sale_atomic', {
        p_sale_id: saleId,
        p_business_id: oldSale.business_id,
        p_user_id: user.id,
        p_channel: channel,
        p_payment_method: paymentMethod,
        p_total: newTotal,
        p_items: verifiedItems,
        p_old_data: oldDataSnapshot,
        p_new_data: newDataSnapshot,
        p_reason: input.reason?.trim() || null,
    })

    if (!rpcError && rpcResult?.success) {
        revalidatePath('/dashboard/penjualan/riwayat')
        revalidatePath('/dashboard/penjualan')
        revalidatePath('/dashboard/produk')
        revalidatePath('/dashboard/keuangan/neraca')
        revalidatePath('/dashboard/keuangan/laba-rugi')
        return { success: true }
    }

    // Hentikan eksekusi jika RPC mengembalikan error validasi/otorisasi/voided/stok tidak cukup
    // (fallback HANYA boleh dijalankan apabila fungsi RPC belum terpasang di skema DB: 42883 / PGRST202)
    if (rpcError && !shouldFallbackFromUpdateSaleRpc(rpcError)) {
        if (rpcError.code === 'P0001') {
            return { error: rpcError.message }
        }
        return { error: `Gagal mengedit transaksi: ${rpcError.message}` }
    }

    if (!rpcError && rpcResult && !rpcResult.success) {
        return { error: rpcResult.message || 'Gagal mengedit transaksi.' }
    }

    // 7. Fallback transaksi dengan kompensasi rollback jika RPC belum terpasang
    const admin = createAdminClient()

    // Update header (pastikan hanya transaksi yang belum voided)
    const { data: updatedHeader, error: updateError } = await admin
        .from('sales')
        .update({
            channel,
            payment_method: paymentMethod,
            total: newTotal,
            is_edited: true,
            updated_at: new Date().toISOString(),
        })
        .eq('id', saleId)
        .eq('business_id', profile.business_id)
        .neq('status', 'voided')
        .select('id')
        .maybeSingle()

    if (updateError) {
        return { error: `Gagal update transaksi: ${updateError.message}` }
    }

    if (!updatedHeader) {
        return { error: 'Transaksi yang sudah dibatalkan (voided) tidak dapat diedit.' }
    }

    // Hapus sale_items lama
    const { error: deleteItemsError } = await admin
        .from('sale_items')
        .delete()
        .eq('sale_id', saleId)

    if (deleteItemsError) {
        // Rollback header
        await admin.from('sales').update({
            channel: oldSale.channel,
            payment_method: oldSale.payment_method,
            total: oldSale.total,
        }).eq('id', saleId).eq('business_id', profile.business_id)
        return { error: `Gagal hapus item lama: ${deleteItemsError.message}` }
    }

    // Insert item baru yang sudah diverifikasi
    const { error: insertItemsError } = await admin.from('sale_items').insert(
        verifiedItems.map((item) => ({
            sale_id: saleId,
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.price,
            cost_price: item.cost_price,
            subtotal: item.subtotal,
        }))
    )

    if (insertItemsError) {
        // Rollback kompensasi darurat: kembalikan data item lama
        const restorePayload = ((oldSale.sale_items as unknown as DbSaleItem[]) ?? []).map((i) => ({
            sale_id: saleId,
            product_id: i.product_id,
            quantity: i.quantity,
            price: i.price,
            cost_price: i.cost_price,
            subtotal: i.subtotal || (i.price * i.quantity),
        }))
        if (restorePayload.length > 0) {
            await admin.from('sale_items').insert(restorePayload)
        }
        await admin.from('sales').update({
            channel: oldSale.channel,
            payment_method: oldSale.payment_method,
            total: oldSale.total,
        }).eq('id', saleId)

        return { error: `Gagal simpan item baru (transaksi dikembalikan ke kondisi awal): ${insertItemsError.message}` }
    }

    // Tulis audit log
    const { error: logError } = await admin.from('sale_edit_logs').insert({
        sale_id: saleId,
        business_id: oldSale.business_id,
        edited_by: user.id,
        old_data: oldDataSnapshot,
        new_data: newDataSnapshot,
        reason: input.reason?.trim() || null,
    })

    if (logError) {
        console.error('Audit log failed to record in fallback:', logError)
    }

    revalidatePath('/dashboard/penjualan/riwayat')
    return { success: true }
}

export async function getSaleAuditLogs(saleId: string) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: logs, error } = await supabase
        .from('sale_edit_logs')
        .select('id, sale_id, edited_by, edited_at, old_data, new_data, reason, profiles(full_name, role)')
        .eq('sale_id', saleId)
        .order('edited_at', { ascending: false })

    if (error) {
        return { error: `Gagal memuat audit log: ${error.message}` }
    }

    return { logs: (logs as unknown as Record<string, unknown>[]) ?? [] }
}

export async function voidSale(saleId: string, reason?: string) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, branch_id, business_id')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil pengguna tidak ditemukan.' }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    // Otorisasi: HANYA OWNER yang berhak membatalkan/void transaksi
    if (profile.role !== 'owner') {
        return { error: 'Akses ditolak: Hanya pemilik bisnis (Owner) yang berhak membatalkan (void) transaksi.' }
    }

    const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select('id, business_id, branch_id, status')
        .eq('id', saleId)
        .single()

    if (saleError || !sale) {
        return { error: 'Transaksi tidak ditemukan atau Anda tidak berhak mengaksesnya.' }
    }

    if (sale.business_id !== profile.business_id) {
        return { error: 'Akses ditolak: Transaksi tidak terdaftar di bisnis Anda.' }
    }

    if (sale.status === 'voided') {
        return { error: 'Transaksi sudah dibatalkan sebelumnya.' }
    }

    const voidReason = reason?.trim() || 'Pembatalan transaksi oleh Owner'

    // Panggil RPC void_sale_atomic
    const { data: rpcResult, error: rpcError } = await supabase.rpc('void_sale_atomic', {
        p_sale_id: saleId,
        p_business_id: profile.business_id,
        p_user_id: user.id,
        p_reason: voidReason,
    })

    if (rpcError) {
        return { error: `Gagal membatalkan transaksi: ${rpcError.message}` }
    }

    if (!rpcResult?.success) {
        return { error: rpcResult?.message || 'Gagal membatalkan transaksi' }
    }

    revalidatePath('/dashboard/penjualan/riwayat')
    revalidatePath('/dashboard/penjualan')
    revalidatePath('/dashboard/produk')
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/keuangan/arus-kas')
    revalidatePath('/dashboard/keuangan/laba-rugi')
    revalidatePath('/dashboard/keuangan/neraca')
    revalidatePath('/dashboard/keuangan/utang-piutang')
    return { success: true }
}

export async function deleteSale(saleId: string, reason?: string) {
    // Alih-alih HARD DELETE yang merusak integritas audit dan sejarah,
    // alihkan secara aman ke void_sale_atomic (Soft Void)
    return voidSale(saleId, reason || 'Penghapusan/Void transaksi oleh Owner')
}

export async function recordSalePayment(
    saleId: string,
    input: {
        amount: number
        payment_method: string
        account_id?: string | null
        payment_date?: string
        notes?: string
        idempotency_key?: string
    }
) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, branch_id, business_id')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil pengguna tidak ditemukan.' }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    if (!input.amount || input.amount <= 0) {
        return { error: 'Nominal pembayaran harus lebih besar dari 0.' }
    }

    const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select('id, business_id, branch_id, total, paid_amount, payment_status, status')
        .eq('id', saleId)
        .single()

    if (saleError || !sale) {
        return { error: 'Transaksi tidak ditemukan.' }
    }

    if (sale.business_id !== profile.business_id) {
        return { error: 'Akses ditolak: Transaksi bukan milik bisnis Anda.' }
    }

    if (sale.status === 'voided') {
        return { error: 'Tidak dapat mencatat pembayaran pada transaksi yang sudah dibatalkan (voided).' }
    }

    if (sale.payment_status === 'paid') {
        return { error: 'Transaksi ini sudah lunas.' }
    }

    // Role check: Pegawai hanya boleh di cabangnya sendiri
    if (profile.role !== 'owner' && sale.branch_id !== profile.branch_id) {
        return { error: 'Anda hanya berhak mencatat pembayaran di cabang Anda sendiri.' }
    }

    const sisa = Number(sale.total) - Number(sale.paid_amount || 0)
    if (input.amount > sisa + 0.01) {
        return { error: `Nominal pembayaran (Rp${input.amount.toLocaleString('id-ID')}) melebihi sisa tagihan (Rp${sisa.toLocaleString('id-ID')}).` }
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    const idempotencyKey = (input.idempotency_key && UUID_REGEX.test(input.idempotency_key))
        ? input.idempotency_key
        : crypto.randomUUID()

    const cleanPaymentDate = input.payment_date
        ? input.payment_date.split('T')[0]
        : new Date().toISOString().split('T')[0]

    const { data: rpcResult, error: rpcError } = await supabase.rpc('record_sale_payment_atomic', {
        p_sale_id: saleId,
        p_business_id: profile.business_id,
        p_user_id: user.id,
        p_recorded_by: user.id,
        p_amount: input.amount,
        p_payment_method: input.payment_method || 'cash',
        p_account_id: input.account_id || null,
        p_payment_date: cleanPaymentDate,
        p_notes: input.notes?.trim() || null,
        p_idempotency_key: idempotencyKey,
    })

    if (rpcError) {
        return { error: `Gagal mencatat pembayaran: ${rpcError.message}` }
    }

    if (!rpcResult?.success) {
        return { error: rpcResult?.message || 'Gagal memproses pembayaran' }
    }

    revalidatePath('/dashboard/penjualan/riwayat')
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/keuangan/arus-kas')
    revalidatePath('/dashboard/keuangan/utang-piutang')
    revalidatePath('/dashboard/keuangan/kas-rekening')
    revalidatePath('/dashboard/keuangan/neraca')
    return { success: true, payment: rpcResult }
}

export async function getSalePayments(saleId: string) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: payments, error } = await supabase
        .from('sale_payments')
        .select('id, payment_number, amount, payment_method, payment_date, notes, created_at, profiles(full_name), financial_accounts(name)')
        .eq('sale_id', saleId)
        .order('payment_date', { ascending: true })

    if (error) {
        return { error: `Gagal memuat riwayat pembayaran: ${error.message}` }
    }

    return { payments: payments ?? [] }
}

