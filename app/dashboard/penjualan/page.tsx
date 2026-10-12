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

    // Ambil data bisnis, produk, cabang, dan stok cabang secara paralel
    const [
        { data: business },
        prodsResult,
        { data: branches },
        { data: branchStocks },
    ] = await Promise.all([
        supabase
            .from('businesses')
            .select('name, address, phone')
            .eq('id', profile?.business_id)
            .single(),
        supabase
            .from('products')
            .select('id, name, selling_price, cost_price, category, stock, unit')
            .eq('status', 'aktif')
            .order('name'),
        supabase
            .from('branches')
            .select('id, name')
            .order('name'),
        supabase
            .from('product_branch_stocks')
            .select('product_id, branch_id, stock'),
    ])

    let products: any[] | null = prodsResult.data
    if (prodsResult.error && prodsResult.error.code === '42703') {
        const { data: prodsFallback } = await supabase
            .from('products')
            .select('id, name, selling_price, cost_price, category')
            .eq('status', 'aktif')
            .order('name')
        products = prodsFallback
    }

    return (
        <KasirClient
            products={products ?? []}
            branches={branches ?? []}
            branchStocks={branchStocks ?? []}
            fixedBranchId={profile?.branch_id ?? null}
            businessName={business?.name ?? 'Rekapi'}
            businessAddress={business?.address}
            businessPhone={business?.phone}
            userName={user.email?.split('@')[0] ?? 'Kasir'}
        />
    )
}