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

    // Ambil daftar cabang dan data transaksi secara paralel
    const [branchesRes, salesRes] = await Promise.all([
        isOwner
            ? supabase.from('branches').select('id, name').order('name')
            : Promise.resolve({ data: [] }),
        supabase
            .from('sales')
            .select(
                'id, transaction_date, channel, payment_method, total, is_edited, branch_id, user_id, branches(name), sale_items(product_id, quantity, price, cost_price, products(name, unit))'
            )
            .order('transaction_date', { ascending: false })
            .limit(200),
    ])

    const branches = branchesRes.data
    let sales: any[] | null = salesRes.data
    const salesErr = salesRes.error

    if (salesErr && salesErr.code === '42703') {
        const { data: salesFallback } = await supabase
            .from('sales')
            .select(
                'id, transaction_date, channel, payment_method, total, is_edited, branch_id, user_id, branches(name), sale_items(product_id, quantity, price, cost_price, products(name))'
            )
            .order('transaction_date', { ascending: false })
            .limit(200)
        sales = salesFallback
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