'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type EditItem = {
    product_id: string
    name: string
    quantity: number
    price: number
    cost_price: number
}

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
        .select('role, branch_id')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil pengguna tidak ditemukan.' }

    // Ambil data sale + item LAMA dulu, sebelum diubah — ini yang disimpan
    // sebagai old_data di audit log.
    const { data: oldSale, error: oldSaleError } = await supabase
        .from('sales')
        .select('id, channel, payment_method, total, branch_id, user_id, sale_items(product_id, quantity, price, cost_price, subtotal, products(name))')
        .eq('id', saleId)
        .single()

    if (oldSaleError || !oldSale) {
        return { error: 'Transaksi tidak ditemukan atau Anda tidak berhak mengaksesnya.' }
    }

    // Validasi hak akses cabang untuk non-owner:
    if (profile.role !== 'owner' && oldSale.branch_id !== profile.branch_id) {
        return { error: 'Anda hanya berhak mengedit transaksi di cabang Anda sendiri.' }
    }

    if (!input.items || input.items.length === 0) {
        return { error: 'Item transaksi tidak boleh kosong.' }
    }

    // Amankan HPP: pegawai tidak boleh memanipulasi cost_price
    const oldCostMap = new Map<string, number>()
    for (const oldItem of (oldSale.sale_items as any[]) ?? []) {
        oldCostMap.set(oldItem.product_id, oldItem.cost_price ?? 0)
    }

    const sanitizedItems = input.items.map((item) => ({
        ...item,
        cost_price: profile.role === 'owner' ? item.cost_price : (oldCostMap.get(item.product_id) ?? item.cost_price ?? 0),
    }))

    const newTotal = sanitizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0)

    // ── Semua TULIS pakai admin client (service_role) ─────────────────────
    // Ini memastikan DELETE sale_items tidak bisa diblokir diam-diam oleh
    // RLS. Otorisasi user sudah dilakukan di atas via supabase user client.
    const admin = createAdminClient()

    // Update header sale
    const { error: updateError } = await admin
        .from('sales')
        .update({
            channel: input.channel,
            payment_method: input.payment_method,
            total: newTotal,
            is_edited: true,
            updated_at: new Date().toISOString(),
        })
        .eq('id', saleId)

    if (updateError) {
        return { error: `Gagal update transaksi: ${updateError.message}` }
    }

    // Hapus SEMUA sale_items lama — admin client menjamin benar-benar terhapus
    // dan tidak diblokir RLS secara diam-diam (root cause bug duplikasi).
    const { error: deleteItemsError } = await admin
        .from('sale_items')
        .delete()
        .eq('sale_id', saleId)

    if (deleteItemsError) {
        return { error: `Gagal hapus item lama: ${deleteItemsError.message}` }
    }

    // Insert item baru (bersih, tanpa duplikat)
    const { error: insertItemsError } = await admin.from('sale_items').insert(
        sanitizedItems.map((item) => ({
            sale_id: saleId,
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.price,
            cost_price: item.cost_price,
            subtotal: item.price * item.quantity,
        }))
    )

    if (insertItemsError) {
        return { error: `Gagal simpan item baru: ${insertItemsError.message}` }
    }

    // Tulis audit log
    const { error: logError } = await admin.from('sale_edit_logs').insert({
        sale_id: saleId,
        edited_by: user.id,
        old_data: {
            channel: oldSale.channel,
            payment_method: oldSale.payment_method,
            total: oldSale.total,
            items: (oldSale.sale_items as any[])?.map((i) => ({
                product_id: i.product_id,
                name: i.products?.name ?? 'Item',
                quantity: i.quantity,
                price: i.price,
            })),
        },
        new_data: {
            channel: input.channel,
            payment_method: input.payment_method,
            total: newTotal,
            items: sanitizedItems.map((i) => ({
                product_id: i.product_id,
                name: i.name,
                quantity: i.quantity,
                price: i.price,
            })),
        },
        reason: input.reason?.trim() || null,
    })

    if (logError) {
        return { error: `Transaksi berhasil diubah TAPI audit log gagal tersimpan: ${logError.message}` }
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

    return { logs: (logs as any) ?? [] }
}

export async function deleteSale(saleId: string) {
    // ── Step 1: Verifikasi sesi & profil user (user client, dibatasi RLS) ─
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, branch_id')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil pengguna tidak ditemukan.' }

    // ── Step 2: Baca sale untuk validasi kepemilikan cabang ───────────────
    const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select('id, branch_id')
        .eq('id', saleId)
        .single()

    if (saleError || !sale) {
        return { error: 'Transaksi tidak ditemukan atau Anda tidak berhak mengaksesnya.' }
    }

    // ── Step 3: Validasi otorisasi ─────────────────────────────────────────
    if (profile.role !== 'owner' && sale.branch_id !== profile.branch_id) {
        return { error: 'Anda hanya berhak menghapus transaksi di cabang Anda sendiri.' }
    }

    // ── Step 4: Hapus pakai admin client agar tidak diblokir RLS ──────────
    // sale_items & sale_edit_logs ikut terhapus otomatis via ON DELETE CASCADE.
    const admin = createAdminClient()

    const { error: deleteError } = await admin
        .from('sales')
        .delete()
        .eq('id', saleId)

    if (deleteError) {
        return { error: `Gagal menghapus transaksi: ${deleteError.message}` }
    }

    revalidatePath('/dashboard/penjualan/riwayat')
    return { success: true }
}
