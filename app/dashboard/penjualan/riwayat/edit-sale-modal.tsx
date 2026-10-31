'use client'

import { useMemo, useState } from 'react'
import { updateSale } from './actions'
import {
    computeEffectiveEditAvailableStock,
    formatInsufficientStockError,
    formatStockQuantity,
    resolveBranchProductStock,
    validateSaleStockAvailability,
} from '@/lib/sale-stock-integrity'

type SaleItem = {
    product_id: string
    quantity: number
    branch_stock_deducted?: number | null
    price: number
    cost_price: number
    products: { name: string; unit?: string } | null
}

type Sale = {
    id: string
    branch_id: string
    channel: string
    payment_method: string
    total: number
    is_edited: boolean
    transaction_date: string
    sale_items: SaleItem[]
    sale_payments?: { id: string; amount?: number; payment_date?: string }[]
}

type BranchStockEntry = {
    product_id: string
    branch_id: string
    stock: number
}

type CatalogProductEntry = {
    id: string
    name: string
    selling_price: number
    cost_price: number
    status: string
    stock: number
    unit: string
}

type EditableLine = {
    product_id: string
    name: string
    quantity: number
    price: number
    cost_price: number
    unit: string
}

const CHANNELS = ['offline', 'gofood', 'grabfood', 'shopeefood', 'whatsapp', 'qris', 'lainnya']
const PAYMENT_METHODS = ['cash', 'qris', 'transfer', 'lainnya']

