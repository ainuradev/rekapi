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
}: {
    isOwner: boolean
    hasStockColumn: boolean
}) {
    const router = useRouter()
    const [name, setName] = useState('')
    const [sellingPrice, setSellingPrice] = useState('')
    const [costPrice, setCostPrice] = useState('')
    const [stock, setStock] = useState('')
    const [unit, setUnit] = useState('porsi')
    const [customUnit, setCustomUnit] = useState('')
    const [category, setCategory] = useState('')
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
        if (costPrice) formData.append('cost_price', costPrice)
        if (stock) formData.append('stock', stock)
        if (category) formData.append('category', category)

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
        setCategory('')
        setCustomUnit('')
        router.refresh()
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="mb-8 space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        >
            <h2 className="text-base font-semibold text-gray-900">Tambah Produk Baru</h2>

            {errorMsg && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                    ❌ {errorMsg}
                </div>
            )}

            {successMsg && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-xs font-semibold text-green-700">
                    ✅ {successMsg}
                </div>
            )}

            <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nama Produk</label>
                <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Dimsum Mentai Original"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Harga Jual (Rp)</label>
                    <input
                        type="number"
                        required
                        min={1}
                        value={sellingPrice}
                        onChange={(e) => setSellingPrice(e.target.value)}
                        placeholder="25000"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                    />
                </div>

                {/* Satuan Penjualan */}
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                        Satuan Penjualan
                    </label>
                    <div className="space-y-1.5">
                        <select
                            value={unit}
                            onChange={(e) => setUnit(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
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
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                            />
                        )}
                    </div>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                {isOwner && (
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            HPP / Harga Modal (Rp) <span className="text-gray-400 font-normal">(opsional)</span>
                        </label>
                        <input
                            type="number"
                            min={0}
                            value={costPrice}
                            onChange={(e) => setCostPrice(e.target.value)}
                            placeholder="15000"
                            className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                        />
                    </div>
                )}

                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                        Kategori <span className="text-gray-400 font-normal">(opsional)</span>
                    </label>
                    <input
                        type="text"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        placeholder="Makanan / Minuman / Topping"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                    />
                </div>
            </div>

            {isOwner && hasStockColumn && (
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                        Stok Awal ({unit === 'lainnya' ? customUnit || 'satuan' : unit}) <span className="text-gray-400 font-normal">(opsional)</span>
                    </label>
                    <input
                        type="number"
                        min={0}
                        value={stock}
                        onChange={(e) => setStock(e.target.value)}
                        placeholder="0"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                    />
                </div>
            )}

            <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-black py-3 text-sm font-semibold text-white shadow hover:bg-gray-800 transition active:scale-[0.99] disabled:opacity-50"
            >
                {saving ? 'Menyimpan...' : 'Tambah Produk'}
            </button>

            {!isOwner && (
                <p className="text-xs text-gray-500">
                    ℹ️ HPP produk ini akan diverifikasi dan diisi oleh Owner belakangan.
                </p>
            )}
        </form>
    )
}
