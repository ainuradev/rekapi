'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
    updateStock,
    updateBranchStock,
    updateCostPrice,
    updateProductImage,
    toggleProductStatus,
    ProductStockReductionReason,
} from './actions'
import { uploadImageWithCompression } from '@/lib/cloudinary-upload'
import AddProductForm from './add-product-form'

export interface ProductItem {
    id: string
    name: string
    selling_price: number
    cost_price: number
    category?: string | null
    status: string
    stock: number
    unit: string
    image_url?: string | null
    created_at?: string
}

export interface ProductVariantGroup {
    name: string
    category?: string | null
    variants: ProductItem[]
}

export interface BranchOption {
    id: string
    name: string
}

interface ProductCatalogClientProps {
    groupedProducts: ProductVariantGroup[]
    branches: BranchOption[]
    selectedBranchFilter: string
    currentBranchName?: string
    isOwner: boolean
    hasStockColumn: boolean
}

// ── KOMPONEN EDITOR HPP CEPAT (INLINE) ──────────────────────────────────────
function CostPriceField({
    productId,
    initialCost,
}: {
    productId: string
    initialCost: number
}) {
    const router = useRouter()
    const [isEditing, setIsEditing] = useState(false)
    const [cost, setCost] = useState(initialCost)
    const [input, setInput] = useState(String(initialCost))
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        const val = Number(input)
        if (isNaN(val) || val < 0) return
        setSaving(true)
        const res = await updateCostPrice(productId, val)
        setSaving(false)
        if (!res?.error) {
            setCost(val)
            setIsEditing(false)
            router.refresh()
        }
    }

    if (isEditing) {
        return (
            <div className="inline-flex items-center gap-1">
                <input
                    type="number"
                    min={0}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSave()
                        if (e.key === 'Escape') setIsEditing(false)
                    }}
                    autoFocus
                    className="w-20 rounded border border-emerald-600 bg-white px-1.5 py-0.5 text-xs font-semibold tabular-nums text-slate-900 focus:outline-none"
                />
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded bg-emerald-800 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-900 cursor-pointer"
                >
                    {saving ? '...' : '✓'}
                </button>
                <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="text-[11px] text-slate-400 hover:text-slate-600 px-0.5 cursor-pointer"
                >
                    ✕
                </button>
            </div>
        )
    }

    return (
        <button
            type="button"
            onClick={() => {
                setInput(String(cost))
                setIsEditing(true)
            }}
            className="group inline-flex items-center gap-1 text-xs text-slate-600 hover:text-emerald-900 cursor-pointer"
            title="Klik untuk ubah HPP"
        >
            <span className="font-semibold tabular-nums text-slate-700 group-hover:text-emerald-900">
                Rp {cost.toLocaleString('id-ID')}
            </span>
            <span className="text-[10px] text-slate-300 group-hover:text-emerald-700">✎</span>
        </button>
    )
}

