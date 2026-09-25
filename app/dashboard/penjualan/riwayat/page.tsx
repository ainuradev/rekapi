import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RiwayatClient from './riwayat-client'

export default async function RiwayatPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, branch_id, branches(name)')
        .eq('id', user.id)
        .single()

    const isOwner = profile?.role === 'owner'

    // Ambil daftar cabang jika owner (untuk dropdown switcher cabang)
    const { data: branches } = isOwner
        ? await supabase.from('branches').select('id, name').order('name')
        : { data: [] }

    // RLS otomatis membatasi: pegawai cuma lihat transaksi cabangnya sendiri,
    // owner lihat semua cabang. Tidak perlu filter manual di sini.
    let sales: any[] | null = null
    const { data: salesWithUnit, error: salesErr } = await supabase
        .from('sales')
        .select(
            'id, transaction_date, channel, payment_method, total, is_edited, branch_id, user_id, branches(name), sale_items(product_id, quantity, price, cost_price, products(name, unit))'
        )
        .order('transaction_date', { ascending: false })
        .limit(200)

    if (salesErr && salesErr.code === '42703') {
        const { data: salesFallback } = await supabase
            .from('sales')
            .select(
                'id, transaction_date, channel, payment_method, total, is_edited, branch_id, user_id, branches(name), sale_items(product_id, quantity, price, cost_price, products(name))'
            )
            .order('transaction_date', { ascending: false })
            .limit(200)
        sales = salesFallback
    } else {
        sales = salesWithUnit
    }

    return (
        <RiwayatClient
            sales={(sales as any) ?? []}
            branches={branches ?? []}
            currentUserId={user.id}
            isOwner={isOwner}
            userBranchName={(profile as any)?.branches?.name ?? null}
        />
    )
}