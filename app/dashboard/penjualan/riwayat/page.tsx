import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getActiveBranchId } from '@/lib/active-branch'
import RiwayatClient from './riwayat-client'

export default async function RiwayatPage({
    searchParams,
}: {
    searchParams?: Promise<{
        start_date?: string
        end_date?: string
        branch?: string
    }>
}) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, branch_id, business_id, businesses(name), branches(name)')
        .eq('id', user.id)
        .single()

    const isOwner = profile?.role === 'owner'
    const activeBranchId = await getActiveBranchId()
    const params = searchParams ? await searchParams : undefined

    const effectiveBranchId = params?.branch
        ? (params.branch !== 'all' ? params.branch : 'all')
        : (activeBranchId && activeBranchId !== 'all' ? activeBranchId : 'all')

    let salesQuery = supabase
        .from('sales')
        .select(
            isOwner
                ? 'id, transaction_date, channel, payment_method, total, is_edited, branch_id, user_id, status, payment_status, paid_amount, due_date, notes, customer_id, customers(name, phone), branches(name), sale_items(product_id, quantity, branch_stock_deducted, price, cost_price, products(name, unit)), sale_payments(id, amount, payment_date)'
                : 'id, transaction_date, channel, payment_method, total, is_edited, branch_id, user_id, status, payment_status, paid_amount, due_date, notes, customer_id, customers(name, phone), branches(name), sale_items(product_id, quantity, branch_stock_deducted, price, products(name, unit)), sale_payments(id, amount, payment_date)'
        )
        .order('transaction_date', { ascending: false })

    if (isOwner && effectiveBranchId && effectiveBranchId !== 'all') {
        salesQuery = salesQuery.eq('branch_id', effectiveBranchId)
    }

    if (params?.start_date) {
        salesQuery = salesQuery.gte('transaction_date', `${params.start_date}T00:00:00+07:00`)
    }
    if (params?.end_date) {
        salesQuery = salesQuery.lte('transaction_date', `${params.end_date}T23:59:59.999+07:00`)
    }

    salesQuery = salesQuery.limit(params?.start_date || params?.end_date ? 1000 : 300)

    // Ambil daftar cabang, akun keuangan, stok cabang, katalog produk, dan data transaksi secara paralel
    const [branchesRes, accountsRes, branchStocksRes, catalogProdsRes, salesRes] = await Promise.all([
        isOwner
            ? supabase.from('branches').select('id, name').order('name')
            : Promise.resolve({ data: [] }),
        supabase.from('financial_accounts').select('id, name, type').order('name'),
        supabase
            .from('product_branch_stocks')
            .select('product_id, branch_id, stock')
            .eq('business_id', profile?.business_id),
        supabase
            .from(isOwner ? 'owner_products_view' : 'products')
            .select(
                isOwner
                    ? 'id, name, selling_price, cost_price, status, stock, unit'
                    : 'id, name, selling_price, status, stock, unit'
            )
            .eq('business_id', profile?.business_id)
            .order('name'),
        salesQuery,
    ])

    type RawCatalogProduct = {
        id: string
        name: string
        selling_price: number
        cost_price?: number | null
        status?: string | null
        stock?: number | null
        unit?: string | null
    }

    let rawCatalogProducts: RawCatalogProduct[] | null = catalogProdsRes.data as RawCatalogProduct[] | null
    if (catalogProdsRes.error && catalogProdsRes.error.code === '42P01') {
        const { data: fallbackProds } = await supabase
            .from('products')
            .select(
                isOwner
                    ? 'id, name, selling_price, cost_price, status, stock, unit'
                    : 'id, name, selling_price, status, stock, unit'
            )
            .eq('business_id', profile?.business_id)
            .order('name')
        rawCatalogProducts = fallbackProds as RawCatalogProduct[] | null
    } else if (catalogProdsRes.error && catalogProdsRes.error.code === '42703') {
        const { data: fallbackProds } = await supabase
            .from(isOwner ? 'owner_products_view' : 'products')
            .select(isOwner ? 'id, name, selling_price, cost_price, status' : 'id, name, selling_price, status')
            .eq('business_id', profile?.business_id)
            .order('name')
        rawCatalogProducts = fallbackProds as RawCatalogProduct[] | null
    }

    const sanitizedCatalogProducts = (rawCatalogProducts ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        selling_price: Number(p.selling_price ?? 0),
        cost_price: isOwner ? Number(p.cost_price ?? 0) : 0,
        status: p.status ?? 'aktif',
        stock: Number(p.stock ?? 0),
        unit: p.unit || 'pcs',
    }))

