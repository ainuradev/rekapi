'use client'

import { useState } from 'react'
import { addPurchase, deletePurchase, PurchaseItemInput } from './actions'
import { getIndonesianDate } from '@/lib/date-utils'

type Branch = {
    id: string
    name: string
}

type PurchaseItem = {
    id: string
    item_name: string
    quantity: number
    price: number
    subtotal: number
}

type Purchase = {
    id: string
    branch_id: string
    supplier: string | null
    purchase_date: string
    total: number
    created_at: string
    branches: { name: string } | null
    purchase_items: PurchaseItem[]
}

interface BahanBakuClientProps {
    branches: Branch[]
    initialPurchases: Purchase[]
}

export default function BahanBakuClient({ branches, initialPurchases }: BahanBakuClientProps) {
    const today = new Date().toISOString().split('T')[0]
    const [selectedBranch, setSelectedBranch] = useState(branches[0]?.id ?? '')
    const [supplier, setSupplier] = useState('')
    const [purchaseDate, setPurchaseDate] = useState(today)

    const [items, setItems] = useState<PurchaseItemInput[]>([
        { item_name: '', quantity: 1, price: 0 },
    ])

    const [filterBranch, setFilterBranch] = useState<string>('all')
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)

    function handleItemChange(index: number, field: keyof PurchaseItemInput, value: string | number) {
        setItems((prev) => {
            const copy = [...prev]
            copy[index] = { ...copy[index], [field]: value }
            return copy
        })
    }

    function addItem() {
        setItems((prev) => [...prev, { item_name: '', quantity: 1, price: 0 }])
    }

    function removeItem(index: number) {
        if (items.length <= 1) return
        setItems((prev) => prev.filter((_, i) => i !== index))
    }

    const currentTotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.price) || 0), 0)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setErrorMsg(null)
        setSuccessMsg(null)
        setSaving(true)

        const res = await addPurchase({
            branch_id: selectedBranch,
            supplier,
            purchase_date: purchaseDate,
            items,
        })

        setSaving(false)

        if (res.error) {
            setErrorMsg(res.error)
            return
        }

        setSuccessMsg('Catatan pembelian bahan baku berhasil disimpan!')
        setSupplier('')
        setItems([{ item_name: '', quantity: 1, price: 0 }])
    }

    async function handleDelete(id: string) {
        if (!confirm('Yakin ingin menghapus catatan pembelian bahan baku ini?')) return
        setDeletingId(id)
        setErrorMsg(null)
        const res = await deletePurchase(id)
        setDeletingId(null)
        if (res.error) {
            setErrorMsg(res.error)
        }
    }

    const filteredPurchases = initialPurchases.filter((p) => {
        if (filterBranch === 'all') return true
        return p.branch_id === filterBranch
    })

    const totalExpenditure = filteredPurchases.reduce((sum, p) => sum + Number(p.total), 0)

    return (
        <div className="mx-auto max-w-4xl px-4 py-8 sm:py-16">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Pengelolaan Bahan Baku</h1>
                <p className="mt-1 text-sm text-gray-600">
                    Catat pengeluaran dan pembelian bahan baku dari supplier untuk tiap cabang usaha.
                </p>
            </div>

            {/* Form Catat Pembelian */}
            <div className="mb-10 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900">Catat Belanja Bahan Baku</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                    Input rincian bahan baku atau pasokan yang baru dibeli.
                </p>

                {errorMsg && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                        {errorMsg}
                    </div>
                )}

                {successMsg && (
                    <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-xs font-medium text-green-700">
                        {successMsg}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">Cabang Alokasi</label>
                            <select
                                value={selectedBranch}
                                onChange={(e) => setSelectedBranch(e.target.value)}
                                required
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none"
                            >
                                {branches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">Tanggal Belanja</label>
                            <input
                                type="date"
                                value={purchaseDate}
                                onChange={(e) => setPurchaseDate(e.target.value)}
                                required
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none"
                            >
                            </input>
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                                Supplier / Toko <span className="text-gray-400 font-normal">(opsional)</span>
                            </label>
                            <input
                                type="text"
                                value={supplier}
                                onChange={(e) => setSupplier(e.target.value)}
                                placeholder="Contoh: Pasar Induk / PT Beras"
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Dynamic Items */}
                    <div className="mt-4">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Daftar Bahan Baku
                        </label>

                        <div className="space-y-2.5">
                            {items.map((item, idx) => {
                                const sub = (Number(item.quantity) || 0) * (Number(item.price) || 0)
                                return (
                                    <div
                                        key={idx}
                                        className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50/50 p-3 sm:flex-row sm:items-center"
                                    >
                                        <div className="flex-1">
                                            <input
                                                type="text"
                                                required
                                                placeholder="Nama bahan (cth: Daging Ayam Fillet)"
                                                value={item.item_name}
                                                onChange={(e) => handleItemChange(idx, 'item_name', e.target.value)}
                                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-24">
                                                <input
                                                    type="number"
                                                    required
                                                    min="0.1"
                                                    step="any"
                                                    placeholder="Qty"
                                                    value={item.quantity || ''}
                                                    onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                                                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-black focus:outline-none"
                                                />
                                            </div>
                                            <div className="w-32">
                                                <input
                                                    type="number"
                                                    required
                                                    min="0"
                                                    step="any"
                                                    placeholder="Harga / Unit (Rp)"
                                                    value={item.price || ''}
                                                    onChange={(e) => handleItemChange(idx, 'price', e.target.value)}
                                                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-black focus:outline-none"
                                                />
                                            </div>
                                            <div className="w-28 text-right text-xs font-semibold text-gray-700">
                                                Rp{sub.toLocaleString('id-ID')}
                                            </div>
                                            {items.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeItem(idx)}
                                                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                                                    title="Hapus baris"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={addItem}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-black hover:underline"
                            >
                                <span>+</span> Tambah Bahan Lain
                            </button>
                            <div className="text-sm font-bold text-gray-900">
                                Total: Rp{currentTotal.toLocaleString('id-ID')}
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full rounded-lg bg-black py-3 text-sm font-semibold text-white shadow hover:bg-gray-800 transition active:scale-[0.99] disabled:opacity-50"
                    >
                        {saving ? 'Menyimpan...' : 'Simpan Pembelian Bahan Baku'}
                    </button>
                </form>
            </div>

            {/* Riwayat Pembelian Bahan Baku */}
            <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">
                            Riwayat Belanja Bahan Baku ({filteredPurchases.length})
                        </h2>
                        <p className="text-xs text-gray-500">
                            Total Pengeluaran: <span className="font-bold text-gray-900">Rp{totalExpenditure.toLocaleString('id-ID')}</span>
                        </p>
                    </div>

                    {branches.length > 1 && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-500">Cabang:</span>
                            <select
                                value={filterBranch}
                                onChange={(e) => setFilterBranch(e.target.value)}
                                className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 focus:border-black focus:outline-none"
                            >
                                <option value="all">Semua Cabang</option>
                                {branches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    {filteredPurchases.map((p) => (
                        <div
                            key={p.id}
                            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                        >
                            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-gray-900">
                                            {new Date(p.purchase_date).toLocaleDateString('id-ID', {
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric',
                                            })}
                                        </span>
                                        <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
                                            {p.branches?.name ?? 'Cabang'}
                                        </span>
                                        {p.supplier && (
                                            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                                {p.supplier}
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-1 text-xs text-gray-400">
                                        Dicatat: {new Date(p.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-bold text-gray-900">
                                        Rp{Number(p.total).toLocaleString('id-ID')}
                                    </span>
                                    <button
                                        onClick={() => handleDelete(p.id)}
                                        disabled={deletingId === p.id}
                                        className="rounded-lg p-1 text-xs font-semibold text-gray-400 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50"
                                        title="Hapus riwayat belanja"
                                    >
                                        {deletingId === p.id ? '...' : 'Hapus'}
                                    </button>
                                </div>
                            </div>

                            <div className="mt-3">
                                <div className="space-y-1">
                                    {p.purchase_items?.map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-center justify-between text-xs text-gray-600"
                                        >
                                            <span>
                                                {item.item_name}{' '}
                                                <span className="text-gray-400">
                                                    ({Number(item.quantity)} x Rp{Number(item.price).toLocaleString('id-ID')})
                                                </span>
                                            </span>
                                            <span className="font-medium text-gray-800">
                                                Rp{Number(item.subtotal).toLocaleString('id-ID')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}

                    {filteredPurchases.length === 0 && (
                        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
                            Belum ada riwayat pembelian bahan baku. Catat belanja pertama melalui form di atas.
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