// ── MODAL UBAH STOK CEPAT ───────────────────────────────────────────────────
function StockEditModal({
    product,
    branchId,
    branchName,
    branches,
    hasStockColumn,
    onClose,
}: {
    product: ProductItem
    branchId: string | null
    branchName?: string
    branches: BranchOption[]
    hasStockColumn: boolean
    onClose: () => void
}) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [targetBranchId, setTargetBranchId] = useState(branchId || (branches[0]?.id ?? ''))
    const [inputValue, setInputValue] = useState(String(product.stock ?? 0))
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [reductionReason, setReductionReason] = useState<ProductStockReductionReason>('waste_expired')
    const [reductionNotes, setReductionNotes] = useState('')

    const currentStock = Number(product.stock ?? 0)
    const newStock = Number(inputValue)
    const isReduction = !isNaN(newStock) && newStock < currentStock
    const qtyReduced = isReduction ? currentStock - newStock : 0

    const quickAdjust = (delta: number) => {
        const current = Number(inputValue) || 0
        const next = Math.max(0, current + delta)
        setInputValue(String(next))
    }

    const handleSave = () => {
        const val = Number(inputValue)
        if (isNaN(val) || val < 0) {
            setErrorMsg('Stok harus angka valid >= 0')
            return
        }

        setErrorMsg(null)
        startTransition(async () => {
            const options = isReduction ? { reason: reductionReason, notes: reductionNotes } : undefined
            const res = targetBranchId
                ? await updateBranchStock(product.id, targetBranchId, val, options)
                : await updateStock(product.id, val, options)

            if (res?.error) {
                setErrorMsg(res.error)
            } else {
                onClose()
                router.refresh()
            }
        })
    }

    if (!hasStockColumn) {
        return null
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px]">
            <div className="w-full max-w-sm sm:max-w-md max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
                {/* Header Tetap */}
                <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900">Ubah Stok Fisik</h3>
                        <p className="text-xs text-slate-500 font-medium truncate max-w-[240px]">
                            {product.name} ({product.unit || 'pcs'})
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                        aria-label="Tutup"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body Scrollable */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {/* Pemilihan Cabang Target jika belum spesifik */}
                    {branches.length > 1 && (
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Cabang Target
                            </label>
                            <select
                                value={targetBranchId}
                                onChange={(e) => setTargetBranchId(e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none cursor-pointer"
                            >
                                {branches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {branches.length <= 1 && (
                        <div className="text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                            Lokasi: <strong className="text-slate-700">{branchName || branches[0]?.name || 'Cabang Utama'}</strong>
                        </div>
                    )}

                    {/* Input Stok & Tombol Quick Adjust */}
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Jumlah Stok Baru ({product.unit || 'pcs'})
                        </label>
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => quickAdjust(-5)}
                                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                            >
                                -5
                            </button>
                            <button
                                type="button"
                                onClick={() => quickAdjust(-1)}
                                className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                            >
                                -1
                            </button>
                            <input
                                type="number"
                                min={0}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSave()
                                }}
                                autoFocus
                                className="w-full rounded border border-slate-200 bg-white px-3 py-1 text-sm font-bold text-slate-900 text-center tabular-nums focus:border-emerald-600 focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => quickAdjust(1)}
                                className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                            >
                                +1
                            </button>
                            <button
                                type="button"
                                onClick={() => quickAdjust(5)}
                                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                            >
                                +5
                            </button>
                        </div>
                    </div>

                    {/* Pilihan Kategori Alasan Pengurangan Stok jika stok berkurang */}
                    {isReduction && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2.5">
                            <div>
                                <label className="block text-[11px] font-bold text-amber-900 mb-1">
                                    Alasan Pengurangan Stok ({qtyReduced} {product.unit || 'pcs'} berkurang)
                                </label>
                                <select
                                    value={reductionReason}
                                    onChange={(e) => setReductionReason(e.target.value as ProductStockReductionReason)}
                                    className="w-full rounded border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-amber-600 focus:outline-none"
                                >
                                    <option value="waste_expired">Rusak / Kadaluarsa (Masuk Beban Laba Rugi)</option>
                                    <option value="lost_shrinkage">Hilang / Selisih Opname (Masuk Beban Laba Rugi)</option>
                                    <option value="production_usage">Pemakaian Operasional / Tester</option>
                                    <option value="input_correction">Koreksi Salah Input (Tanpa Beban)</option>
                                </select>
                            </div>

                            {/* Edukasi & Estimasi Nominal Beban Non-Kas */}
                            {['waste_expired', 'lost_shrinkage'].includes(reductionReason) && (
                                <div className="text-[11px] text-amber-900 leading-snug pt-1 border-t border-amber-200/60">
                                    <div className="flex items-center justify-between font-bold">
                                        <span>Estimasi Beban Kerugian:</span>
                                        <span className="font-mono text-rose-700 font-bold">
                                            Rp {Math.round(qtyReduced * Number(product.cost_price || 0)).toLocaleString('id-ID')}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-[10px] text-amber-800">
                                        <span className="font-semibold text-amber-900">Beban Non-Kas:</span> Mengurangi laba di Laporan Laba Rugi, <strong>tidak memotong saldo kas/bank</strong>.
                                    </p>
                                </div>
                            )}

                            <div>
                                <input
                                    type="text"
                                    placeholder="Catatan tambahan (opsional)..."
                                    value={reductionNotes}
                                    onChange={(e) => setReductionNotes(e.target.value)}
                                    className="w-full rounded border border-amber-200 bg-white px-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500"
                                />
                            </div>
                        </div>
                    )}

                    {errorMsg && (
                        <div className="text-xs text-rose-600 font-semibold bg-rose-50 p-2 rounded border border-rose-100">
                            {errorMsg}
                        </div>
                    )}
                </div>

                {/* Footer Tetap */}
                <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isPending}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
                    >
                        Batal
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isPending}
                        className="rounded-lg bg-emerald-800 px-4 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-900 disabled:opacity-50 transition cursor-pointer"
                    >
                        {isPending ? 'Menyimpan...' : 'Simpan Stok'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── KOMPONEN UTAMA CLIENT ──────────────────────────────────────────────────
export default function ProductCatalogClient({
    groupedProducts,
    branches,
    selectedBranchFilter,
    currentBranchName,
    isOwner,
    hasStockColumn,
}: ProductCatalogClientProps) {
    const router = useRouter()
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string>('all')
    const [selectedStockStatus, setSelectedStockStatus] = useState<string>('all')
    const [showAddForm, setShowAddForm] = useState(false)
    const [editingStockProduct, setEditingStockProduct] = useState<ProductItem | null>(null)
    const [editingPhotoProduct, setEditingPhotoProduct] = useState<ProductItem | null>(null)
    const [photoUploading, setPhotoUploading] = useState(false)
    const [photoError, setPhotoError] = useState<string | null>(null)
    const photoInputRef = useRef<HTMLInputElement>(null)
    const [togglingProductId, setTogglingProductId] = useState<string | null>(null)

    const handleUploadProductPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !editingPhotoProduct) return
        setPhotoError(null)
        setPhotoUploading(true)
        try {
            const uploaded = await uploadImageWithCompression(file, 'product')
            const res = await updateProductImage(editingPhotoProduct.id, uploaded.url)
            if (res.error) {
                setPhotoError(res.error)
            } else {
                setEditingPhotoProduct({ ...editingPhotoProduct, image_url: uploaded.url })
                router.refresh()
            }
        } catch (err) {
            setPhotoError(err instanceof Error ? err.message : 'Gagal mengunggah foto produk.')
        } finally {
            setPhotoUploading(false)
            if (photoInputRef.current) photoInputRef.current.value = ''
        }
    }

    const handleRemoveProductPhoto = async () => {
        if (!editingPhotoProduct) return
        setPhotoError(null)
        setPhotoUploading(true)
        try {
            const res = await updateProductImage(editingPhotoProduct.id, null)
            if (res.error) {
                setPhotoError(res.error)
            } else {
                setEditingPhotoProduct({ ...editingPhotoProduct, image_url: null })
                router.refresh()
            }
        } finally {
            setPhotoUploading(false)
        }
    }

    // Perhitungan Statistik Ringkas (Stat Strip)
    const allVariants = groupedProducts.flatMap((g) => g.variants)
    const totalProducts = groupedProducts.length
    const totalVariants = allVariants.length
    const totalStockQty = allVariants.reduce((acc, curr) => acc + (curr.stock ?? 0), 0)
    const outOfStockCount = allVariants.filter((v) => (v.stock ?? 0) === 0).length
    const lowStockCount = allVariants.filter((v) => (v.stock ?? 0) > 0 && (v.stock ?? 0) <= 5).length

    // Filter Produk Berdasarkan Pencarian, Kategori, dan Status Stok
    const filteredGroups = groupedProducts
        .map((group) => {
            const matchedVariants = group.variants.filter((v) => {
                // Filter Kategori
                if (selectedCategory !== 'all') {
                    if ((v.category || 'makanan') !== selectedCategory) return false
                }

                // Filter Status Stok
                if (selectedStockStatus === 'habis' && (v.stock ?? 0) !== 0) return false
                if (selectedStockStatus === 'menipis' && ((v.stock ?? 0) === 0 || (v.stock ?? 0) > 5)) return false
                if (selectedStockStatus === 'tersedia' && (v.stock ?? 0) <= 5) return false

                return true
            })

            // Filter Pencarian Nama
            const matchesQuery =
                group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                matchedVariants.some((v) => v.unit?.toLowerCase().includes(searchQuery.toLowerCase()))

            if (!matchesQuery || matchedVariants.length === 0) return null

            return {
                ...group,
                variants: matchedVariants,
            }
        })
        .filter((g): g is ProductVariantGroup => g !== null)

    // Flattening untuk Data Sheet Table
    const flattenedProducts = filteredGroups.flatMap((group) =>
        group.variants.map((v) => ({
            ...v,
            groupName: group.name,
            isMultiVariant: group.variants.length > 1,
        }))
    )

    const activeBranchId = selectedBranchFilter !== 'all' ? selectedBranchFilter : null

    const handleToggleStatus = async (product: ProductItem) => {
        setTogglingProductId(product.id)
        try {
            await toggleProductStatus(product.id, product.status)
            router.refresh()
        } finally {
            setTogglingProductId(null)
        }
    }

    return (
        <div className="space-y-6">
            {/* 1. STAT STRIP HORIZONTAL (1 Baris Bersih, Zero-Icon) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-200 border border-slate-200 rounded-lg bg-white shadow-2xs overflow-hidden">
                <div className="p-4 sm:p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Total Menu
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-slate-900 tabular-nums">
                            {totalProducts}
                        </span>
                        <span className="text-xs text-slate-400">({totalVariants} satuan)</span>
                    </div>
                </div>

                <div className="p-4 sm:p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Total Fisik Stok
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-slate-900 tabular-nums">
                            {totalStockQty.toLocaleString('id-ID')}
                        </span>
                        <span className="text-xs text-slate-400">unit</span>
                    </div>
                </div>

                <div className="p-4 sm:p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        <span>Stok Menipis</span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-amber-900 tabular-nums">
                            {lowStockCount}
                        </span>
                        <span className="text-xs text-slate-400">item (&le; 5)</span>
                    </div>
                </div>

                <div className="p-4 sm:p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                        <span>Stok Habis</span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-rose-900 tabular-nums">
                            {outOfStockCount}
                        </span>
                        <span className="text-xs text-slate-400">item kosong</span>
                    </div>
                </div>
            </div>

            {/* 2. CONTROLS: PENCARIAN, FILTER KATEGORI, STATUS STOK & TAMBAH */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 max-w-sm">
                    <div className="relative w-full">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Cari nama menu / satuan produk..."
                            className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-4 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none transition shadow-2xs"
                        />
                        <svg className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Filter Kategori (Clean Text) */}
                    <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200">
                        {[
                            { id: 'all', label: 'Semua' },
                            { id: 'makanan', label: 'Makanan' },
                            { id: 'minuman', label: 'Minuman' },
                            { id: 'lainnya', label: 'Lainnya' },
                        ].map((cat) => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`rounded px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                                    selectedCategory === cat.id
                                        ? 'bg-white text-slate-900 shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Filter Level Stok (Indikator Dot Halus) */}
                    <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200">
                        {[
                            { id: 'all', label: 'Semua Stok', dot: null },
                            { id: 'tersedia', label: 'Aman', dot: 'bg-emerald-600' },
                            { id: 'menipis', label: 'Menipis', dot: 'bg-amber-500' },
                            { id: 'habis', label: 'Habis', dot: 'bg-rose-500' },
                        ].map((st) => (
                            <button
                                key={st.id}
                                type="button"
                                onClick={() => setSelectedStockStatus(st.id)}
                                className={`rounded px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                                    selectedStockStatus === st.id
                                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                {st.dot && <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />}
                                <span>{st.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Tombol Toggle Form Tambah Produk */}
                    {isOwner && (
                        <button
                            type="button"
                            onClick={() => setShowAddForm(!showAddForm)}
                            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                showAddForm
                                    ? 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                                    : 'bg-emerald-800 text-white hover:bg-emerald-900 shadow-2xs'
                            }`}
                        >
                            <span>{showAddForm ? '✕ Tutup Form' : '+ Tambah Produk'}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Form Tambah Produk (Collapsible) */}
            {showAddForm && isOwner && (
                <div className="transition-all animate-in fade-in duration-200">
                    <AddProductForm
                        isOwner={isOwner}
                        hasStockColumn={hasStockColumn}
                        selectedBranchId={activeBranchId}
                    />
                </div>
            )}

            {/* 3. DATA SHEET VIEW (Tabel Bersih di Desktop & Sheet Ringkas di Mobile) */}
            {flattenedProducts.length > 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-2xs">
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3">Nama Produk</th>
                                    <th className="px-4 py-3">Kategori</th>
                                    <th className="px-4 py-3 text-right">Harga Jual</th>
                                    {isOwner && <th className="px-4 py-3 text-right">HPP</th>}
                                    {isOwner && <th className="px-4 py-3 text-center">Margin</th>}
                                    <th className="px-4 py-3">Stok Cabang</th>
                                    <th className="px-4 py-3 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {flattenedProducts.map((p) => {
                                    const isOutOfStock = (p.stock ?? 0) === 0
                                    const isLowStock = (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 5
                                    const marginAmount = p.selling_price - (p.cost_price || 0)
                                    const marginPercent = p.cost_price > 0
                                        ? Math.round((marginAmount / p.selling_price) * 100)
                                        : null

                                    return (
                                        <tr key={p.id} className="hover:bg-slate-50/70 transition">
                                            {/* Nama Produk, Thumbnail Foto & Satuan */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setPhotoError(null)
                                                            setEditingPhotoProduct(p)
                                                        }}
                                                        title="Klik untuk lihat / ubah foto produk"
                                                        className="relative h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center hover:border-emerald-600 transition cursor-pointer group"
                                                    >
                                                        {p.image_url ? (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img
                                                                src={p.image_url}
                                                                alt={p.name}
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : (
                                                            <svg className="w-4 h-4 text-slate-400 group-hover:text-emerald-700 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                    <span
                                                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                            isOutOfStock
                                                                ? 'bg-rose-500'
                                                                : isLowStock
                                                                ? 'bg-amber-500'
                                                                : 'bg-emerald-600'
                                                        }`}
                                                    />
                                                    <span className="font-semibold text-slate-900">
                                                        {p.name}
                                                    </span>
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                                                        {p.unit || 'pcs'}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Kategori */}
                                            <td className="px-4 py-3 text-slate-600 capitalize">
                                                {p.category || 'makanan'}
                                            </td>

                                            {/* Harga Jual */}
                                            <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                                                Rp {p.selling_price.toLocaleString('id-ID')}
                                            </td>

                                            {/* HPP (Owner only) */}
                                            {isOwner && (
                                                <td className="px-4 py-3 text-right tabular-nums">
                                                    <CostPriceField productId={p.id} initialCost={p.cost_price} />
                                                </td>
                                            )}

                                            {/* Margin (Owner only) */}
                                            {isOwner && (
                                                <td className="px-4 py-3 text-center">
                                                    {marginPercent !== null ? (
                                                        <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 tabular-nums">
                                                            {marginPercent}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400">-</span>
                                                    )}
                                                </td>
                                            )}

                                            {/* Stok Cabang */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold tabular-nums text-slate-800">
                                                        {p.stock ?? 0} {p.unit || 'pcs'}
                                                    </span>
                                                    <span
                                                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                            isOutOfStock
                                                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                                                : isLowStock
                                                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                                                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                        }`}
                                                    >
                                                        {isOutOfStock ? 'Habis' : isLowStock ? 'Menipis' : 'Aman'}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Aksi (Ubah Stok & Toggle Status) */}
                                            <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                                                {hasStockColumn && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingStockProduct(p)}
                                                        className="rounded px-2.5 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer"
                                                    >
                                                        Ubah Stok
                                                    </button>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleStatus(p)}
                                                    disabled={togglingProductId === p.id}
                                                    className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase transition cursor-pointer ${
                                                        p.status === 'aktif'
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                                            : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                                                    }`}
                                                    title="Ubah status produk"
                                                >
                                                    {togglingProductId === p.id ? '...' : p.status}
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Sheet View (2 Kolom Ringkas, Bebas Horizontal Scroll) */}
                    <div className="md:hidden divide-y divide-slate-100">
                        {flattenedProducts.map((p) => {
                            const isOutOfStock = (p.stock ?? 0) === 0
                            const isLowStock = (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 5

                            return (
                                <div key={p.id} className="p-3.5 flex items-center justify-between gap-2.5">
                                    {/* Kolom Kiri: Thumbnail, Nama & Kategori */}
                                    <div className="min-w-0 flex-1 flex items-center gap-2.5">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPhotoError(null)
                                                setEditingPhotoProduct(p)
                                            }}
                                            title="Klik untuk lihat / ubah foto produk"
                                            className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center cursor-pointer"
                                        >
                                            {p.image_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={p.image_url}
                                                    alt={p.name}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                            )}
                                        </button>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span
                                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                        isOutOfStock
                                                            ? 'bg-rose-500'
                                                            : isLowStock
                                                            ? 'bg-amber-500'
                                                            : 'bg-emerald-600'
                                                    }`}
                                                />
                                                <span className="font-semibold text-xs text-slate-900 truncate">
                                                    {p.name}
                                                </span>
                                                <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-600 uppercase shrink-0">
                                                    {p.unit || 'pcs'}
                                                </span>
                                            </div>

                                            <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                                                <span className="capitalize">{p.category || 'makanan'}</span>
                                                <span>•</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleStatus(p)}
                                                    disabled={togglingProductId === p.id}
                                                    className={`font-bold uppercase ${
                                                        p.status === 'aktif' ? 'text-emerald-700' : 'text-slate-400'
                                                    }`}
                                                >
                                                    {togglingProductId === p.id ? '...' : p.status}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Kolom Kanan: Harga, Stok & Tombol Ubah */}
                                    <div className="text-right shrink-0">
                                        <div className="text-xs font-bold tabular-nums text-slate-900">
                                            Rp {p.selling_price.toLocaleString('id-ID')}
                                        </div>

                                        <div className="mt-1 flex items-center justify-end gap-1.5">
                                            <span className="text-[11px] font-medium tabular-nums text-slate-600">
                                                Stok {p.stock ?? 0}
                                            </span>

                                            {hasStockColumn && (
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingStockProduct(p)}
                                                    className="rounded px-2 py-0.5 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer"
                                                >
                                                    Ubah
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-12 text-center text-xs text-slate-400">
                    <p className="font-semibold text-slate-700 text-sm">Tidak ada produk yang cocok</p>
                    <p className="mt-1 text-slate-400">Coba sesuaikan kata kunci pencarian atau filter Anda.</p>
                    <button
                        type="button"
                        onClick={() => {
                            setSearchQuery('')
                            setSelectedCategory('all')
                            setSelectedStockStatus('all')
                        }}
                        className="mt-3 rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition cursor-pointer"
                    >
                        Reset Filter
                    </button>
                </div>
            )}

            {/* Modal Ubah Stok Fisik */}
            {editingStockProduct && (
                <StockEditModal
                    product={editingStockProduct}
                    branchId={activeBranchId}
                    branchName={currentBranchName}
                    branches={branches}
                    hasStockColumn={hasStockColumn}
                    onClose={() => setEditingStockProduct(null)}
                />
            )}

            {/* Modal Foto Produk (Viewport-Safe) */}
            {editingPhotoProduct && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px]"
                    onClick={() => !photoUploading && setEditingPhotoProduct(null)}
                >
                    <div
                        className="w-full max-w-sm max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <div className="min-w-0 pr-2">
                                <h3 className="text-sm font-bold text-slate-900 truncate">Foto Produk</h3>
                                <p className="text-[11px] text-slate-500 truncate">{editingPhotoProduct.name}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingPhotoProduct(null)}
                                disabled={photoUploading}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            <input
                                ref={photoInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/jpg"
                                onChange={handleUploadProductPhoto}
                                className="hidden"
                            />
                            <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-4">
                                {editingPhotoProduct.image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={editingPhotoProduct.image_url}
                                        alt={editingPhotoProduct.name}
                                        className="h-44 w-44 rounded-xl object-cover border border-slate-200 bg-white shadow-xs"
                                    />
                                ) : (
                                    <div className="h-36 w-36 rounded-xl border border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-400 gap-1.5">
                                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-[11px] font-medium">Belum ada foto</span>
                                    </div>
                                )}
                                <p className="mt-2.5 text-[11px] text-slate-500 text-center">
                                    Otomatis dikompresi ke WebP 400x400px (~15–25 KB) agar hemat kuota & cepat dimuat di Kasir POS.
                                </p>
                            </div>

                            {photoError && (
                                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-700">
                                    {photoError}
                                </div>
                            )}
                        </div>

                        <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                            {editingPhotoProduct.image_url ? (
                                <button
                                    type="button"
                                    onClick={handleRemoveProductPhoto}
                                    disabled={photoUploading}
                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition cursor-pointer disabled:opacity-50"
                                >
                                    Hapus Foto
                                </button>
                            ) : (
                                <span />
                            )}
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingPhotoProduct(null)}
                                    disabled={photoUploading}
                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
                                >
                                    Tutup
                                </button>
                                <button
                                    type="button"
                                    onClick={() => photoInputRef.current?.click()}
                                    disabled={photoUploading}
                                    className="rounded-lg bg-emerald-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-900 transition cursor-pointer disabled:opacity-50"
                                >
                                    {photoUploading ? 'Memproses...' : editingPhotoProduct.image_url ? 'Ganti Foto' : 'Upload Foto'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
