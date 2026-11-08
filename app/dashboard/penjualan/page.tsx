import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getActiveBranchId } from '@/lib/active-branch'
import KasirClient from './kasir-client'

type RawProduct = {
    id: string
    name: string
    selling_price: number
    cost_price?: number | null
    category?: string | null
    stock?: number | null
    unit?: string | null
}

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

    const isOwner = profile?.role === 'owner'

    // Ambil data bisnis, produk, cabang, stok cabang, pelanggan, akun kas, dan piutang aktif secara paralel
    const [
        { data: business },
        prodsResult,
        { data: branches },
        { data: branchStocks },
        custResult,
        { data: accounts },
        receivablesResult,
    ] = await Promise.all([
        supabase
            .from('businesses')
            .select('name, address, phone, logo_url, qris_url')
            .eq('id', profile?.business_id)
            .single(),
        supabase
            .from(isOwner ? 'owner_products_view' : 'products')
            .select(
                isOwner
                    ? 'id, name, selling_price, cost_price, category, stock, unit'
                    : 'id, name, selling_price, category, stock, unit'
            )
            .eq('status', 'aktif')
            .order('name'),
        supabase
            .from('branches')
            .select('id, name, address, phone, status')
            .eq('business_id', profile?.business_id)
            .eq('status', 'active')
            .order('name'),
        supabase
            .from('product_branch_stocks')
            .select('product_id, branch_id, stock'),
        supabase
            .from('customers')
            .select('id, name, phone, receivable_limit, status')
            .eq('business_id', profile?.business_id)
            .order('name'),
        supabase
            .from('financial_accounts')
            .select('id, name, type, is_default_cash, is_default_bank')
            .eq('business_id', profile?.business_id)
            .order('name'),
        supabase
            .from('receivables')
            .select('customer_id, total_amount, paid_amount')
            .eq('business_id', profile?.business_id)
            .in('status', ['unpaid', 'partial']),
    ])

    let products: RawProduct[] | null = prodsResult.data as RawProduct[] | null
    // Fallback jika owner_products_view belum dibuat (42P01)
    if (prodsResult.error && prodsResult.error.code === '42P01') {
        const { data: prodsViewFallback } = await supabase
            .from('products')
            .select(
                isOwner
                    ? 'id, name, selling_price, cost_price, category, stock, unit'
                    : 'id, name, selling_price, category, stock, unit'
            )
            .eq('status', 'aktif')
            .order('name')
        products = prodsViewFallback as RawProduct[] | null
    } else if (prodsResult.error && prodsResult.error.code === '42703') {
        const { data: prodsFallback } = await supabase
            .from(isOwner ? 'owner_products_view' : 'products')
            .select(
                isOwner
                    ? 'id, name, selling_price, cost_price, category'
                    : 'id, name, selling_price, category'
            )
            .eq('status', 'aktif')
            .order('name')
        products = prodsFallback as RawProduct[] | null
    }

    // Format data pelanggan dan kalkulasi saldo piutang aktif
    type RawCustomer = {
        id: string
        name: string
        phone?: string | null
        receivable_limit?: number | null
        status?: string | null
    }

    let rawCustomers: RawCustomer[] | null = custResult?.data as RawCustomer[] | null
    if (custResult?.error) {
        console.warn('Fallback fetching customers in POS due to:', custResult.error.message)
        const { data: fallbackCustomers } = await supabase
            .from('customers')
            .select('id, name, phone')
            .eq('business_id', profile?.business_id)
            .order('name')
        rawCustomers = fallbackCustomers as RawCustomer[] | null
    }

    const recMap = new Map<string, number>()
    for (const r of receivablesResult?.data ?? []) {
        if (!r.customer_id) continue
        const balance = Math.max(0, Number(r.total_amount || 0) - Number(r.paid_amount || 0))
        recMap.set(r.customer_id, (recMap.get(r.customer_id) ?? 0) + balance)
    }

    const formattedCustomers = (rawCustomers ?? [])
        .filter((c) => c.status !== 'inactive')
        .map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            receivable_limit: Number(c.receivable_limit || 0),
            current_receivable: recMap.get(c.id) ?? 0,
        }))

    // Proteksi data sensitif HPP (P0-3 & Prioritas 2):
    // Jika bukan owner (role pegawai), jangan pernah kirim cost_price asli ke browser
    const sanitizedProducts = (products ?? []).map((p) => ({
        ...p,
        stock: Number(p.stock ?? 0),
        unit: p.unit || 'pcs',
        cost_price: isOwner ? Number(p.cost_price ?? 0) : 0,
    }))

    const activeBranchId = await getActiveBranchId()
    const primaryBranchId = (branches && branches.length > 0) ? branches[0].id : null
    const isTargetBranchActive = branches?.some((b) => b.id === activeBranchId)
    const effectiveBranchId = isTargetBranchActive
        ? activeBranchId
        : (profile?.branch_id && branches?.some((b) => b.id === profile.branch_id) ? profile.branch_id : primaryBranchId)

    return (
        <KasirClient
            key={effectiveBranchId ?? 'all'}
            products={sanitizedProducts}
            branches={branches ?? []}
            branchStocks={branchStocks ?? []}
            customers={formattedCustomers}
            accounts={accounts ?? []}
            fixedBranchId={isOwner ? (effectiveBranchId ?? null) : (profile?.branch_id ?? null)}
            businessName={business?.name ?? 'Rekapi'}
            businessAddress={business?.address ?? null}
            businessPhone={business?.phone ?? null}
            businessLogoUrl={business?.logo_url ?? null}
            businessQrisUrl={business?.qris_url ?? null}
            userName={user.email?.split('@')[0] ?? 'Kasir'}
        />
    )
}