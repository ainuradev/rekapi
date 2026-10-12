import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { toggleProductStatus } from './actions'
import CostPriceEditor from './cost-price-editor'
import StockEditor from './stock-editor'
import AddProductForm from './add-product-form'
import SubTabNav from '@/components/sub-tab-nav'

export default async function ProdukPage({
    searchParams,
}: {
    searchParams?: Promise<{ branch?: string }>
}) {
    const params = searchParams ? await searchParams : {}
    const selectedBranchFilter = params?.branch || 'all'

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

    const isOwner = profile?.role === 'owner'
    if (!isOwner) {
        redirect('/dashboard/penjualan')
    }

    // Fetch branches, products, and branch stocks in parallel
    let hasStockColumn = true
    const [
        { data: branches },
        prodsResult,
        { data: branchStocks },
    ] = await Promise.all([
        supabase
            .from('branches')
            .select('id, name')
            .order('name'),
        supabase
            .from('products')
            .select('id, name, selling_price, cost_price, category, status, stock, unit')
            .order('created_at', { ascending: true }),
        supabase
            .from('product_branch_stocks')
            .select('product_id, branch_id, stock'),
    ])

    let products: any[] | null = prodsResult.data
    if (prodsResult.error && prodsResult.error.code === '42703') {
        hasStockColumn = false
        const { data: prodsFallback } = await supabase
            .from('products')
            .select('id, name, selling_price, cost_price, category, status')
            .order('created_at', { ascending: true })
        products = prodsFallback
    }

    // Peta stok cabang: branch_id -> Map(product_id -> stock)
    const branchStockMap = new Map<string, number>()
    if (branchStocks && selectedBranchFilter !== 'all') {
        for (const bs of branchStocks) {
            if (bs.branch_id === selectedBranchFilter) {
                branchStockMap.set(bs.product_id, Number(bs.stock))
            }
        }
    }

    // Mengelompokkan produk berdasarkan nama untuk kemudahan manajemen satuan & varian
    type ProductVariantGroup = {
        name: string
        category?: string | null
        variants: any[]
    }

    const groupedProducts: ProductVariantGroup[] = []
    const groupMap = new Map<string, ProductVariantGroup>()

    for (const rawP of products || []) {
        // Tentukan nilai stok yang ditampilkan (stok spesifik cabang atau stok global)
        const displayStock = (selectedBranchFilter !== 'all' && branchStockMap.has(rawP.id))
            ? branchStockMap.get(rawP.id)!
            : (rawP.stock ?? 0)

        const p = {
            ...rawP,
            stock: displayStock,
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

    const currentBranchName = branches?.find((b) => b.id === selectedBranchFilter)?.name

    return (
        <div className="mx-auto max-w-2xl px-4 py-8 sm:py-16">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Master Produk</h1>
                <p className="mt-1 text-sm text-gray-600">
                    Kelola menu makanan, minuman, atau barang dagangan.
                </p>
            </div>

            {/* Sub-Tab Navigation (Katalog Produk vs Bahan Baku) */}
            <SubTabNav
                items={[
                    { href: '/dashboard/produk', label: 'Katalog Produk', active: true },
                    { href: '/dashboard/bahan-baku', label: 'Bahan Baku', active: false },
                ]}
            />

            {/* Banner peringatan jika migrasi 0008 belum dijalankan di Supabase */}
            {!hasStockColumn && isOwner && (
                <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-xs">
                    <div className="flex items-center gap-2 font-bold text-amber-900">
                        <span className="text-base">⚠️</span> Migrasi Stok Database Belum Dijalankan
                    </div>
                    <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                        Kolom <code className="rounded bg-amber-100 px-1 py-0.5 font-mono font-bold">stock</code> belum ada di database Supabase Anda. Semua produk tetap tampil dan bisa ditambahkan, namun fitur stok otomatis baru akan aktif setelah Anda mengeksekusi file <code className="rounded bg-amber-100 px-1 py-0.5 font-mono font-bold">supabase/migrations/0008_product_stock.sql</code> di Supabase SQL Editor.
                    </p>
                </div>
            )}

            {/* Form Tambah Produk dengan Feedback Interaktif */}
            <AddProductForm isOwner={isOwner} hasStockColumn={hasStockColumn} />

            {/* Filter / Pilihan Cabang untuk Kelola Stok Cabang */}
            {branches && branches.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                            <span>🏢</span> Inventori Stok Cabang
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            {selectedBranchFilter === 'all'
                                ? 'Menampilkan stok global. Pilih cabang untuk melihat & menyesuaikan stok per cabang.'
                                : `Mengelola stok khusus untuk: ${currentBranchName}`}
                        </p>
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                        <a
                            href="/dashboard/produk"
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                                selectedBranchFilter === 'all'
                                    ? 'bg-black text-white shadow-xs'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            🌐 Semua / Global
                        </a>
                        {branches.map((b) => (
                            <a
                                key={b.id}
                                href={`/dashboard/produk?branch=${b.id}`}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                                    selectedBranchFilter === b.id
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                📍 {b.name}
                            </a>
                        ))}
                    </div>
                </div>
            )}

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                        Daftar Produk ({groupedProducts.length} produk, {products?.length ?? 0} varian satuan)
                    </h2>
                    {selectedBranchFilter !== 'all' && (
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                            Stok: {currentBranchName}
                        </span>
                    )}
                </div>

                {groupedProducts.map((group) => {
                    const isMulti = group.variants.length > 1

                    if (!isMulti) {
                        const p = group.variants[0]
                        return (
                            <div
                                key={p.id}
                                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-semibold text-gray-900">{p.name}</div>
                                        <div className="text-sm font-medium text-gray-700">
                                            Rp{p.selling_price.toLocaleString('id-ID')}
                                            <span className="text-xs text-gray-500 font-normal"> / {p.unit || 'pcs'}</span>
                                            {p.category ? (
                                                <span className="ml-2 rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600 font-normal">
                                                    {p.category}
                                                </span>
                                            ) : ''}
                                        </div>
                                    </div>
                                    <form
                                        action={async () => {
                                            'use server'
                                            await toggleProductStatus(p.id, p.status)
                                        }}
                                    >
                                        <button
                                            type="submit"
                                            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider transition ${
                                                p.status === 'aktif'
                                                    ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                            }`}
                                        >
                                            {p.status}
                                        </button>
                                    </form>
                                </div>

                                {/* Baris Stok */}
                                <div className="mt-2.5 flex items-center gap-2 border-t border-gray-100 pt-2.5">
                                    <span className="text-xs font-medium text-gray-500">Stok:</span>
                                    {hasStockColumn ? (
                                        isOwner ? (
                                            <StockEditor
                                                productId={p.id}
                                                initialStock={p.stock ?? 0}
                                                unit={p.unit || 'pcs'}
                                                branchId={selectedBranchFilter !== 'all' ? selectedBranchFilter : null}
                                            />
                                        ) : (
                                            <span
                                                className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                                                    (p.stock ?? 0) === 0
                                                        ? 'border-red-200 bg-red-50 text-red-600'
                                                        : (p.stock ?? 0) <= 5
                                                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                        : 'border-green-200 bg-green-50 text-green-700'
                                                }`}
                                            >
                                                {(p.stock ?? 0) === 0
                                                    ? '🔴 Habis'
                                                    : (p.stock ?? 0) <= 5
                                                    ? `🟡 ${p.stock} ${p.unit || 'pcs'}`
                                                    : `🟢 ${p.stock} ${p.unit || 'pcs'}`}
                                            </span>
                                        )
                                    ) : (
                                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 border border-gray-200">
                                            Migrasi 0008/0009 diperlukan
                                        </span>
                                    )}
                                </div>

                                {isOwner && (
                                    <div className="mt-2.5 flex items-center gap-2 border-t border-gray-100 pt-2.5 text-sm text-gray-600">
                                        <span className="font-medium text-gray-500">HPP:</span>
                                        <CostPriceEditor productId={p.id} initialValue={p.cost_price} />
                                    </div>
                                )}
                            </div>
                        )
                    }

                    // Multi-satuan varian untuk produk dengan nama yang sama
                    return (
                        <div
                            key={group.name}
                            className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm space-y-3"
                        >
                            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-base font-bold text-gray-900">{group.name}</span>
                                        {group.category && (
                                            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                                {group.category}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {group.variants.length} satuan pilihan penjualan
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2.5">
                                {group.variants.map((v) => (
                                    <div
                                        key={v.id}
                                        className="rounded-xl border border-gray-100 bg-gray-50/70 p-3.5 space-y-2.5"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-medium text-gray-500">Satuan:</span>
                                                    <span className="text-xs font-bold uppercase text-gray-900">
                                                        {v.unit || 'pcs'}
                                                    </span>
                                                </div>
                                                <div className="text-sm font-bold text-gray-900 mt-0.5">
                                                    Rp{v.selling_price.toLocaleString('id-ID')}
                                                </div>
                                            </div>
                                            <form
                                                action={async () => {
                                                    'use server'
                                                    await toggleProductStatus(v.id, v.status)
                                                }}
                                            >
                                                <button
                                                    type="submit"
                                                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider transition ${
                                                        v.status === 'aktif'
                                                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                                    }`}
                                                >
                                                    {v.status}
                                                </button>
                                            </form>
                                        </div>

                                        <div className="flex items-center gap-2 border-t border-gray-200/60 pt-2 text-xs">
                                            <span className="font-medium text-gray-500">Stok:</span>
                                            {hasStockColumn ? (
                                                isOwner ? (
                                                    <StockEditor
                                                        productId={v.id}
                                                        initialStock={v.stock ?? 0}
                                                        unit={v.unit || 'pcs'}
                                                        branchId={selectedBranchFilter !== 'all' ? selectedBranchFilter : null}
                                                    />
                                                ) : (
                                                    <span
                                                        className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                                                            (v.stock ?? 0) === 0
                                                                ? 'border-red-200 bg-red-50 text-red-600'
                                                                : (v.stock ?? 0) <= 5
                                                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                                : 'border-green-200 bg-green-50 text-green-700'
                                                        }`}
                                                    >
                                                        {(v.stock ?? 0) === 0
                                                            ? '🔴 Habis'
                                                            : (v.stock ?? 0) <= 5
                                                            ? `🟡 ${v.stock} ${v.unit || 'pcs'}`
                                                            : `🟢 ${v.stock} ${v.unit || 'pcs'}`}
                                                    </span>
                                                )
                                            ) : (
                                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 border border-gray-200">
                                                    Migrasi diperlukan
                                                </span>
                                            )}
                                        </div>

                                        {isOwner && (
                                            <div className="flex items-center gap-2 border-t border-gray-200/60 pt-2 text-sm text-gray-600">
                                                <span className="font-medium text-gray-500 text-xs">HPP:</span>
                                                <CostPriceEditor productId={v.id} initialValue={v.cost_price} />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })}

                {groupedProducts.length === 0 && (
                    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
                        Belum ada produk. Tambahkan produk pertama di atas.
                    </div>
                )}
            </div>
        </div>
    )
}