'use client'

import { useState } from 'react'
import { addExpense } from './actions'
import { getIndonesianDate } from '@/lib/date-utils'

const CATEGORIES = [
    { value: 'gaji', label: 'Penggajian / Upah', icon: '👤' },
    { value: 'sewa', label: 'Sewa Tempat', icon: '🏠' },
    { value: 'listrik', label: 'Listrik', icon: '⚡' },
    { value: 'air', label: 'Air / PDAM', icon: '💧' },
    { value: 'gas', label: 'Gas', icon: '🔥' },
    { value: 'transportasi', label: 'Transportasi', icon: '🚗' },
    { value: 'marketing', label: 'Marketing / Iklan', icon: '📢' },
    { value: 'packaging', label: 'Packaging', icon: '📦' },
    { value: 'peralatan', label: 'Peralatan / Alat', icon: '🔧' },
    { value: 'lainnya', label: 'Lainnya', icon: '🗂️' },
] as const

type Category = typeof CATEGORIES[number]['value']

interface Branch {
    id: string
    name: string
}

interface ExpenseFormProps {
    branches: Branch[]
    initialBranchId?: string
}

export default function ExpenseForm({ branches, initialBranchId }: ExpenseFormProps) {
    const [open, setOpen] = useState(false)
    const [category, setCategory] = useState<Category>('lainnya')
    const [amount, setAmount] = useState('')
    const [description, setDescription] = useState('')
    const [date, setDate] = useState(() => getIndonesianDate())
    const [branchId, setBranchId] = useState(initialBranchId || '')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setMessage(null)

        const parsed = Number(amount.replace(/\./g, '').replace(/,/g, '.'))
        if (!parsed || parsed <= 0) {
            setMessage({ type: 'error', text: 'Nominal harus lebih dari 0.' })
            setLoading(false)
            return
        }

        const result = await addExpense({
            category,
            amount: parsed,
            description: description || undefined,
            expense_date: date,
            branch_id: branchId || undefined,
        })

        setLoading(false)

        if (result.error) {
            setMessage({ type: 'error', text: result.error })
        } else {
            setMessage({ type: 'success', text: 'Pengeluaran berhasil disimpan!' })
            setAmount('')
            setDescription('')
            setCategory('lainnya')
            setBranchId(initialBranchId || '')
            setDate(getIndonesianDate())
            setTimeout(() => {
                setMessage(null)
                setOpen(false)
            }, 1500)
        }
    }

    const selectedCat = CATEGORIES.find((c) => c.value === category)

    return (
        <div className="mb-6">
            {!open ? (
                <button
                    onClick={() => setOpen(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white py-3.5 text-sm font-semibold text-gray-600 transition hover:border-black hover:text-gray-900"
                >
                    <span className="text-lg">＋</span>
                    Catat Pengeluaran Baru
                </button>
            ) : (
                <form
                    onSubmit={handleSubmit}
                    className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4"
                >
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-gray-900">Catat Pengeluaran</h3>
                        <button
                            type="button"
                            onClick={() => { setOpen(false); setMessage(null) }}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Kategori */}
                    <div>
                        <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                            Kategori Pengeluaran
                        </label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {CATEGORIES.map((cat) => (
                                <button
                                    key={cat.value}
                                    type="button"
                                    onClick={() => setCategory(cat.value)}
                                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition ${
                                        category === cat.value
                                            ? 'border-black bg-black text-white shadow-sm'
                                            : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400 hover:bg-white'
                                    }`}
                                >
                                    <span className="text-base">{cat.icon}</span>
                                    <span className="leading-tight">{cat.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Nominal */}
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700">
                            Nominal (Rp)
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500">
                                Rp
                            </span>
                            <input
                                type="number"
                                min="1"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0"
                                required
                                className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-9 pr-4 text-sm font-bold text-gray-900 focus:border-black focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Keterangan */}
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700">
                            Keterangan{' '}
                            <span className="font-normal text-gray-400">
                                {category === 'gaji' ? '(nama pegawai / periode)' : '(opsional)'}
                            </span>
                        </label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={
                                category === 'gaji'
                                    ? 'Contoh: Budi – gaji September'
                                    : 'Keterangan singkat...'
                            }
                            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-black focus:outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {/* Tanggal */}
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-700">
                                Tanggal
                            </label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                required
                                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-black focus:outline-none"
                            />
                        </div>

                        {/* Cabang */}
                        {branches.length > 0 && (
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-gray-700">
                                    Cabang <span className="font-normal text-gray-400">(opsional)</span>
                                </label>
                                <select
                                    value={branchId}
                                    onChange={(e) => setBranchId(e.target.value)}
                                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-black focus:outline-none"
                                >
                                    <option value="">Semua Cabang</option>
                                    {branches.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            {b.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {message && (
                        <p className={`text-center text-sm font-semibold ${
                            message.type === 'error' ? 'text-red-600' : 'text-green-600'
                        }`}>
                            {message.type === 'success' ? '✓ ' : '✕ '}{message.text}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-black py-3 text-sm font-bold text-white shadow transition hover:bg-gray-800 disabled:opacity-50"
                    >
                        {loading ? 'Menyimpan...' : `Simpan — ${selectedCat?.icon} ${selectedCat?.label}`}
                    </button>
                </form>
            )}
        </div>
    )
}