export default function EditSaleModal({
    sale,
    branchStocks = [],
    catalogProducts = [],
    onClose,
    onSaved,
}: {
    sale: Sale
    branchStocks?: BranchStockEntry[]
    catalogProducts?: CatalogProductEntry[]
    onClose: () => void
    onSaved?: () => void
}) {
    // Deduplikasi item berdasarkan product_id saat modal dibuka.
    const initialDedupedItems = () => {
        const map = new Map<string, EditableLine>()
        for (const i of sale.sale_items) {
            const existing = map.get(i.product_id)
            if (existing) {
                existing.quantity = Math.round((existing.quantity + Number(i.quantity)) * 100) / 100
            } else {
                map.set(i.product_id, {
                    product_id: i.product_id,
                    name: i.products?.name ?? 'Produk',
                    quantity: Number(i.quantity),
                    price: Number(i.price),
                    cost_price: Number(i.cost_price ?? 0),
                    unit: i.products?.unit || 'pcs',
                })
            }
        }
        return Array.from(map.values())
    }

    const [items, setItems] = useState<EditableLine[]>(initialDedupedItems)
    const [selectedNewProductId, setSelectedNewProductId] = useState<string>('')
    const [channel, setChannel] = useState(sale.channel)
    const [paymentMethod, setPaymentMethod] = useState(sale.payment_method)
    const [reason, setReason] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Peta kuantitas lama per produk pada struk ini
    const oldItemSummaryMap = useMemo(() => {
        const map = new Map<string, { oldQty: number; deductedQty: number | null }>()
        for (const old of sale.sale_items) {
            const qty = Math.max(0, Number(old.quantity) || 0)
            const hasDeducted =
                old.branch_stock_deducted !== null &&
                old.branch_stock_deducted !== undefined &&
                Number.isFinite(Number(old.branch_stock_deducted))
            const itemDeducted = hasDeducted ? Math.max(0, Math.min(qty, Number(old.branch_stock_deducted))) : null

            const prev = map.get(old.product_id)
            if (!prev) {
                map.set(old.product_id, { oldQty: qty, deductedQty: itemDeducted })
            } else {
                map.set(old.product_id, {
                    oldQty: Math.round((prev.oldQty + qty) * 100) / 100,
                    deductedQty:
                        prev.deductedQty !== null && itemDeducted !== null
                            ? Math.round((prev.deductedQty + itemDeducted) * 100) / 100
                            : null,
                })
            }
        }
        return map
    }, [sale.sale_items])

    const catalogMap = useMemo(
        () => new Map(catalogProducts.map((p) => [p.id, p])),
        [catalogProducts]
    )

    // Peta stok cabang saat ini untuk seluruh produk terkait
    const stockByProductId = useMemo(() => {
        const map = new Map<string, { currentStock: number; name?: string }>()
        const allIds = new Set<string>([
            ...catalogProducts.map((p) => p.id),
            ...items.map((i) => i.product_id),
            ...sale.sale_items.map((i) => i.product_id),
        ])

        for (const pid of allIds) {
            const cat = catalogMap.get(pid)
            const line = items.find((i) => i.product_id === pid)
            const currentStock = resolveBranchProductStock({
                productId: pid,
                branchId: sale.branch_id,
                branchStocks,
                fallbackProductStock: cat?.stock ?? 0,
            })
            map.set(pid, {
                currentStock,
                name: line?.name || cat?.name || 'Produk',
            })
        }
        return map
    }, [catalogProducts, catalogMap, items, sale.sale_items, sale.branch_id, branchStocks])

    function getMaxAvailableForProduct(productId: string): number {
        const currentStock = stockByProductId.get(productId)?.currentStock ?? 0
        const oldSummary = oldItemSummaryMap.get(productId)
        return computeEffectiveEditAvailableStock(
            currentStock,
            oldSummary?.oldQty ?? 0,
            oldSummary?.deductedQty ?? null
        )
    }

    // Validasi real-time terhadap seluruh baris item yang sedang diedit
    const liveStockCheck = useMemo(
        () =>
            validateSaleStockAvailability({
                requestedItems: items,
                oldItems: sale.sale_items,
                stockByProductId,
            }),
        [items, sale.sale_items, stockByProductId]
    )

    const total = items.reduce((sum, i) => sum + i.price * (Number.isFinite(i.quantity) && i.quantity > 0 ? i.quantity : 0), 0)

    const addableProducts = useMemo(() => {
        const inReceipt = new Set(items.map((i) => i.product_id))
        return catalogProducts.filter((p) => p.status === 'aktif' && !inReceipt.has(p.id))
    }, [catalogProducts, items])

    function changeQty(productId: string, delta: number) {
        const target = items.find((i) => i.product_id === productId)
        if (!target) return

        const maxAvailable = getMaxAvailableForProduct(productId)
        const nextQty = Math.round((target.quantity + delta) * 100) / 100

        if (delta > 0 && nextQty > maxAvailable) {
            setError(formatInsufficientStockError(target.name, maxAvailable))
            return
        }

        setError(null)
        setItems((prev) =>
            prev
                .map((i) => (i.product_id === productId ? { ...i, quantity: nextQty } : i))
                .filter((i) => i.quantity > 0)
        )
    }

    function setDirectQty(productId: string, rawValue: string) {
        const target = items.find((i) => i.product_id === productId)
        if (!target) return

        if (rawValue.trim() === '') {
            setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, quantity: 0 } : i)))
            setError('Kuantitas item harus berupa angka positif (> 0).')
            return
        }

        const parsed = Number(rawValue)
        if (!Number.isFinite(parsed) || parsed < 0) {
            return
        }

        const cleanQty = Math.round(parsed * 100) / 100
        const maxAvailable = getMaxAvailableForProduct(productId)

        setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, quantity: cleanQty } : i)))

        if (cleanQty <= 0) {
            setError('Kuantitas item harus berupa angka positif (> 0).')
        } else if (cleanQty > maxAvailable) {
            setError(formatInsufficientStockError(target.name, maxAvailable))
        } else {
            setError(null)
        }
    }

    function handleAddProduct() {
        if (!selectedNewProductId) return
        const prod = catalogMap.get(selectedNewProductId)
        if (!prod) return

        const maxAvailable = getMaxAvailableForProduct(prod.id)
        if (maxAvailable < 1) {
            setError(formatInsufficientStockError(prod.name, maxAvailable))
            return
        }

        setError(null)
        setItems((prev) => [
            ...prev,
            {
                product_id: prod.id,
                name: prod.name,
                quantity: 1,
                price: prod.selling_price,
                cost_price: prod.cost_price,
                unit: prod.unit || 'pcs',
            },
        ])
        setSelectedNewProductId('')
    }

    async function handleSave() {
        if (!liveStockCheck.ok) {
            setError(liveStockCheck.error)
            return
        }

        setSaving(true)
        setError(null)

        const result = await updateSale(sale.id, {
            channel,
            payment_method: paymentMethod,
            items,
            reason: reason.trim() || undefined,
        })

        setSaving(false)

        if (result.error) {
            setError(result.error)
            return
        }

        if (onSaved) {
            onSaved()
        } else {
            onClose()
        }
    }

    const isMultiInstallmentLocked = Boolean(sale.sale_payments && sale.sale_payments.length > 1)
    const activeError = isMultiInstallmentLocked
        ? 'Transaksi ini memiliki riwayat cicilan bertahap. Sesuai kebijakan akuntansi, transaksi tidak dapat diedit langsung. Silakan gunakan fitur Void & buat transaksi baru.'
        : error || (!liveStockCheck.ok ? liveStockCheck.error : null)

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">Edit Transaksi</h2>
                    <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-600">
                        &times;
                    </button>
                </div>

                {isMultiInstallmentLocked && (
                    <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                        <p className="font-bold flex items-center gap-1.5">
                            <span>🔒</span> Transaksi Terkunci dari Pengeditan
                        </p>
                        <p className="mt-1 text-slate-600">
                            Transaksi ini memiliki beberapa catatan pembayaran cicilan. Sesuai kebijakan backend 0036, silakan batalkan transaksi dengan tombol <strong>Void</strong> lalu buat transaksi baru.
                        </p>
                    </div>
                )}

                <div className="space-y-3">
                    {items.map((item) => {
                        const currentStock = stockByProductId.get(item.product_id)?.currentStock ?? 0
                        const maxAvailable = getMaxAvailableForProduct(item.product_id)
                        const isOverStock = item.quantity > maxAvailable || item.quantity <= 0

                        return (
                            <div
                                key={item.product_id}
                                className={`flex items-center justify-between gap-2 rounded-lg border p-3 transition ${
                                    isOverStock
                                        ? 'border-red-300 bg-red-50/60'
                                        : 'border-gray-100 bg-gray-50'
                                }`}
                            >
                                <div className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-gray-800">{item.name}</span>
                                    <div className="text-[11px] text-gray-500">
                                        @Rp{item.price.toLocaleString('id-ID')} / {item.unit || 'pcs'}
                                    </div>
                                    <div
                                        className={`mt-0.5 text-[10px] font-medium ${
                                            isOverStock ? 'text-red-600 font-semibold' : 'text-emerald-700'
                                        }`}
                                    >
                                        Maks. tersedia: {formatStockQuantity(maxAvailable)} {item.unit || 'pcs'} (sisa cabang: {formatStockQuantity(currentStock)})
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => changeQty(item.product_id, -1)}
                                        className="h-8 w-8 rounded-lg border border-gray-300 bg-white text-base font-bold text-gray-700 hover:bg-gray-100"
                                    >
                                        -
                                    </button>
                                    <input
                                        type="number"
                                        min={1}
                                        max={maxAvailable}
                                        step="any"
                                        value={item.quantity === 0 ? '' : item.quantity}
                                        onChange={(e) => setDirectQty(item.product_id, e.target.value)}
                                        aria-label={`Kuantitas ${item.name}`}
                                        className={`h-8 w-16 rounded-lg border bg-white px-1.5 text-center text-xs font-bold text-gray-900 focus:outline-none ${
                                            isOverStock
                                                ? 'border-red-400 text-red-700 focus:border-red-600'
                                                : 'border-gray-300 focus:border-black'
                                        }`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => changeQty(item.product_id, 1)}
                                        className={`h-8 w-8 rounded-lg border bg-white text-base font-bold transition ${
                                            item.quantity >= maxAvailable
                                                ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                                                : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                                        }`}
                                        title={
                                            item.quantity >= maxAvailable
                                                ? `Stok tersedia maksimal: ${formatStockQuantity(maxAvailable)}`
                                                : 'Tambah kuantitas'
                                        }
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {addableProducts.length > 0 && (
                    <div className="mt-3 flex gap-2">
                        <select
                            value={selectedNewProductId}
                            onChange={(e) => setSelectedNewProductId(e.target.value)}
                            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-800 focus:border-black focus:outline-none"
                        >
                            <option value="">+ Tambah produk lain ke struk...</option>
                            {addableProducts.map((p) => {
                                const avail = getMaxAvailableForProduct(p.id)
                                return (
                                    <option key={p.id} value={p.id}>
                                        {p.name} (Stok: {formatStockQuantity(avail)} {p.unit || 'pcs'})
                                    </option>
                                )
                            })}
                        </select>
                        <button
                            type="button"
                            onClick={handleAddProduct}
                            disabled={!selectedNewProductId}
                            className="rounded-lg border border-gray-300 bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
                        >
                            Tambah
                        </button>
                    </div>
                )}

                <div className="my-4 border-t border-gray-100 pt-3 flex items-baseline justify-between">
                    <span className="text-xs font-semibold uppercase text-gray-500">Total Baru</span>
                    <span className="text-lg font-extrabold text-gray-900">Rp{total.toLocaleString('id-ID')}</span>
                </div>

                <label className="mb-1 block text-xs font-medium text-gray-700">Channel</label>
                <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-black focus:outline-none"
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
                    className="mb-4 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-black focus:outline-none"
                >
                    {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                            {m}
                        </option>
                    ))}
                </select>

                <label className="mb-1 block text-xs font-medium text-gray-700">
                    Alasan / Catatan Perubahan (Opsional)
                </label>
                <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Contoh: Salah hitung porsi, pelanggan ganti pembayaran, dll."
                    className="mb-4 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none"
                />

                {activeError && (
                    <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                        {activeError}
                    </p>
                )}

                <div className="flex gap-2 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                    >
                        Batal
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || items.length === 0 || !liveStockCheck.ok || isMultiInstallmentLocked}
                        className="flex-1 rounded-lg bg-black py-2.5 text-sm font-semibold text-white shadow hover:bg-gray-800 transition disabled:opacity-50"
                    >
                        {saving ? 'Menyimpan...' : 'Simpan'}
                    </button>
                </div>
            </div>
        </div>
    )
}
