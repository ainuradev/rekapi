'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { checkActiveSubscription } from '@/lib/subscription-access'
import {
    resolveBranchProductStock,
    validateSaleStockAvailability,
} from '@/lib/sale-stock-integrity'

type CartItem = {
    product_id: string
    name: string
    quantity: number
    price: number
    cost_price: number
}

export async function getCustomersForPOS() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id')
        .eq('id', user.id)
        .single()

    if (!profile?.business_id) return []

    const [custResult, { data: receivables }] = await Promise.all([
        supabase
            .from('customers')
            .select('id, name, phone, receivable_limit, status')
            .eq('business_id', profile.business_id)
            .order('name'),
        supabase
            .from('receivables')
            .select('customer_id, total_amount, paid_amount')
            .eq('business_id', profile.business_id)
            .in('status', ['unpaid', 'partial']),
    ])

    type RawCust = {
        id: string
        name: string
        phone?: string | null
        receivable_limit?: number | null
        status?: string | null
    }

    let rawCustomers: RawCust[] | null = custResult.data as RawCust[] | null
    if (custResult.error) {
        const { data: fallbackCustomers } = await supabase
            .from('customers')
            .select('id, name, phone')
            .eq('business_id', profile.business_id)
            .order('name')
        rawCustomers = fallbackCustomers as RawCust[] | null
    }

    const recMap = new Map<string, number>()
    for (const r of receivables ?? []) {
        if (!r.customer_id) continue
        const balance = Math.max(0, Number(r.total_amount || 0) - Number(r.paid_amount || 0))
        recMap.set(r.customer_id, (recMap.get(r.customer_id) ?? 0) + balance)
    }

    return (rawCustomers ?? [])
        .filter((c) => c.status !== 'inactive')
        .map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            receivable_limit: Number(c.receivable_limit || 0),
            current_receivable: recMap.get(c.id) ?? 0,
        }))
}

