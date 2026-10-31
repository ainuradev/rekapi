'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveBranchId } from '@/lib/active-branch'
import { checkActiveSubscription } from '@/lib/subscription-access'
import {
    authorizeBranchStockMutation,
    computeAggregateProductStock,
    initializeNewProductBranchStocks,
} from '@/lib/product-stock'

function isMissingRpcError(err: { code?: string | null } | null | undefined): boolean {
    const code = String(err?.code ?? '').trim().toUpperCase()
    return code === '42883' || code === 'PGRST202'
}

export async function addProduct(formData: FormData) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, branch_id, role')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profile tidak ditemukan.' }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const name = String(formData.get('name') ?? '').trim()
    const sellingPrice = Number(formData.get('selling_price'))
    const rawCategory = String(formData.get('category') ?? '').trim().toLowerCase()
    const validCategories = ['makanan', 'minuman', 'lainnya']
    const category = validCategories.includes(rawCategory) ? rawCategory : 'makanan'

    // cost_price cuma dibaca kalau owner yang ngisi form (field-nya disembunyikan
    // dari pegawai di UI). Kalau kosong/tidak ada, default 0 — dan trigger di DB
    // (trg_enforce_cost_price) akan tetap memaksa 0 kalau yang insert bukan owner,
    // jadi ini aman walau form-nya diakalin.
    const costPriceRaw = formData.get('cost_price')
    const costPrice = costPriceRaw ? Number(costPriceRaw) : 0

    const stockRaw = formData.get('stock')
    const hasInitialStockInput = stockRaw !== null && stockRaw !== ''
    const initialStock = hasInitialStockInput ? Math.max(0, Number(stockRaw) || 0) : 0

    const unitRaw = String(formData.get('unit') ?? '').trim().toLowerCase()
    const unit = unitRaw || 'pcs'

    if (!name) return { error: 'Nama produk wajib diisi.' }
    if (!sellingPrice || sellingPrice <= 0) return { error: 'Harga jual harus lebih dari 0.' }

    // Tentukan cabang target penerima stok awal (jika initialStock > 0):
    // Prioritaskan branch_id eksplisit di form -> cabang pegawai -> cookie cabang aktif -> cabang pertama/utama.
    const formBranchId = String(formData.get('branch_id') ?? '').trim()
    const activeBranchCookie = await getActiveBranchId()
    const preferredBranchId =
        profile.role !== 'owner' && profile.branch_id
            ? profile.branch_id
            : formBranchId && formBranchId !== 'all'
            ? formBranchId
            : activeBranchCookie && activeBranchCookie !== 'all'
            ? activeBranchCookie
            : null

    const { data: branches } = await supabase
        .from('branches')
        .select('id')
        .eq('business_id', profile.business_id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })

    const branchList = branches ?? []
    const initPlan = initializeNewProductBranchStocks(initialStock, branchList, preferredBranchId)

    const payload: {
        business_id: string
        name: string
        selling_price: number
        cost_price: number
        category: string | null
        status: string
        unit?: string
        stock?: number
    } = {
        business_id: profile.business_id,
        name,
        selling_price: sellingPrice,
        cost_price: costPrice,
        category,
        status: 'aktif',
        unit,
    }

    // Jika bisnis memiliki cabang dan stok awal > 0, insert produk dengan stock = 0 terlebih dahulu
    // lalu set stok ke 1 cabang target agar tidak pernah tergandakan ke seluruh cabang.
    if (hasInitialStockInput) {
        payload.stock = initPlan.targetBranchId && initialStock > 0 ? 0 : initialStock
    }

    let insertedProductId: string | null = null
    const insertRes = await supabase
        .from('products')
        .insert(payload)
        .select('id')
        .single()

    let error = insertRes.error
    insertedProductId = insertRes.data?.id ?? null

    // Fallback jika migrasi 0008/0009 (kolom stock / unit) belum dijalankan di Supabase
    if (error && error.code === '42703') {
        const fallbackPayload = { ...payload }
        delete fallbackPayload.stock
        delete fallbackPayload.unit
        const retry = await supabase
            .from('products')
            .insert(fallbackPayload)
            .select('id')
            .single()
        error = retry.error
        insertedProductId = retry.data?.id ?? null
    }

    if (error) return { error: error.message }

    if (insertedProductId && initPlan.targetBranchId && initialStock > 0) {
        const stockRes = await updateBranchStock(insertedProductId, initPlan.targetBranchId, initialStock)
        if (stockRes?.error) {
            return { error: stockRes.error }
        }
    }

    revalidatePath('/dashboard/produk')
    revalidatePath('/dashboard/penjualan')
    revalidatePath('/dashboard/keuangan/neraca')
    return { success: true }
}

export async function updateProductUnit(productId: string, unit: string) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const cleanUnit = unit.trim().toLowerCase() || 'pcs'

    const { error } = await supabase
        .from('products')
        .update({ unit: cleanUnit })
        .eq('id', productId)

    if (error) {
        if (error.code === '42703') {
            return { error: 'Kolom unit belum dibuat di database. Jalankan migrasi 0009 di Supabase.' }
        }
        return { error: error.message }
    }

    revalidatePath('/dashboard/produk')
    revalidatePath('/dashboard/penjualan')
    return { success: true }
}

export async function updateCostPrice(productId: string, costPrice: number) {
    const supabase = await createClient()

    // RLS: update products cuma boleh owner — kalau pegawai coba panggil ini,
    // otomatis ditolak di level database.
    const { error } = await supabase
        .from('products')
        .update({ cost_price: costPrice })
        .eq('id', productId)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/produk')
    revalidatePath('/dashboard/keuangan/neraca')
    return { success: true }
}

