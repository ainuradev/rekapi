'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { addProduct } from './actions'
import { uploadImageWithCompression } from '@/lib/cloudinary-upload'

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
    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const [uploadingImage, setUploadingImage] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)

    async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setErrorMsg(null)
        setUploadingImage(true)
        try {
            const uploaded = await uploadImageWithCompression(file, 'product')
            setImageUrl(uploaded.url)
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses foto produk.')
        } finally {
            setUploadingImage(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

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
        if (imageUrl) formData.append('image_url', imageUrl)
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
        setImageUrl(null)
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
                    {errorMsg}
                </div>
            )}

            {successMsg && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                    {successMsg}
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
                        <option value="makanan">Makanan</option>
                        <option value="minuman">Minuman</option>
                        <option value="lainnya">Lainnya</option>
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

            {/* Foto Produk (Opsional) */}
            <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Foto Produk <span className="text-slate-400 font-normal">(opsional, kompresi otomatis WebP 400x400px)</span>
                </label>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/jpg"
                    onChange={handleFileSelect}
                    className="hidden"
                />
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                    <div className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
                        {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={imageUrl}
                                alt="Preview Foto Produk"
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingImage}
                                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition cursor-pointer disabled:opacity-50"
                            >
                                {uploadingImage ? 'Mengompresi...' : imageUrl ? 'Ganti Foto' : 'Pilih Foto'}
                            </button>
                            {imageUrl && (
                                <button
                                    type="button"
                                    onClick={() => setImageUrl(null)}
                                    className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                                >
                                    Hapus
                                </button>
                            )}
                        </div>
                        <p className="mt-1 text-[10px] text-slate-500 truncate">
                            {imageUrl ? 'Foto siap disimpan ke katalog & Kasir POS.' : 'Format JPG/PNG/WebP. Tampil di Katalog & Kasir POS.'}
                        </p>
                    </div>
                </div>
            </div>

            <button
                type="submit"
                disabled={saving || uploadingImage}
                className="w-full rounded-2xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
                {saving ? 'Menyimpan...' : '+ Tambah Produk ke Katalog'}
            </button>

            {!isOwner && (
                <p className="text-xs text-slate-500 text-center">
                    HPP produk ini akan diverifikasi dan diisi oleh Owner belakangan.
                </p>
            )}
        </form>
    )
}