export async function createSale(input: {
    branch_id: string
    channel: string
    payment_method: string
    items: CartItem[]
    idempotency_key?: string
    customer_id?: string
    payment_status?: 'paid' | 'partial' | 'unpaid'
    paid_amount?: number
    due_date?: string
    notes?: string
    account_id?: string
}) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, branch_id, role, is_active')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profile tidak ditemukan.' }

    if (profile.role === 'pegawai' && profile.is_active === false) {
        return { error: 'Akun kasir Anda sedang dinonaktifkan oleh Pemilik Bisnis.' }
    }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    // Kunci branch_id di server:
    // - Pegawai WAJIB pakai branch_id dari profilnya sendiri (fixed 1 cabang).
    // - Owner boleh pilih cabang manapun (atau default ke Cabang Utama jika konsolidasi 'all'), tapi tetap divalidasi harus milik business yang sama.
    let branchId = input.branch_id

    if (!branchId || branchId === 'all') {
        const { data: primaryB } = await supabase
            .from('branches')
            .select('id')
            .eq('business_id', profile.business_id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
        if (primaryB) {
            branchId = primaryB.id
        }
    }

    if (profile.role === 'pegawai') {
        if (!profile.branch_id) {
            return { error: 'Akun pegawai ini belum di-assign ke cabang manapun.' }
        }
        branchId = profile.branch_id
    }

    // Validasi cabang aktif untuk seluruh role (Owner maupun Pegawai)
    const { data: branchCheck } = await supabase
        .from('branches')
        .select('id, name, status')
        .eq('id', branchId)
        .eq('business_id', profile.business_id)
        .single()

    if (!branchCheck) return { error: 'Cabang tidak valid.' }
    if (branchCheck.status !== 'active') {
        return { error: `Cabang "${branchCheck.name}" sedang nonaktif. Transaksi kasir tidak dapat dilakukan di cabang nonaktif.` }
    }

    if (!input.items || input.items.length === 0) {
        return { error: 'Keranjang masih kosong.' }
    }

    // Validasi kuantitas setiap item
    for (const item of input.items) {
        if (!item.product_id || typeof item.quantity !== 'number' || isNaN(item.quantity) || !Number.isFinite(item.quantity) || item.quantity <= 0) {
            return { error: 'Format item atau kuantitas produk tidak valid (> 0).' }
        }
    }

    // Deduplikasi item per product_id agar duplikasi baris produk tidak mem-bypass batas stok
    const mergedCartMap = new Map<string, CartItem>()
    for (const item of input.items) {
        const existing = mergedCartMap.get(item.product_id)
        if (existing) {
            existing.quantity = Math.round((existing.quantity + item.quantity) * 100) / 100
        } else {
            mergedCartMap.set(item.product_id, {
                ...item,
                quantity: Math.round(item.quantity * 100) / 100,
            })
        }
    }
    const normalizedItems = Array.from(mergedCartMap.values())

    const now = new Date()
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString()
    const invoiceNumber = `INV/${datePart}/${randomSuffix}`

    // 1. Pengecekan Idempotensi terlebih dahulu agar retry jaringan dari transaksi yang sudah komit tetap aman
    if (input.idempotency_key) {
        const { data: existingSale } = await supabase
            .from('sales')
            .select('id, invoice_number')
            .eq('business_id', profile.business_id)
            .eq('idempotency_key', input.idempotency_key)
            .maybeSingle()

        if (existingSale) {
            return {
                success: true,
                saleId: existingSale.id,
                invoiceNumber: existingSale.invoice_number ?? invoiceNumber,
                isDuplicate: true,
            }
        }
    }

    const productIds = normalizedItems.map((i) => i.product_id)

    // Verifikasi harga, status, & stok cabang produk resmi langsung dari database server
    const [prodRes, branchStocksRes] = await Promise.all([
        supabase
            .from('products')
            .select('id, name, selling_price, status, stock')
            .eq('business_id', profile.business_id)
            .in('id', productIds),
        supabase
            .from('product_branch_stocks')
            .select('product_id, branch_id, stock')
            .eq('business_id', profile.business_id)
            .in('product_id', productIds),
    ])

    let dbProducts: Array<{ id: string; name: string; selling_price: number; status: string; stock?: number | null }> | null =
        prodRes.data as Array<{ id: string; name: string; selling_price: number; status: string; stock?: number | null }> | null
    let prodError = prodRes.error

    if (prodError && prodError.code === '42703') {
        const fallbackProd = await supabase
            .from('products')
            .select('id, name, selling_price, status')
            .eq('business_id', profile.business_id)
            .in('id', productIds)
        dbProducts = fallbackProd.data as typeof dbProducts
        prodError = fallbackProd.error
    }

    if (prodError || !dbProducts) {
        return { error: 'Gagal memverifikasi produk: ' + (prodError?.message ?? '') }
    }

    if (branchStocksRes.error) {
        return { error: 'Gagal memeriksa ketersediaan stok cabang: ' + branchStocksRes.error.message }
    }

    const productMap = new Map(dbProducts.map((p) => [p.id, p]))
    const stockByProductId = new Map<string, { currentStock: number; name?: string }>()

    for (const item of normalizedItems) {
        const dbProd = productMap.get(item.product_id)
        if (!dbProd) {
            return { error: `Produk tidak ditemukan atau bukan milik bisnis Anda.` }
        }
        if (dbProd.status !== 'aktif') {
            return { error: `Produk "${dbProd.name}" berstatus nonaktif dan tidak dapat dijual.` }
        }

        const currentBranchStock = resolveBranchProductStock({
            productId: dbProd.id,
            branchId,
            branchStocks: branchStocksRes.data ?? [],
            fallbackProductStock: Number(dbProd.stock ?? 0),
        })
        stockByProductId.set(dbProd.id, {
            currentStock: currentBranchStock,
            name: dbProd.name,
        })
    }

    // Validasi Ketat Ketersediaan Stok Cabang (No Oversell)
    const stockValidation = validateSaleStockAvailability({
        requestedItems: normalizedItems,
        oldItems: [],
        stockByProductId,
    })

    if (!stockValidation.ok) {
        return { error: stockValidation.error }
    }

    // Hitung subtotal dan total menggunakan data harga resmi server
    let total = 0
    const verifiedItems: Array<{
        product_id: string
        quantity: number
        price: number
        cost_price: number
        subtotal: number
    }> = []

    for (const item of normalizedItems) {
        const dbProd = productMap.get(item.product_id)!
        const price = Number(dbProd.selling_price)
        const subtotal = Math.round(price * item.quantity * 100) / 100

        total += subtotal
        verifiedItems.push({
            product_id: item.product_id,
            quantity: item.quantity,
            price,
            cost_price: 0,
            subtotal,
        })
    }

    total = Math.round(total * 100) / 100

    // ATURAN 3.B.1 & 3.B.5: Validasi Penjualan Kredit
    const paymentStatus = input.payment_status || 'paid'
    let realPaidAmount = total
    if (paymentStatus === 'unpaid') {
        realPaidAmount = 0
    } else if (paymentStatus === 'partial') {
        realPaidAmount = Math.max(0, Number(input.paid_amount || 0))
        if (realPaidAmount >= total) {
            realPaidAmount = total
        }
    }

    if (paymentStatus in ['unpaid', 'partial'] || paymentStatus === 'unpaid' || paymentStatus === 'partial') {
        if (!input.customer_id) {
            return { error: 'Penjualan kredit / tempo WAJIB memilih pelanggan teridentifikasi.' }
        }
    }

    // 2. Eksekusi transaksi atomik melalui Stored Procedure PostgreSQL (RPC)
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_sale_atomic', {
        p_business_id: profile.business_id,
        p_branch_id: branchId,
        p_user_id: user.id,
        p_channel: input.channel,
        p_payment_method: input.payment_method,
        p_total: total,
        p_items: verifiedItems,
        p_idempotency_key: input.idempotency_key || null,
        p_invoice_number: invoiceNumber,
        p_customer_id: input.customer_id || null,
        p_payment_status: paymentStatus,
        p_paid_amount: realPaidAmount,
        p_due_date: input.due_date || null,
        p_notes: input.notes?.trim() || null,
        p_account_id: input.account_id || null,
    })

    if (rpcError) {
        if (rpcError.code === 'P0001') {
            return { error: rpcError.message }
        }
        return { error: `Gagal memproses transaksi: ${rpcError.message}` }
    }

    if (!rpcResult?.sale_id) {
        return { error: rpcResult?.message || 'Transaksi gagal disimpan oleh server.' }
    }

    revalidatePath('/dashboard/penjualan')
    revalidatePath('/dashboard/penjualan/riwayat')
    revalidatePath('/dashboard/produk')
    revalidatePath('/dashboard/keuangan/neraca')
    revalidatePath('/dashboard/keuangan/utang-piutang')
    revalidatePath('/dashboard/keuangan/kas-rekening')

    return {
        success: true,
        saleId: rpcResult.sale_id,
        invoiceNumber,
        isDuplicate: rpcResult.is_duplicate ?? false,
        paymentStatus: rpcResult.payment_status ?? paymentStatus,
        paidAmount: rpcResult.paid_amount ?? realPaidAmount,
        unpaidBalance: rpcResult.unpaid_balance ?? (total - realPaidAmount),
    }
}