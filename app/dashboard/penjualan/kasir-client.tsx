'use client'

import { useState, useMemo } from 'react'
import { createSale } from './actions'

type Product = {
    id: string
    name: string
    selling_price: number
    cost_price: number
    stock: number
    unit?: string
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
    variants: Product[]
}

export default function KasirClient({
    products,
    branches,
    fixedBranchId,
}: {
    products: Product[]
    branches: Branch[]
    fixedBranchId: string | null
}) {
    const [cart, setCart] = useState<Record<string, CartLine>>({})
    const [selectedBranch, setSelectedBranch] = useState(fixedBranchId ?? branches[0]?.id ?? '')
    const [channel, setChannel] = useState('offline')
    const [paymentMethod, setPaymentMethod] = useState('cash')
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [selectingGroup, setSelectingGroup] = useState<ProductGroup | null>(null)

    // Mengelompokkan produk berdasarkan nama (case-insensitive) agar produk dengan banyak satuan
    // tampil menjadi satu kartu menu utama di kasir.
    const groupedProducts = useMemo(() => {
        const map = new Map<string, ProductGroup>()
        for (const p of products) {
            const key = p.name.trim().toLowerCase()
            const existing = map.get(key)
            if (existing) {
                existing.variants.push(p)
            } else {
                map.set(key, {
                    name: p.name.trim(),
                    variants: [p],
                })
            }
        }
        return Array.from(map.values())
    }, [products])

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

        setCart({})
        setMessage('Transaksi tersimpan!')
    }

    const itemCount = Object.values(cart).reduce((sum, i) => sum + i.quantity, 0)

    return (
        <div className="mx-auto max-w-4xl px-4 py-6 sm:py-16">
            <div className="mb-4">
                <h1 className="text-2xl font-bold text-gray-900">Kasir POS</h1>
                <p className="text-sm text-gray-600">Catat transaksi penjualan langsung dari cabang.</p>
            </div>

            {!fixedBranchId && branches.length > 0 && (
                <div className="mb-4">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-700">
                        Cabang Aktif
                    </label>
                    <select
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:border-black focus:outline-none"
                    >
                        {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div className="grid gap-6 sm:grid-cols-3">
                <div className="sm:col-span-2">
                    <div className="grid grid-cols-2 gap-3">
                        {groupedProducts.map((group) => {
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
                                    <button
                                        key={product.id}
                                        onClick={() => !isDisabled && addToCart(product)}
                                        disabled={isDisabled}
                                        className={`relative rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
                                            isDisabled
                                                ? 'border-red-200 bg-red-50/50 opacity-60 cursor-not-allowed'
                                                : 'border-gray-200 hover:border-black active:bg-gray-50 cursor-pointer'
                                        }`}
                                    >
                                        {qtyInCart > 0 && (
                                            <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black text-xs font-bold text-white shadow">
                                                {qtyInCart}
                                            </span>
                                        )}
                                        {outOfStock && (
                                            <span className="absolute -left-1 -top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
                                                HABIS
                                            </span>
                                        )}
                                        {reachedLimit && !outOfStock && (
                                            <span className="absolute -left-1 -top-1 rounded-full bg-gray-700 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
                                                MAX
                                            </span>
                                        )}
                                        {lowStock && !reachedLimit && (
                                            <span className="absolute -left-1 -top-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
                                                {stock} {product.unit || 'pcs'} sisa
                                            </span>
                                        )}
                                        <div className="font-semibold text-gray-900">{product.name}</div>
                                        <div className="mt-1 text-sm font-medium text-gray-600">
                                            Rp{product.selling_price.toLocaleString('id-ID')}
                                            <span className="text-xs text-gray-400 font-normal"> / {product.unit || 'pcs'}</span>
                                        </div>
                                    </button>
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
                                ? `Rp${minPrice.toLocaleString('id-ID')}`
                                : `Rp${minPrice.toLocaleString('id-ID')} - Rp${maxPrice.toLocaleString('id-ID')}`

                            return (
                                <button
                                    key={group.name}
                                    onClick={() => !allOutOfStock && setSelectingGroup(group)}
                                    disabled={allOutOfStock}
                                    className={`relative rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
                                        allOutOfStock
                                            ? 'border-red-200 bg-red-50/50 opacity-60 cursor-not-allowed'
                                            : 'border-gray-200 hover:border-black active:bg-gray-50 cursor-pointer'
                                    }`}
                                >
                                    {groupQtyInCart > 0 && (
                                        <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black text-xs font-bold text-white shadow">
                                            {groupQtyInCart}
                                        </span>
                                    )}
                                    {allOutOfStock && (
                                        <span className="absolute -left-1 -top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
                                            HABIS
                                        </span>
                                    )}
                                    <div className="font-semibold text-gray-900">{group.name}</div>
                                    <div className="mt-1 text-sm font-medium text-gray-600">
                                        {priceDisplay}
                                    </div>
                                </button>
                            )
                        })}
                    </div>

                    {groupedProducts.length === 0 && (
                        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
                            Belum ada produk aktif. Tambah dulu di menu Master Produk.
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:sticky sm:top-4 sm:self-start">
                    <h2 className="mb-3 font-bold text-gray-900">
                        Keranjang {itemCount > 0 ? `(${itemCount})` : ''}
                    </h2>

                    <div className="space-y-3">
                        {Object.values(cart).map((item) => (
                            <div key={item.product_id} className="flex items-center justify-between text-sm">
                                <div>
                                    <span className="font-medium text-gray-800">{item.name}</span>
                                    <div className="text-[11px] text-gray-400">
                                        Rp{item.price.toLocaleString('id-ID')} / {item.unit || 'pcs'}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => changeQty(item.product_id, -1)}
                                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-300 bg-gray-50 text-base font-bold text-gray-700 hover:bg-gray-100"
                                    >
                                        -
                                    </button>
                                    <span className="w-5 text-center font-semibold text-gray-900">
                                        {item.quantity}
                                    </span>
                                    <button
                                        onClick={() => changeQty(item.product_id, 1)}
                                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-300 bg-gray-50 text-base font-bold text-gray-700 hover:bg-gray-100"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        ))}

                        {Object.keys(cart).length === 0 && (
                            <p className="py-4 text-center text-sm text-gray-400">Keranjang masih kosong.</p>
                        )}
                    </div>

                    <div className="my-4 border-t border-gray-100 pt-3">
                        <div className="flex items-baseline justify-between">
                            <span className="text-xs font-semibold uppercase text-gray-500">Total</span>
                            <span className="text-xl font-extrabold text-gray-900">
                                Rp{total.toLocaleString('id-ID')}
                            </span>
                        </div>
                    </div>

                    <label className="mb-1 block text-xs font-medium text-gray-700">Channel Penjualan</label>
                    <select
                        value={channel}
                        onChange={(e) => setChannel(e.target.value)}
                        className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none"
                    >
                        {CHANNELS.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>

                    <label className="mb-1 block text-xs font-medium text-gray-700">Metode Bayar</label>
                    <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="mb-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none"
                    >
                        {PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </select>

                    <button
                        onClick={handleSubmit}
                        disabled={saving || Object.keys(cart).length === 0 || !selectedBranch}
                        className="w-full rounded-lg bg-black py-3 text-sm font-semibold text-white shadow transition hover:bg-gray-800 disabled:opacity-50"
                    >
                        {saving ? 'Menyimpan...' : 'Simpan Transaksi'}
                    </button>

                    {message && (
                        <p className={`mt-3 text-center text-xs font-semibold ${
                            message.startsWith('Gagal') ? 'text-red-600' : 'text-green-600'
                        }`}>
                            {message}
                        </p>
                    )}
                </div>
            </div>

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
        </div>
    )
}