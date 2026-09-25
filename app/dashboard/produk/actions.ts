'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function addProduct(formData: FormData) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profile tidak ditemukan.' }

    const name = String(formData.get('name') ?? '').trim()
    const sellingPrice = Number(formData.get('selling_price'))
    const category = String(formData.get('category') ?? '').trim() || null

    // cost_price cuma dibaca kalau owner yang ngisi form (field-nya disembunyikan
    // dari pegawai di UI). Kalau kosong/tidak ada, default 0 — dan trigger di DB
    // (trg_enforce_cost_price) akan tetap memaksa 0 kalau yang insert bukan owner,
    // jadi ini aman walau form-nya diakalin.
    const costPriceRaw = formData.get('cost_price')
    const costPrice = costPriceRaw ? Number(costPriceRaw) : 0

    const stockRaw = formData.get('stock')
    const stock = stockRaw !== null && stockRaw !== '' ? Number(stockRaw) : 0

    const unitRaw = String(formData.get('unit') ?? '').trim().toLowerCase()
    const unit = unitRaw || 'pcs'

    if (!name) return { error: 'Nama produk wajib diisi.' }
    if (!sellingPrice || sellingPrice <= 0) return { error: 'Harga jual harus lebih dari 0.' }

    const payload: Record<string, any> = {
        business_id: profile.business_id,
        name,
        selling_price: sellingPrice,
        cost_price: costPrice,
        category,
        status: 'aktif',
        unit,
    }

    if (stockRaw !== null && stockRaw !== '') {
        payload.stock = stock
    }

    let { error } = await supabase.from('products').insert(payload)

    // Fallback jika migrasi 0008/0009 (kolom stock / unit) belum dijalankan di Supabase
    if (error && error.code === '42703') {
        const fallbackPayload = { ...payload }
        delete fallbackPayload.stock
        delete fallbackPayload.unit
        const retry = await supabase.from('products').insert(fallbackPayload)
        error = retry.error
    }

    if (error) return { error: error.message }

    revalidatePath('/dashboard/produk')
    revalidatePath('/dashboard/penjualan')
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
    return { success: true }
}

export async function toggleProductStatus(productId: string, currentStatus: string) {
    const supabase = await createClient()

    const newStatus = currentStatus === 'aktif' ? 'nonaktif' : 'aktif'
    const { error } = await supabase
        .from('products')
        .update({ status: newStatus })
        .eq('id', productId)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/produk')
    return { success: true }
}

export async function updateStock(productId: string, stock: number) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // RLS: "owner manage products" sudah memastikan hanya owner yang bisa update.
    const { error } = await supabase
        .from('products')
        .update({ stock: Math.max(0, stock) })
        .eq('id', productId)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/produk')
    return { success: true }
}