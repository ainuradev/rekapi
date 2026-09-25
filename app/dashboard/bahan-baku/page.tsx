import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BahanBakuClient from './bahan-baku-client'

export default async function BahanBakuPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, business_id')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'owner') {
        redirect('/dashboard')
    }

    const { data: branches } = await supabase
        .from('branches')
        .select('id, name')
        .order('name')

    const { data: purchases } = await supabase
        .from('purchases')
        .select(`
            id,
            branch_id,
            supplier,
            purchase_date,
            total,
            created_at,
            branches (name),
            purchase_items (id, item_name, quantity, price, subtotal)
        `)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false })

    return (
        <BahanBakuClient
            branches={branches ?? []}
            initialPurchases={(purchases as any) ?? []}
        />
    )
}
