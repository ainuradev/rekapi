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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px] animate-in fade-in duration-150">
            <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
                {/* Header Pinned */}
                <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                    <h2 className="text-xs sm:text-sm font-bold text-slate-900">Edit Transaksi</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-base font-bold cursor-pointer">
                        ✕
                    </button>
                </div>

                {/* Body Scrollable */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 text-xs">
                    {isMultiInstallmentLocked && (
                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                            <p className="font-bold flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5 text-amber-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                <span>Transaksi Terkunci dari Pengeditan</span>
                            </p>
                            <p className="mt-1 text-slate-600 leading-relaxed">
                                Transaksi ini memiliki beberapa catatan pembayaran cicilan. Sesuai kebijakan backend 0036, silakan batalkan transaksi dengan tombol <strong>Void</strong> lalu buat transaksi baru.
                            </p>
                        </div>
                    )}

                    <div className="space-y-2.5">
                        {items.map((item) => {
                            const currentStock = stockByProductId.get(item.product_id)?.currentStock ?? 0
                            const maxAvailable = getMaxAvailableForProduct(item.product_id)
                            const isOverStock = item.quantity > maxAvailable || item.quantity <= 0

                            return (
                                <div
                                    key={item.product_id}
                                    className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 transition ${
                                        isOverStock
                                            ? 'border-red-300 bg-red-50/60'
                                            : 'border-slate-200 bg-slate-50/60'
                                    }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <span className="block truncate text-xs font-semibold text-slate-900">{item.name}</span>
                                        <div className="text-[11px] text-slate-500">
                                            @Rp {item.price.toLocaleString('id-ID')} / {item.unit || 'pcs'}
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
                                            className="h-7 w-7 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
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
                                            className={`h-7 w-14 rounded-lg border bg-white px-1 text-center text-xs font-bold text-slate-900 focus:outline-none ${
                                                isOverStock
                                                    ? 'border-red-400 text-red-700 focus:border-red-600'
                                                    : 'border-slate-300 focus:border-emerald-600'
                                            }`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => changeQty(item.product_id, 1)}
                                            className={`h-7 w-7 rounded-lg border bg-white text-sm font-bold transition cursor-pointer ${
                                                item.quantity >= maxAvailable
                                                    ? 'border-slate-200 text-slate-300 cursor-not-allowed'
                                                    : 'border-slate-300 text-slate-700 hover:bg-slate-100'
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
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-2.5">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Tambah Item Produk ke Transaksi
                            </label>
                            <div className="flex gap-2">
                                <select
                                    value={selectedNewProductId}
                                    onChange={(e) => setSelectedNewProductId(e.target.value)}
                                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-emerald-600 focus:outline-none"
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
                                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-40 transition cursor-pointer"
                                >
                                    Tambah
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 flex items-baseline justify-between">
                        <span className="text-[11px] font-semibold uppercase text-slate-500">Total Baru</span>
                        <span className="text-base font-extrabold text-slate-900 tabular-nums">Rp {total.toLocaleString('id-ID')}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Channel</label>
                            <select
                                value={channel}
                                onChange={(e) => setChannel(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none capitalize"
                            >
                                {CHANNELS.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Metode Bayar</label>
                            <select
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none uppercase font-semibold"
                            >
                                {PAYMENT_METHODS.map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Alasan / Catatan Perubahan (Opsional)
                        </label>
                        <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Contoh: Salah hitung porsi, pelanggan ganti pembayaran, dll."
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
                        />
                    </div>

                    {activeError && (
                        <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-medium text-red-700">
                            {activeError}
                        </p>
                    )}
                </div>

                {/* Footer Pinned */}
                <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                    >
                        Batal
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || items.length === 0 || !liveStockCheck.ok || isMultiInstallmentLocked}
                        className="px-4 py-1.5 rounded-lg bg-slate-900 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
                    >
                        {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </button>
                </div>
            </div>
        </div>
    )
}