export async function toggleProductStatus(productId: string, currentStatus: string) {
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

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const newStatus = currentStatus === 'aktif' ? 'nonaktif' : 'aktif'
    const { error } = await supabase
        .from('products')
        .update({ status: newStatus })
        .eq('id', productId)
        .eq('business_id', profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/produk')
    revalidatePath('/dashboard/penjualan')
    return { success: true }
}

/**
 * Mengatur stok ketika tidak ada filter cabang spesifik yang dipilih:
 * - Jika bisnis hanya memiliki 1 cabang, otomatis memperbarui stok cabang tunggal tersebut
 *   agar `product_branch_stocks` dan `products.stock` tetap sinkron.
 * - Jika bisnis memiliki lebih dari 1 cabang, menolak perubahan langsung pada agregat
 *   dan meminta pengguna memilih cabang spesifik terlebih dahulu.
 */
export type StockMutationResponse = {
    success?: boolean
    totalStock?: number
    error?: string
}

export async function updateStock(productId: string, stock: number): Promise<StockMutationResponse> {
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
        return { error: 'Hanya owner yang dapat mengubah stok produk.' }
    }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const numStock = Number(stock)
    if (!Number.isFinite(numStock) || numStock < 0) {
        return { error: 'Stok harus berupa angka valid (>= 0).' }
    }
    const cleanStock = Math.round(numStock * 100) / 100

    const { data: branches } = await supabase
        .from('branches')
        .select('id')
        .eq('business_id', profile.business_id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })

    const branchList = branches ?? []

    if (branchList.length === 1) {
        return updateBranchStock(productId, branchList[0].id, cleanStock)
    }

    if (branchList.length > 1) {
        return {
            error: 'Bisnis memiliki beberapa cabang. Silakan pilih cabang spesifik terlebih dahulu untuk mengubah stok fisik.',
        }
    }

    // Fallback hanya jika bisnis belum memiliki cabang sama sekali
    const { error } = await supabase
        .from('products')
        .update({ stock: cleanStock })
        .eq('id', productId)
        .eq('business_id', profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/produk')
    revalidatePath('/dashboard/penjualan')
    revalidatePath('/dashboard/keuangan/neraca')
    return { success: true }
}

/**
 * Mengubah stok produk pada cabang tertentu secara langsung (Direct Branch Stock)
 * dan menjaga `products.stock` tetap sinkron sebagai agregat total (`SUM` seluruh cabang).
 */
export async function updateBranchStock(
    productId: string,
    branchId: string,
    stock: number
): Promise<StockMutationResponse> {
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

    const authCheck = authorizeBranchStockMutation(profile, profile?.business_id ?? '', branchId)
    if (!authCheck.ok) {
        return { error: authCheck.error }
    }

    if (profile?.business_id) {
        const subCheck = await checkActiveSubscription(profile.business_id, supabase)
        if (!subCheck.allowed) {
            return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
        }
    }

    const numStock = Number(stock)
    if (!Number.isFinite(numStock) || numStock < 0) {
        return { error: 'Stok harus berupa angka valid (>= 0).' }
    }
    const cleanStock = Math.round(numStock * 100) / 100

    // 1. Jalur utama: Eksekusi atomik melalui RPC set_product_branch_stock_atomic (Migrasi 0033)
    const { data: rpcResult, error: rpcError } = await supabase.rpc('set_product_branch_stock_atomic', {
        p_product_id: productId,
        p_branch_id: branchId,
        p_stock: cleanStock,
    })

    if (!rpcError && rpcResult?.success) {
        revalidatePath('/dashboard/produk')
        revalidatePath('/dashboard/penjualan')
        revalidatePath('/dashboard/keuangan/neraca')
        return { success: true, totalStock: Number(rpcResult.total_stock ?? cleanStock) }
    }

    if (rpcError && !isMissingRpcError(rpcError)) {
        return { error: rpcError.message }
    }

    // 2. Fallback kompatibilitas jika migrasi 0033 belum dijalankan di database lokal
    const [{ data: product, error: prodErr }, { data: branch, error: branchCheckErr }] = await Promise.all([
        supabase
            .from('products')
            .select('id')
            .eq('id', productId)
            .eq('business_id', profile!.business_id)
            .maybeSingle(),
        supabase
            .from('branches')
            .select('id')
            .eq('id', branchId)
            .eq('business_id', profile!.business_id)
            .maybeSingle(),
    ])

    if (prodErr || !product) {
        return { error: prodErr?.message || 'Produk tidak ditemukan pada bisnis Anda.' }
    }
    if (branchCheckErr || !branch) {
        return { error: branchCheckErr?.message || 'Cabang tidak ditemukan pada bisnis Anda.' }
    }

    const { error: upsertErr } = await supabase
        .from('product_branch_stocks')
        .upsert(
            {
                business_id: profile!.business_id,
                product_id: productId,
                branch_id: branchId,
                stock: cleanStock,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'product_id,branch_id' }
        )

    if (upsertErr) {
        return { error: upsertErr.message }
    }

    // Sinkronkan products.stock menjadi SUM seluruh cabang
    const { data: allBranchRows } = await supabase
        .from('product_branch_stocks')
        .select('branch_id, stock')
        .eq('product_id', productId)
        .eq('business_id', profile!.business_id)

    const aggregateStock = computeAggregateProductStock(
        (allBranchRows ?? []).map((r) => ({
            branch_id: r.branch_id,
            stock: Number(r.stock ?? 0),
        }))
    )

    await supabase
        .from('products')
        .update({ stock: aggregateStock, updated_at: new Date().toISOString() })
        .eq('id', productId)
        .eq('business_id', profile!.business_id)

    revalidatePath('/dashboard/produk')
    revalidatePath('/dashboard/penjualan')
    revalidatePath('/dashboard/keuangan/neraca')
    return { success: true, totalStock: aggregateStock }
}
