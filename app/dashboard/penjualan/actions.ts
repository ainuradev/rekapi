'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type CartItem = {
    product_id: string
    name: string
    quantity: number
    price: number
    cost_price: number
}

export async function createSale(input: {
    branch_id: string
    channel: string
    payment_method: string
    items: CartItem[]
}) {
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

    // Kunci branch_id di server:
    // - Pegawai WAJIB pakai branch_id dari profilnya sendiri (fixed 1 cabang),
    //   walaupun client mengirim branch_id lain, ini diabaikan.
    // - Owner (branch_id null di profile) boleh pilih cabang manapun,
    //   tapi tetap divalidasi harus milik business yang sama.
    let branchId = input.branch_id

    if (profile.role === 'pegawai') {
        if (!profile.branch_id) {
            return { error: 'Akun pegawai ini belum di-assign ke cabang manapun.' }
        }
        branchId = profile.branch_id
    } else {
        const { data: branchCheck } = await supabase
            .from('branches')
            .select('id')
            .eq('id', branchId)
            .eq('business_id', profile.business_id)
            .single()

        if (!branchCheck) return { error: 'Cabang tidak valid.' }
    }

    if (!input.items || input.items.length === 0) {
        return { error: 'Keranjang masih kosong.' }
    }

    const total = input.items.reduce((sum, item) => sum + item.price * item.quantity, 0)

    const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
            business_id: profile.business_id,
            branch_id: branchId,
            user_id: user.id,
            channel: input.channel,
            payment_method: input.payment_method,
            total,
        })
        .select('id')
        .single()

    if (saleError || !sale) {
        return { error: saleError?.message ?? 'Gagal menyimpan transaksi.' }
    }

    const saleItemsPayload = input.items.map((item) => ({
        sale_id: sale.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.price,
        cost_price: item.cost_price, // snapshot HPP saat transaksi
        subtotal: item.price * item.quantity,
    }))

    const { error: itemsError } = await supabase.from('sale_items').insert(saleItemsPayload)

    if (itemsError) {
        return { error: `Sale tersimpan tapi item gagal: ${itemsError.message}` }
    }

    revalidatePath('/dashboard/penjualan')
    revalidatePath('/dashboard/penjualan/riwayat')

    return { success: true, saleId: sale.id }
}