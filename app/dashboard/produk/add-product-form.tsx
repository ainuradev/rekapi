'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addProduct } from './actions'

const UNIT_PRESETS = [
    { value: 'porsi', label: 'Porsi (Makanan / F&B)' },
    { value: 'cup', label: 'Cup (Minuman / Kopi)' },
    { value: 'pcs', label: 'Pcs (Satuan Umum / Barang)' },
    { value: 'botol', label: 'Botol' },
    { value: 'pack', label: 'Pack / Bungkus' },
    { value: 'box', label: 'Box / Kotak' },
    { value: 'loyang', label: 'Loyang / Tray' },
    { value: 'piring', label: 'Piring' },
    { value: 'mangkok', label: 'Mangkok' },
    { value: 'slice', label: 'Slice / Potong' },
    { value: 'kg', label: 'Kg (Kilogram)' },
    { value: 'lainnya', label: 'Lainnya (Ketik sendiri)...' },
]

export default function AddProductForm({
    isOwner,
    hasStockColumn,
    selectedBranchId,
}: {
    isOwner: boolean
    hasStockColumn: boolean
    selectedBranchId?: string | null
}) {
    const router = useRouter()
    const [name, setName] = useState('')
    const [sellingPrice, setSellingPrice] = useState('')
    const [costPrice, setCostPrice] = useState('')
    const [stock, setStock] = useState('')
    const [unit, setUnit] = useState('porsi')
    const [customUnit, setCustomUnit] = useState('')
    const [category, setCategory] = useState<'makanan' | 'minuman' | 'lainnya'>('makanan')
    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setErrorMsg(null)
        setSuccessMsg(null)
        setSaving(true)

        const finalUnit = unit === 'lainnya' ? (customUnit.trim().toLowerCase() || 'pcs') : unit

        const formData = new FormData()
        formData.append('name', name)
        formData.append('selling_price', sellingPrice)
        formData.append('unit', finalUnit)
        formData.append('category', category)
        if (costPrice) formData.append('cost_price', costPrice)
        if (stock) formData.append('stock', stock)
        if (selectedBranchId && selectedBranchId !== 'all') {
            formData.append('branch_id', selectedBranchId)
        }

        const res = await addProduct(formData)
        setSaving(false)

        if (res.error) {
            setErrorMsg(res.error)
            return
        }

        setSuccessMsg(`Produk "${name}" (${finalUnit}) berhasil ditambahkan!`)
        setName('')
        setSellingPrice('')
        setCostPrice('')
        setStock('')
        setCategory('makanan')
        setCustomUnit('')
        router.refresh()
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="mb-8 space-y-4 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs"
        >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">Tambah Produk Baru</h2>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/60">
                    Katalog &amp; Inventori
                </span>
            </div>

            {errorMsg && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                    ❌ {errorMsg}
                </div>
            )}

            {successMsg && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                    ✅ {successMsg}
                </div>
            )}

            <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Produk *</label>
                <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Dimsum Mentai Original"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition"
                />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Harga Jual (Rp) *</label>
                    <input
                        type="number"
                        required
                        min={1}
                        value={sellingPrice}
                        onChange={(e) => setSellingPrice(e.target.value)}
                        placeholder="25000"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition font-semibold"
                    />
                </div>

                {/* Satuan Penjualan */}
                <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Satuan Penjualan *
                    </label>
                    <div className="space-y-1.5">
                        <select
                            value={unit}
                            onChange={(e) => setUnit(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition cursor-pointer"
                        >
                            {UNIT_PRESETS.map((p) => (
                                <option key={p.value} value={p.value}>
                                    {p.label}
                                </option>
                            ))}
                        </select>
                        {unit === 'lainnya' && (
                            <input
                                type="text"
                                required
                                value={customUnit}
                                onChange={(e) => setCustomUnit(e.target.value)}
                                placeholder="Ketik satuan, cth: tusuk / sachet"
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition"
                            />
                        )}
                    </div>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                {isOwner && (
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                            HPP / Harga Modal (Rp) <span className="text-slate-400 font-normal">(opsional)</span>
                        </label>
                        <input
                            type="number"
                            min={0}
                            value={costPrice}
                            onChange={(e) => setCostPrice(e.target.value)}
                            placeholder="15000"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition font-semibold"
                        />
                    </div>
                )}

                <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Kategori Produk *
                    </label>
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as 'makanan' | 'minuman' | 'lainnya')}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition cursor-pointer"
                    >
                        <option value="makanan">🍽️ Makanan</option>
                        <option value="minuman">☕ Minuman</option>
                        <option value="lainnya">📦 Lainnya</option>
                    </select>
                </div>
            </div>

            {isOwner && hasStockColumn && (
                <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Stok Awal ({unit === 'lainnya' ? customUnit || 'satuan' : unit}) <span className="text-slate-400 font-normal">(opsional)</span>
                    </label>
                    <input
                        type="number"
                        min={0}
                        value={stock}
                        onChange={(e) => setStock(e.target.value)}
                        placeholder="0"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition font-semibold"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                        *Stok awal akan diinisialisasi ke cabang Anda dan dapat disesuaikan per cabang di daftar produk.
                    </p>
                </div>
            )}

            <button
                type="submit"
                disabled={saving}
                className="w-full rounded-2xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
                {saving ? 'Menyimpan...' : '+ Tambah Produk ke Katalog'}
            </button>

            {!isOwner && (
                <p className="text-xs text-slate-500 text-center">
                    ℹ️ HPP produk ini akan diverifikasi dan diisi oleh Owner belakangan.
                </p>
            )}
        </form>
    )
}
