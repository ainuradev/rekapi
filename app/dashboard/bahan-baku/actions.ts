'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type PurchaseItemInput = {
    item_name: string
    quantity: number
    price: number
}

export async function addPurchase(payload: {
    branch_id: string
    supplier?: string
    purchase_date: string
    items: PurchaseItemInput[]
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

    if (!payload.branch_id) return { error: 'Pilih cabang terlebih dahulu.' }
    if (!payload.purchase_date) return { error: 'Tanggal pembelian wajib diisi.' }
    if (!payload.items || payload.items.length === 0) {
        return { error: 'Tambahkan minimal 1 bahan baku.' }
    }

    const validatedItems = payload.items.map((item) => {
        const qty = Number(item.quantity) || 0
        const price = Number(item.price) || 0
        return {
            item_name: item.item_name.trim(),
            quantity: qty,
            price: price,
            subtotal: qty * price,
        }
    })

    const invalidItem = validatedItems.find((i) => !i.item_name || i.quantity <= 0 || i.price <= 0)
    if (invalidItem) {
        return { error: 'Pastikan nama item, kuantitas, dan harga diisi dengan benar (> 0).' }
    }

    const total = validatedItems.reduce((sum, i) => sum + i.subtotal, 0)

    // 1. Insert header
    const { data: purchase, error: purchaseError } = await supabase
        .from('purchases')
        .insert({
            business_id: profile.business_id,
            branch_id: payload.branch_id,
            supplier: payload.supplier?.trim() || null,
            purchase_date: payload.purchase_date,
            total,
        })
        .select('id')
        .single()

    if (purchaseError || !purchase) {
        return { error: purchaseError?.message || 'Gagal menyimpan header pembelian.' }
    }

    // 2. Insert items
    const itemsToInsert = validatedItems.map((item) => ({
        purchase_id: purchase.id,
        item_name: item.item_name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.subtotal,
    }))

    const { error: itemsError } = await supabase.from('purchase_items').insert(itemsToInsert)

    if (itemsError) {
        // Rollback purchase if items fail
        await supabase.from('purchases').delete().eq('id', purchase.id)
        return { error: itemsError.message }
    }

    revalidatePath('/dashboard/bahan-baku')
    revalidatePath('/dashboard')
    return { success: true }
}

export async function deletePurchase(purchaseId: string) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'owner') {
        return { error: 'Hanya Owner yang dapat menghapus data pembelian.' }
    }

    const { error } = await supabase.from('purchases').delete().eq('id', purchaseId)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/bahan-baku')
    revalidatePath('/dashboard')
    return { success: true }
}
