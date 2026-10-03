'use client'

import { useState, useMemo } from 'react'
import { createSale } from './actions'
import InvoiceModal from '@/components/invoice-modal'

type Product = {
    id: string
    name: string
    selling_price: number
    cost_price: number
    stock: number
    unit?: string
    category?: 'makanan' | 'minuman' | 'lainnya' | string | null
}

type Branch = {
    id: string
    name: string
}

type CartLine = {
    product_id: string
    name: string
    quantity: number
    price: number
    cost_price: number
    unit?: string
}

const CHANNELS = ['offline', 'gofood', 'grabfood', 'shopeefood', 'whatsapp', 'qris', 'lainnya']
const PAYMENT_METHODS = ['cash', 'qris', 'transfer', 'lainnya']

type ProductGroup = {
    name: string
    category?: string | null
    variants: Product[]
}

export default function KasirClient({
    products,
    branches,
    fixedBranchId,
    businessName,
    businessAddress,
    businessPhone,
    userName,
}: {
    products: Product[]
    branches: Branch[]
    fixedBranchId: string | null
    businessName: string
    businessAddress?: string | null
    businessPhone?: string | null
    userName: string
}) {
    const [cart, setCart] = useState<Record<string, CartLine>>({})
    const [selectedBranch, setSelectedBranch] = useState(fixedBranchId ?? branches[0]?.id ?? '')
    const [channel, setChannel] = useState('offline')
    const [paymentMethod, setPaymentMethod] = useState('cash')
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [selectingGroup, setSelectingGroup] = useState<ProductGroup | null>(null)
    const [showInvoice, setShowInvoice] = useState(false)
    const [invoiceData, setInvoiceData] = useState<any>(null)

    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<'semua' | 'makanan' | 'minuman' | 'lainnya'>('semua')
    const [mobileCheckoutOpen, setMobileCheckoutOpen] = useState(false)

    // Mengelompokkan produk berdasarkan nama (case-insensitive) agar produk dengan banyak satuan
    // tampil menjadi satu kartu menu utama di kasir.
    const groupedProducts = useMemo(() => {
        const map = new Map<string, ProductGroup>()
        for (const p of products) {
            const key = p.name.trim().toLowerCase()
            const existing = map.get(key)
            if (existing) {
                existing.variants.push(p)
                if (!existing.category && p.category) {
                    existing.category = p.category
                }
            } else {
                map.set(key, {
                    name: p.name.trim(),
                    category: p.category ?? null,
                    variants: [p],
                })
            }
        }
        return Array.from(map.values())
    }, [products])

    // Filter produk berdasarkan Search dan Category tab
    const filteredGroupedProducts = useMemo(() => {
        return groupedProducts.filter((group) => {
            const nameLower = group.name.toLowerCase()
            const matchesSearch = !searchQuery || nameLower.includes(searchQuery.toLowerCase().trim())
            if (!matchesSearch) return false

            if (selectedCategory === 'semua') return true

            // Jika produk memiliki kategori eksplisit dari database ('makanan' | 'minuman' | 'lainnya')
            if (group.category) {
                const catLower = group.category.toLowerCase().trim()
                if (catLower === selectedCategory) return true
                if (['makanan', 'minuman', 'lainnya'].includes(catLower)) {
                    return false
                }
            }

            // Fallback untuk produk lawas yang belum diisi kategori di database:
            const drinkKeywords = ['es', 'teh', 'kopi', 'jeruk', 'jus', 'drink', 'water', 'mineral', 'boba', 'susu', 'coffee', 'tea']
            const isDrink = drinkKeywords.some((k) => nameLower.includes(k))

            if (selectedCategory === 'minuman') return isDrink
            if (selectedCategory === 'makanan') return !isDrink
            if (selectedCategory === 'lainnya') return false

            return true
        })
    }, [groupedProducts, searchQuery, selectedCategory])

    const total = useMemo(
        () => Object.values(cart).reduce((sum, item) => sum + item.price * item.quantity, 0),
        [cart]
    )

    function addToCart(product: Product) {
        setCart((prev) => {
            const existing = prev[product.id]
            const currentQty = existing?.quantity ?? 0
            const stock = product.stock !== undefined && product.stock !== null ? Number(product.stock) : null
            if (stock !== null && currentQty >= stock) {
                return prev
            }

            // Jika ada lebih dari 1 produk dengan nama yang sama, sertakan satuan di nama item keranjang
            const isMultiVariant = products.filter(
                (p) => p.name.trim().toLowerCase() === product.name.trim().toLowerCase()
            ).length > 1

            const displayName = isMultiVariant
                ? `${product.name} (${product.unit || 'pcs'})`
                : product.name

            return {
                ...prev,
                [product.id]: {
                    product_id: product.id,
                    name: displayName,
                    price: product.selling_price,
                    cost_price: product.cost_price,
                    quantity: currentQty + 1,
                    unit: product.unit || 'pcs',
                },
            }
        })
    }

    function changeQty(productId: string, delta: number) {
        setCart((prev) => {
            const item = prev[productId]
            if (!item) return prev
            const prod = products.find((p) => p.id === productId)
            const stock = prod?.stock !== undefined && prod?.stock !== null ? Number(prod.stock) : null
            const newQty = item.quantity + delta
            if (delta > 0 && stock !== null && newQty > stock) {
                return prev
            }
            if (newQty <= 0) {
                const { [productId]: _, ...rest } = prev
                return rest
            }
            return { ...prev, [productId]: { ...item, quantity: newQty } }
        })
    }

    async function handleSubmit() {
        setSaving(true)
        setMessage(null)

        const result = await createSale({
            branch_id: selectedBranch,
            channel,
            payment_method: paymentMethod,
            items: Object.values(cart),
        })

        setSaving(false)

        if (result.error) {
            setMessage(`Gagal: ${result.error}`)
            return
        }

        // Generate invoice number
        const now = new Date()
        const invoiceNumber = `INV/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}/${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`

        // Get branch name
        const branch = branches.find(b => b.id === selectedBranch)

        // Prepare invoice data
        const invoice = {
            invoiceNumber,
            date: now.toLocaleString('id-ID', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            businessName: businessName,
            branchName: branch?.name,
            address: businessAddress,
            phone: businessPhone,
            items: Object.values(cart).map(item => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                subtotal: item.price * item.quantity,
            })),
            subtotal: total,
            total: total,
            paymentMethod: paymentMethod,
            cashierName: userName,
        }

        setInvoiceData(invoice)
        setShowInvoice(true)
        setCart({})
        setMessage('Transaksi tersimpan!')
    }

    const itemCount = Object.values(cart).reduce((sum, i) => sum + i.quantity, 0)

    return (
        <div className="mx-auto max-w-5xl px-4 py-4 sm:py-8 pb-32 sm:pb-16">
            {/* Header POS */}
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                        Kasir
                    </h1>
                    <p className="text-xs text-slate-500">Scan atau pilih produk untuk transaksi penjualan cepat.</p>
                </div>

                {!fixedBranchId && branches.length > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-medium">Cabang:</span>
                        <select
                            value={selectedBranch}
                            onChange={(e) => setSelectedBranch(e.target.value)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-600 focus:outline-none cursor-pointer"
                        >
                            {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Scan / Cari Produk Input */}
            <div className="mb-4">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Nama produk / Barcode"
                        className="w-full pl-10 pr-12 py-3 rounded-2xl border border-slate-200 bg-white text-xs font-medium text-slate-800 placeholder:text-slate-400 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                    />
                    <button
                        type="button"
                        onClick={() => alert('Fitur Scan Barcode siap digunakan dengan scanner kamera atau hardware scanner.')}
                        title="Scan Barcode"
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-blue-600 hover:text-blue-700 transition cursor-pointer"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Category Filter Pills (Semua, Makanan, Minuman, Lainnya) */}
            <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                {(
                    [
                        { id: 'semua', label: 'Semua' },
                        { id: 'makanan', label: 'Makanan' },
                        { id: 'minuman', label: 'Minuman' },
                        { id: 'lainnya', label: 'Lainnya' },
                    ] as const
                ).map((cat) => (
                    <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                            selectedCategory === cat.id
                                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
                                : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                        }`}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Product Catalog List */}
                <div className="lg:col-span-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {filteredGroupedProducts.map((group) => {
                            const isSingle = group.variants.length === 1

                            if (isSingle) {
                                const product = group.variants[0]
                                const qtyInCart = cart[product.id]?.quantity ?? 0
                                const stock = product.stock !== undefined && product.stock !== null ? Number(product.stock) : null
                                const outOfStock = stock !== null && stock <= 0
                                const reachedLimit = stock !== null && qtyInCart >= stock
                                const lowStock = stock !== null && stock > 0 && stock <= 5
                                const isDisabled = outOfStock || reachedLimit

                                return (
                                    <div
                                        key={product.id}
                                        className={`flex items-center justify-between p-3.5 rounded-2xl border bg-white shadow-2xs transition ${
                                            isDisabled
                                                ? 'border-slate-200 opacity-60 bg-slate-50'
                                                : 'border-slate-200/90 hover:border-blue-400 hover:shadow-xs'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0 pr-2">
                                            {/* Product Icon Avatar */}
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-slate-100 to-slate-200 border border-slate-200/80 flex items-center justify-center text-xl flex-shrink-0">
                                                {product.name.toLowerCase().includes('es') || product.name.toLowerCase().includes('teh') || product.name.toLowerCase().includes('kopi') || product.name.toLowerCase().includes('jeruk')
                                                    ? '🥤'
                                                    : product.name.toLowerCase().includes('dimsum') || product.name.toLowerCase().includes('ayam') || product.name.toLowerCase().includes('tahu')
                                                    ? '🥟'
                                                    : '🍱'}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-sm text-slate-900 truncate">
                                                    {product.name}
                                                </div>
                                                <div className="text-xs font-semibold text-slate-500 mt-0.5">
                                                    Rp {product.selling_price.toLocaleString('id-ID')}
                                                </div>
                                                {outOfStock ? (
                                                    <span className="text-[10px] font-bold text-red-500">Stok Habis</span>
                                                ) : lowStock ? (
                                                    <span className="text-[10px] font-semibold text-amber-500">Sisa {stock}</span>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            {qtyInCart > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => changeQty(product.id, -1)}
                                                    className="w-8 h-8 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-bold text-sm flex items-center justify-center hover:bg-slate-100 transition"
                                                >
                                                    -
                                                </button>
                                            )}
                                            {qtyInCart > 0 && (
                                                <span className="w-6 text-center font-bold text-xs text-blue-600">
                                                    {qtyInCart}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => !isDisabled && addToCart(product)}
                                                disabled={isDisabled}
                                                className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm transition shadow-2xs ${
                                                    isDisabled
                                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                                        : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                                                }`}
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                )
                            }

                            // Multi-variant (memiliki beberapa satuan pilihan)
                            const groupQtyInCart = group.variants.reduce((sum, v) => sum + (cart[v.id]?.quantity ?? 0), 0)
                            const allOutOfStock = group.variants.every(
                                (v) => v.stock !== undefined && v.stock !== null && Number(v.stock) <= 0
                            )

                            const prices = group.variants.map((v) => v.selling_price)
                            const minPrice = Math.min(...prices)
                            const maxPrice = Math.max(...prices)
                            const priceDisplay = minPrice === maxPrice
                                ? `Rp ${minPrice.toLocaleString('id-ID')}`
                                : `Rp ${minPrice.toLocaleString('id-ID')} - ${maxPrice.toLocaleString('id-ID')}`

                            return (
                                <div
                                    key={group.name}
                                    onClick={() => !allOutOfStock && setSelectingGroup(group)}
                                    className={`flex items-center justify-between p-3.5 rounded-2xl border bg-white shadow-2xs transition cursor-pointer ${
                                        allOutOfStock
                                            ? 'border-slate-200 opacity-60 bg-slate-50'
                                            : 'border-slate-200/90 hover:border-blue-400 hover:shadow-xs'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0 pr-2">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-slate-100 to-slate-200 border border-slate-200/80 flex items-center justify-center text-xl flex-shrink-0">
                                            📦
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-bold text-sm text-slate-900 truncate">
                                                {group.name}
                                            </div>
                                            <div className="text-xs font-semibold text-slate-500 mt-0.5">
                                                {priceDisplay}
                                            </div>
                                            <div className="text-[10px] text-blue-600 font-medium">
                                                {group.variants.length} Varian Satuan
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        {groupQtyInCart > 0 && (
                                            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-bold text-xs">
                                                {groupQtyInCart}
                                            </span>
                                        )}
                                        <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-2xs hover:bg-blue-700">
                                            +
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {filteredGroupedProducts.length === 0 && (
                        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-xs text-slate-400">
                            Tidak ada produk yang cocok dengan pencarian / kategori ini.
                        </div>
                    )}
                </div>

                {/* Desktop Cart Sidebar */}
                <div className="hidden lg:block">
                    <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm sticky top-20">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                                <span>Keranjang</span>
                                {itemCount > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-xs font-extrabold">
                                        {itemCount} item
                                    </span>
                                )}
                            </h2>
                            {itemCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setCart({})}
                                    className="text-[11px] font-semibold text-red-500 hover:text-red-700 cursor-pointer"
                                >
                                    Kosongkan
                                </button>
                            )}
                        </div>

                        <div className="mt-3 space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                            {Object.values(cart).map((item) => (
                                <div key={item.product_id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50">
                                    <div className="min-w-0 pr-2">
                                        <div className="font-bold text-slate-800 truncate">{item.name}</div>
                                        <div className="text-[11px] text-slate-400">
                                            Rp {item.price.toLocaleString('id-ID')}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => changeQty(item.product_id, -1)}
                                            className="w-6 h-6 rounded-lg border border-slate-200 bg-slate-50 font-bold text-slate-700 flex items-center justify-center hover:bg-slate-100"
                                        >
                                            -
                                        </button>
                                        <span className="w-5 text-center font-bold text-slate-800">
                                            {item.quantity}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => changeQty(item.product_id, 1)}
                                            className="w-6 h-6 rounded-lg border border-slate-200 bg-slate-50 font-bold text-slate-700 flex items-center justify-center hover:bg-slate-100"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {Object.keys(cart).length === 0 && (
                                <div className="py-8 text-center text-xs text-slate-400">
                                    Pilih menu untuk menambahkan ke keranjang.
                                </div>
                            )}
                        </div>

                        <div className="my-4 border-t border-slate-100 pt-3">
                            <div className="flex items-baseline justify-between mb-3">
                                <span className="text-xs font-semibold text-slate-500">Total Tagihan</span>
                                <span className="text-xl font-extrabold text-blue-600">
                                    Rp {total.toLocaleString('id-ID')}
                                </span>
                            </div>

                            <div className="space-y-2 mb-4">
                                <div>
                                    <label className="text-[11px] font-medium text-slate-600 block mb-1">Metode Bayar</label>
                                    <select
                                        value={paymentMethod}
                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
                                    >
                                        {PAYMENT_METHODS.map((m) => (
                                            <option key={m} value={m}>
                                                {m.toUpperCase()}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[11px] font-medium text-slate-600 block mb-1">Channel Penjualan</label>
                                    <select
                                        value={channel}
                                        onChange={(e) => setChannel(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none capitalize"
                                    >
                                        {CHANNELS.map((c) => (
                                            <option key={c} value={c}>
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={saving || Object.keys(cart).length === 0 || !selectedBranch}
                                className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-bold text-white shadow-md shadow-blue-500/25 hover:bg-blue-700 transition disabled:opacity-40 cursor-pointer"
                            >
                                {saving ? 'Menyimpan...' : 'Bayar Sekarang'}
                            </button>

                            {message && (
                                <p className={`mt-2 text-center text-xs font-semibold ${message.startsWith('Gagal') ? 'text-red-500' : 'text-emerald-600'}`}>
                                    {message}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Mobile Floating Cart Bar (Matches Mockup "[3 Item | Rp 35.000] [Bayar]") ── */}
            {itemCount > 0 && (
                <div className="fixed bottom-20 inset-x-4 z-40 sm:hidden animate-in slide-in-from-bottom duration-200">
                    <div className="flex items-center justify-between rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 p-3 shadow-xl">
                        <div
                            onClick={() => setMobileCheckoutOpen(true)}
                            className="flex items-center gap-3 cursor-pointer pl-1"
                        >
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                                <span>{itemCount} Item</span>
                            </div>
                            <span className="text-slate-300">|</span>
                            <div className="text-xs font-extrabold text-blue-600">
                                Rp {total.toLocaleString('id-ID')}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setMobileCheckoutOpen(true)}
                            className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/25 active:scale-95 transition"
                        >
                            Bayar
                        </button>
                    </div>
                </div>
            )}

            {/* Mobile Checkout Modal Drawer */}
            {mobileCheckoutOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-xs sm:hidden"
                    onClick={() => setMobileCheckoutOpen(false)}
                >
                    <div
                        className="w-full rounded-t-3xl bg-white p-5 shadow-2xl max-h-[85vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <h3 className="font-bold text-base text-slate-900">Rincian Pembayaran</h3>
                            <button
                                type="button"
                                onClick={() => setMobileCheckoutOpen(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold flex items-center justify-center"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="py-3 space-y-2 max-h-[40vh] overflow-y-auto">
                            {Object.values(cart).map((item) => (
                                <div key={item.product_id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50">
                                    <div>
                                        <div className="font-bold text-slate-800">{item.name}</div>
                                        <div className="text-[11px] text-slate-400">Rp {item.price.toLocaleString('id-ID')}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => changeQty(item.product_id, -1)}
                                            className="w-7 h-7 rounded-lg border border-slate-200 bg-slate-50 font-bold text-slate-700 flex items-center justify-center"
                                        >
                                            -
                                        </button>
                                        <span className="w-5 text-center font-bold">{item.quantity}</span>
                                        <button
                                            type="button"
                                            onClick={() => changeQty(item.product_id, 1)}
                                            className="w-7 h-7 rounded-lg border border-slate-200 bg-slate-50 font-bold text-slate-700 flex items-center justify-center"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-3 pt-3 border-t border-slate-100">
                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">Metode Bayar</label>
                                <select
                                    value={paymentMethod}
                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold"
                                >
                                    {PAYMENT_METHODS.map((m) => (
                                        <option key={m} value={m}>
                                            {m.toUpperCase()}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">Channel Penjualan</label>
                                <select
                                    value={channel}
                                    onChange={(e) => setChannel(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold capitalize"
                                >
                                    {CHANNELS.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-baseline justify-between pt-2">
                                <span className="text-xs text-slate-500 font-semibold">Total Tagihan</span>
                                <span className="text-xl font-extrabold text-blue-600">
                                    Rp {total.toLocaleString('id-ID')}
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={async (e) => {
                                    await handleSubmit()
                                    setMobileCheckoutOpen(false)
                                }}
                                disabled={saving}
                                className="w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/30 active:scale-98 transition"
                            >
                                {saving ? 'Menyimpan...' : 'Selesaikan Transaksi'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Pemilihan Satuan untuk Produk Multi-Varian */}
            {selectingGroup && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
                    onClick={() => setSelectingGroup(null)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl transition-all sm:p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between border-b border-gray-100 pb-3">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">{selectingGroup.name}</h3>
                                <p className="text-xs text-gray-500">Pilih satuan yang diinginkan</p>
                            </div>
                            <button
                                onClick={() => setSelectingGroup(null)}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="mt-4 max-h-[60vh] space-y-2.5 overflow-y-auto pr-1">
                            {selectingGroup.variants.map((v) => {
                                const itemInCart = cart[v.id]
                                const qtyInCart = itemInCart?.quantity ?? 0
                                const stock = v.stock !== undefined && v.stock !== null ? Number(v.stock) : null
                                const outOfStock = stock !== null && stock <= 0
                                const reachedLimit = stock !== null && qtyInCart >= stock
                                const lowStock = stock !== null && stock > 0 && stock <= 5

                                return (
                                    <div
                                        key={v.id}
                                        className={`flex items-center justify-between rounded-xl border p-3 transition ${
                                            outOfStock
                                                ? 'border-red-100 bg-red-50/40 opacity-70'
                                                : qtyInCart > 0
                                                ? 'border-black bg-gray-50/70'
                                                : 'border-gray-200 bg-white hover:border-gray-400'
                                        }`}
                                    >
                                        <div className="space-y-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-semibold text-gray-600">Satuan:</span>
                                                <span className="text-xs font-bold uppercase text-gray-900">
                                                    {v.unit || 'pcs'}
                                                </span>
                                                {outOfStock && (
                                                    <span className="rounded-full bg-red-500 px-1.5 py-0.2 text-[9px] font-bold text-white">
                                                        HABIS
                                                    </span>
                                                )}
                                                {reachedLimit && !outOfStock && (
                                                    <span className="rounded-full bg-gray-700 px-1.5 py-0.2 text-[9px] font-bold text-white">
                                                        MAX
                                                    </span>
                                                )}
                                                {lowStock && !reachedLimit && (
                                                    <span className="rounded-full bg-amber-400 px-1.5 py-0.2 text-[9px] font-bold text-gray-900">
                                                        Sisa {stock}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs font-bold text-gray-900">
                                                Rp{v.selling_price.toLocaleString('id-ID')}
                                            </div>
                                            {stock !== null && !outOfStock && !lowStock && (
                                                <div className="text-[10px] text-gray-400">
                                                    Stok: {stock} {v.unit || 'pcs'}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            {qtyInCart > 0 ? (
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => changeQty(v.id, -1)}
                                                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-base font-bold text-gray-700 shadow-xs hover:bg-gray-100"
                                                    >
                                                        -
                                                    </button>
                                                    <span className="w-5 text-center text-xs font-bold text-gray-900">
                                                        {qtyInCart}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => changeQty(v.id, 1)}
                                                        disabled={reachedLimit}
                                                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-base font-bold text-gray-700 shadow-xs hover:bg-gray-100 disabled:opacity-40"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => addToCart(v)}
                                                    disabled={outOfStock}
                                                    className="rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-gray-800 disabled:opacity-40"
                                                >
                                                    + Tambah
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="mt-4 border-t border-gray-100 pt-3">
                            <button
                                type="button"
                                onClick={() => setSelectingGroup(null)}
                                className="w-full rounded-xl bg-black py-2.5 text-xs font-semibold text-white shadow transition hover:bg-gray-800"
                            >
                                Selesai
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Invoice Modal */}
            {showInvoice && invoiceData && (
                <InvoiceModal
                    isOpen={showInvoice}
                    onClose={() => setShowInvoice(false)}
                    data={invoiceData}
                />
            )}
        </div>
    )
}