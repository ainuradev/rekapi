import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getActiveBranchId } from '@/lib/active-branch'
import { resolveEffectiveBranchFilter } from '@/lib/inventory-valuation'
import SubTabNav from '@/components/sub-tab-nav'
import ProductCatalogClient from './product-catalog-client'

export default async function ProdukPage({
    searchParams,
}: {
    searchParams?: Promise<{ branch?: string }>
}) {
    const params = searchParams ? await searchParams : {}
    const activeBranchId = await getActiveBranchId()

    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, business_id, branch_id, branches(name)')
        .eq('id', user.id)
        .single()

    if (!profile?.business_id) {
        redirect('/login')
    }

    const isOwner = profile.role === 'owner'

    // KUNCI ISOLASI CABANG:
    // Owner membaca filter cabang aktif atau URL params.
    // Pegawai selalu terkunci ke cabang tugasnya (profile.branch_id).
    const candidateBranchFilter = isOwner
        ? (params?.branch
            ? (params.branch !== 'all' ? params.branch : 'all')
            : (activeBranchId && activeBranchId !== 'all' ? activeBranchId : 'all'))
        : (profile.branch_id || 'all')

    // Fetch branches, products, and branch stocks in parallel
    // Owner menggunakan owner_products_view (Migration 0019) untuk akses aman HPP.
    // Pegawai hanya mengakses tabel products tanpa kolom cost_price.
    let hasStockColumn = true
    let prodsResult = await (isOwner
        ? supabase
            .from('owner_products_view')
            .select('id, name, selling_price, cost_price, category, status, stock, unit, created_at')
        : supabase
            .from('products')
            .select('id, name, selling_price, category, status, stock, unit, created_at')
    )
        .eq('business_id', profile.business_id)
        .order('created_at', { ascending: true })

    // Jika view 0019 belum ada di database (42P01), fallback ke tabel products langsung
    if (isOwner && prodsResult.error && prodsResult.error.code === '42P01') {
        prodsResult = await supabase
            .from('products')
            .select('id, name, selling_price, cost_price, category, status, stock, unit, created_at')
            .eq('business_id', profile.business_id)
            .order('created_at', { ascending: true })
    }

    const [
        { data: branches },
        { data: branchStocks },
    ] = await Promise.all([
        isOwner
            ? supabase
                .from('branches')
                .select('id, name')
                .eq('business_id', profile.business_id)
                .order('created_at', { ascending: true })
                .order('name')
            : profile.branch_id
            ? supabase
                .from('branches')
                .select('id, name')
                .eq('id', profile.branch_id)
                .limit(1)
            : Promise.resolve({ data: [] }),
        isOwner
            ? supabase
                .from('product_branch_stocks')
                .select('product_id, branch_id, stock')
                .eq('business_id', profile.business_id)
            : profile.branch_id
            ? supabase
                .from('product_branch_stocks')
                .select('product_id, branch_id, stock')
                .eq('business_id', profile.business_id)
                .eq('branch_id', profile.branch_id)
            : Promise.resolve({ data: [] }),
    ])

    const branchList = branches ?? []
    const { selectedBranchId: selectedBranchFilter, selectedBranch } = resolveEffectiveBranchFilter(
        candidateBranchFilter,
        branchList
    )

    type ProductItem = {
        id: string
        name: string
        selling_price: number
        cost_price: number
        category?: string | null
        status: string
        stock: number
        unit: string
        created_at?: string
    }

    type DbProductRow = {
        id: string
        name: string
        selling_price: number
        cost_price?: number | null
        category?: string | null
        status?: string | null
        stock?: number | null
        unit?: string | null
        created_at?: string
    }

    let products: DbProductRow[] | null = prodsResult.data as DbProductRow[] | null
    if (prodsResult.error && prodsResult.error.code === '42703') {
        hasStockColumn = false
        const { data: prodsFallback } = await supabase
            .from('owner_products_view')
            .select('id, name, selling_price, cost_price, category, status')
            .order('created_at', { ascending: true })
        products = prodsFallback as DbProductRow[] | null
    }

    // Peta stok cabang & agregat per produk dari sumber kebenaran product_branch_stocks
    const branchStockMap = new Map<string, number>()
    const aggregateBranchStockMap = new Map<string, number>()
    const productsWithBranchRows = new Set<string>()

    if (branchStocks) {
        for (const bs of branchStocks) {
            const qty = Math.max(0, Number(bs.stock ?? 0))
            productsWithBranchRows.add(bs.product_id)
            aggregateBranchStockMap.set(bs.product_id, (aggregateBranchStockMap.get(bs.product_id) ?? 0) + qty)
            if (selectedBranchFilter !== 'all' && bs.branch_id === selectedBranchFilter) {
                branchStockMap.set(bs.product_id, qty)
            }
        }
    }

    // Mengelompokkan produk berdasarkan nama untuk kemudahan manajemen satuan & varian
    type ProductVariantGroup = {
        name: string
        category?: string | null
        variants: ProductItem[]
    }

    const groupedProducts: ProductVariantGroup[] = []
    const groupMap = new Map<string, ProductVariantGroup>()

    for (const rawP of products || []) {
        // Jika filter cabang spesifik dipilih, tampilkan stok cabang tersebut (0 jika belum ada baris).
        // Jika 'all', tampilkan SUM(product_branch_stocks) atau fallback ke rawP.stock untuk data lama.
        const displayStock =
            selectedBranchFilter !== 'all'
                ? (branchStockMap.get(rawP.id) ?? 0)
                : productsWithBranchRows.has(rawP.id)
                ? (aggregateBranchStockMap.get(rawP.id) ?? 0)
                : Math.max(0, Number(rawP.stock ?? 0))

        const p: ProductItem = {
            id: rawP.id,
            name: rawP.name,
            selling_price: Number(rawP.selling_price),
            cost_price: Number(rawP.cost_price ?? 0),
            category: rawP.category ?? null,
            status: rawP.status || 'aktif',
            unit: rawP.unit || 'pcs',
            stock: displayStock,
            created_at: rawP.created_at,
        }

        const key = p.name.trim().toLowerCase()
        const existing = groupMap.get(key)
        if (existing) {
            existing.variants.push(p)
        } else {
            const newGroup: ProductVariantGroup = {
                name: p.name.trim(),
                category: p.category,
                variants: [p],
            }
            groupMap.set(key, newGroup)
            groupedProducts.push(newGroup)
        }
    }

    const currentBranchName = selectedBranch?.name || (profile.branches as { name?: string } | null)?.name || undefined

    return (
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                        {isOwner ? 'Katalog Produk & Inventori' : 'Katalog Produk & Stok'}
                    </h1>
                    <p className="mt-1 text-xs font-semibold text-emerald-800">
                        {isOwner
                            ? selectedBranchFilter === 'all'
                                ? `Konsolidasi Semua Cabang (${branchList.length} cabang)`
                                : `Cabang: ${currentBranchName || 'Terpilih'}`
                            : `Cabang: ${currentBranchName || 'Cabang Anda'}`}
                    </p>
                </div>
            </div>

            {/* Sub-Tab Navigation hanya untuk Owner */}
            {isOwner && (
                <SubTabNav
                    items={[
                        { href: '/dashboard/data', label: 'Pusat Data', active: false },
                        { href: '/dashboard/produk', label: 'Katalog Produk', active: true },
                        { href: '/dashboard/bahan-baku', label: 'Bahan Baku & Stok', active: false },
                        { href: '/dashboard/bahan-baku?tab=supplier', label: 'Data Supplier', active: false },
                    ]}
                />
            )}

            {/* Banner peringatan jika migrasi belum dijalankan di Supabase */}
            {!hasStockColumn && isOwner && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-xs">
                    <div className="flex items-center gap-2 font-bold text-amber-900">
                        <svg className="w-4 h-4 text-amber-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>Migrasi Stok Database Belum Dijalankan</span>
                    </div>
                    <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                        Kolom <code className="rounded bg-amber-100 px-1 py-0.5 font-mono font-bold">stock</code> belum ada di database Supabase Anda. Semua produk tetap tampil dan bisa ditambahkan, namun fitur stok otomatis baru akan aktif setelah Anda mengeksekusi file <code className="rounded bg-amber-100 px-1 py-0.5 font-mono font-bold">supabase/migrations/0008_product_stock.sql</code> di Supabase SQL Editor.
                    </p>
                </div>
            )}

            {/* Katalog Produk dengan UI-Card & Inventori Stok */}
            <ProductCatalogClient
                key={selectedBranchFilter}
                groupedProducts={groupedProducts}
                branches={branches ?? []}
                selectedBranchFilter={selectedBranchFilter}
                currentBranchName={currentBranchName}
                isOwner={isOwner}
                hasStockColumn={hasStockColumn}
            />
        </div>
    )
}