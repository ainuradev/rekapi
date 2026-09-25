import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import KasirClient from './kasir-client'

export default async function PenjualanPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('branch_id, role, business_id')
        .eq('id', user.id)
        .single()

    // Get business data
    const { data: business } = await supabase
        .from('businesses')
        .select('name, address, phone')
        .eq('id', profile?.business_id)
        .single()

    let products: any[] | null = null
    const { data: prodsWithStock, error: stockErr } = await supabase
        .from('products')
        .select('id, name, selling_price, cost_price, stock, unit')
        .eq('status', 'aktif')
        .order('name')

    if (stockErr && stockErr.code === '42703') {
        const { data: prodsFallback } = await supabase
            .from('products')
            .select('id, name, selling_price, cost_price')
            .eq('status', 'aktif')
            .order('name')
        products = prodsFallback
    } else {
        products = prodsWithStock
    }

    const { data: branches } = await supabase
        .from('branches')
        .select('id, name')
        .order('name')

    return (
        <KasirClient
            products={products ?? []}
            branches={branches ?? []}
            fixedBranchId={profile?.branch_id ?? null}
            businessName={business?.name ?? 'Rekapin'}
            businessAddress={business?.address}
            businessPhone={business?.phone}
            userName={user.email?.split('@')[0] ?? 'Kasir'}
        />
    )
}