interface SaleItemWithProduct {
    product_id: string
    quantity: number
    branch_stock_deducted?: number | null
    price: number
    cost_price?: number | null
    products?: { name: string; unit?: string | null } | null
}

interface SaleWithItems {
    id: string
    transaction_date: string
    channel: string
    payment_method: string
    total: number
    status?: string | null
    payment_status?: string | null
    paid_amount?: number | null
    due_date?: string | null
    notes?: string | null
    customer_id?: string | null
    customers?: { name: string; phone?: string | null } | null
    is_edited?: boolean
    branch_id?: string | null
    user_id?: string | null
    branches?: { name: string } | null
    sale_items?: SaleItemWithProduct[] | null
}

    const branches = branchesRes.data
    const accounts = accountsRes.data ?? []
    let sales: SaleWithItems[] | null = salesRes.data as unknown as SaleWithItems[] | null
    const salesErr = salesRes.error


    if (salesErr && salesErr.code === '42703') {
        let fallbackQuery = supabase
            .from('sales')
            .select(
                isOwner
                    ? 'id, transaction_date, channel, payment_method, total, is_edited, branch_id, user_id, branches(name), sale_items(product_id, quantity, price, cost_price, products(name))'
                    : 'id, transaction_date, channel, payment_method, total, is_edited, branch_id, user_id, branches(name), sale_items(product_id, quantity, price, products(name))'
            )
            .order('transaction_date', { ascending: false })

        if (isOwner && effectiveBranchId && effectiveBranchId !== 'all') {
            fallbackQuery = fallbackQuery.eq('branch_id', effectiveBranchId)
        }
        if (params?.start_date) {
            fallbackQuery = fallbackQuery.gte('transaction_date', `${params.start_date}T00:00:00+07:00`)
        }
        if (params?.end_date) {
            fallbackQuery = fallbackQuery.lte('transaction_date', `${params.end_date}T23:59:59.999+07:00`)
        }
        fallbackQuery = fallbackQuery.limit(params?.start_date || params?.end_date ? 1000 : 300)

        const { data: salesFallback } = await fallbackQuery
        sales = salesFallback as unknown as SaleWithItems[] | null
    }

    // Proteksi data sensitif HPP (P0-3):
    // Jika bukan owner, sensor cost_price pada seluruh sale_items agar tidak bocor ke browser pegawai
    const sanitizedSales = (sales ?? []).map((sale) => ({
        ...sale,
        is_edited: !!sale.is_edited,
        branch_id: sale.branch_id ?? '',
        user_id: sale.user_id ?? '',
        status: sale.status ?? 'completed',
        payment_status: sale.payment_status ?? 'paid',
        paid_amount: Number(sale.paid_amount ?? sale.total),
        due_date: sale.due_date ?? null,
        notes: sale.notes ?? null,
        customer_id: sale.customer_id ?? null,
        customers: sale.customers ?? null,
        branches: sale.branches ?? null,
        sale_items: (sale.sale_items ?? []).map((item: SaleItemWithProduct) => ({
            ...item,
            branch_stock_deducted:
                item.branch_stock_deducted !== null && item.branch_stock_deducted !== undefined
                    ? Number(item.branch_stock_deducted)
                    : null,
            products: item.products
                ? {
                      name: item.products.name,
                      unit: item.products.unit ?? undefined,
                  }
                : null,
            cost_price: isOwner ? Number(item.cost_price ?? 0) : 0,
        })),
    }))

    const prof = profile as unknown as { businesses?: { name: string } | null; branches?: { name: string } | null } | null

    return (
        <RiwayatClient
            key={`${effectiveBranchId || 'all'}-${params?.start_date ?? ''}-${params?.end_date ?? ''}`}
            sales={sanitizedSales}
            branches={branches ?? []}
            accounts={accounts ?? []}
            branchStocks={(branchStocksRes.data ?? []).map((bs) => ({
                product_id: bs.product_id,
                branch_id: bs.branch_id,
                stock: Number(bs.stock ?? 0),
            }))}
            catalogProducts={sanitizedCatalogProducts}
            currentUserId={user.id}
            isOwner={isOwner}
            businessName={prof?.businesses?.name || 'Bisnis Anda'}
            userBranchName={prof?.branches?.name ?? null}
            initialBranchId={effectiveBranchId || 'all'}
            initialStartDate={params?.start_date}
            initialEndDate={params?.end_date}
        />
    )
}