'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Customer, CustomerCategory } from '@/types/customer'
import {
    createCustomer,
    updateCustomer,
    toggleCustomerStatus,
    deleteCustomer,
} from './actions'

interface PelangganClientProps {
    initialCustomers: Customer[]
    isOwner?: boolean
}

const CATEGORY_CONFIG: Record<CustomerCategory, { label: string; badge: string }> = {
    regular: { label: 'Reguler', badge: 'bg-slate-100 text-slate-700 border-slate-200' },
    member: { label: 'Member', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
    vip: { label: 'VIP', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
    wholesale: { label: 'Grosir / Reseller', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
}

export default function PelangganClient({
    initialCustomers,
    isOwner = true,
}: PelangganClientProps) {
    const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
    const [search, setSearch] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string>('all')

    // Modal states
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [actionError, setActionError] = useState<string | null>(null)
    const [actionSuccess, setActionSuccess] = useState<string | null>(null)

    // Form fields
    const [formCode, setFormCode] = useState('')
    const [formName, setFormName] = useState('')
    const [formPhone, setFormPhone] = useState('')
    const [formEmail, setFormEmail] = useState('')
    const [formAddress, setFormAddress] = useState('')
    const [formCategory, setFormCategory] = useState<CustomerCategory>('regular')
    const [formDiscount, setFormDiscount] = useState('0')
    const [formReceivableLimit, setFormReceivableLimit] = useState('0')
    const [formNotes, setFormNotes] = useState('')

    const filtered = customers.filter((c) => {
        const q = search.toLowerCase()
        const matchesSearch =
            c.name.toLowerCase().includes(q) ||
            (c.phone && c.phone.toLowerCase().includes(q)) ||
            (c.code && c.code.toLowerCase().includes(q)) ||
            (c.address && c.address.toLowerCase().includes(q))

        const matchesCat = selectedCategory === 'all' || c.category === selectedCategory
        return matchesSearch && matchesCat
    })

    const resetForm = () => {
        setFormCode('')
        setFormName('')
        setFormPhone('')
        setFormEmail('')
        setFormAddress('')
        setFormCategory('regular')
        setFormDiscount('0')
        setFormReceivableLimit('0')
        setFormNotes('')
        setActionError(null)
    }

    const openAddModal = () => {
        resetForm()
        setIsAddModalOpen(true)
    }

    const openEditModal = (c: Customer) => {
        resetForm()
        setEditingCustomer(c)
        setFormCode(c.code || '')
        setFormName(c.name)
        setFormPhone(c.phone || '')
        setFormEmail(c.email || '')
        setFormAddress(c.address || '')
        setFormCategory(c.category || 'regular')
        setFormDiscount(String(c.default_discount_pct || 0))
        setFormReceivableLimit(String(c.receivable_limit || 0))
        setFormNotes(c.notes || '')
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formName.trim()) {
            setActionError('Nama pelanggan wajib diisi.')
            return
        }

        setIsSubmitting(true)
        setActionError(null)

        const res = await createCustomer({
            code: formCode.trim() || undefined,
            name: formName.trim(),
            phone: formPhone.trim() || undefined,
            email: formEmail.trim() || undefined,
            address: formAddress.trim() || undefined,
            category: formCategory,
            default_discount_pct: Number(formDiscount) || 0,
            receivable_limit: Number(formReceivableLimit) || 0,
            notes: formNotes.trim() || undefined,
        })

        setIsSubmitting(false)

        if (res.error) {
            setActionError(res.error)
        } else if (res.data) {
            setCustomers([res.data as Customer, ...customers])
            setIsAddModalOpen(false)
            setActionSuccess(`Pelanggan "${formName}" berhasil ditambahkan!`)
            setTimeout(() => setActionSuccess(null), 3500)
            resetForm()
        }
    }

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingCustomer) return
        if (!formName.trim()) {
            setActionError('Nama pelanggan wajib diisi.')
            return
        }

        setIsSubmitting(true)
        setActionError(null)

        const res = await updateCustomer(editingCustomer.id, {
            code: formCode.trim() || undefined,
            name: formName.trim(),
            phone: formPhone.trim() || undefined,
            email: formEmail.trim() || undefined,
            address: formAddress.trim() || undefined,
            category: formCategory,
            default_discount_pct: Number(formDiscount) || 0,
            receivable_limit: Number(formReceivableLimit) || 0,
            notes: formNotes.trim() || undefined,
            status: editingCustomer.status,
        })

        setIsSubmitting(false)

        if (res.error) {
            setActionError(res.error)
        } else if (res.data) {
            setCustomers(customers.map((c) => (c.id === editingCustomer.id ? { ...c, ...(res.data as Customer) } : c)))
            setEditingCustomer(null)
            setActionSuccess(`Data pelanggan "${formName}" berhasil diperbarui!`)
            setTimeout(() => setActionSuccess(null), 3500)
            resetForm()
        }
    }

    const handleToggleStatus = async (c: Customer) => {
        const nextStatus = c.status === 'active' ? 'inactive' : 'active'
        const res = await toggleCustomerStatus(c.id, nextStatus)
        if (res.error) {
            alert(`Gagal mengubah status: ${res.error}`)
        } else {
            setCustomers(customers.map((item) => (item.id === c.id ? { ...item, status: nextStatus } : item)))
        }
    }

    const handleDelete = async (c: Customer) => {
        if (!confirm(`Hapus pelanggan "${c.name}"? Riwayat transaksi lama tetap aman.`)) return

        const res = await deleteCustomer(c.id)
        if (res.error) {
            alert(`Gagal menghapus pelanggan: ${res.error}`)
        } else {
            setCustomers(customers.filter((item) => item.id !== c.id))
            setActionSuccess(`Pelanggan "${c.name}" berhasil dihapus.`)
            setTimeout(() => setActionSuccess(null), 3500)
        }
    }

    const totalCustomers = customers.length
    const activeCustomers = customers.filter((c) => c.status === 'active').length
    const totalSpent = customers.reduce((acc, c) => acc + (Number(c.total_spent) || 0), 0)
    const totalOrders = customers.reduce((acc, c) => acc + (Number(c.total_orders) || 0), 0)

    return (
        <div className="space-y-6">
            {/* Header & Breadcrumb */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5">
                        <Link href="/dashboard" className="hover:text-emerald-600 transition flex items-center gap-1 font-medium">
                            <span>Dashboard</span>
                        </Link>
                        <span>/</span>
                        <span className="font-semibold text-slate-700">Pelanggan & CRM</span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                        Data Pelanggan &amp; CRM
                    </h1>
                    <p className="mt-1 text-xs text-slate-500">
                        Kelola direktori pelanggan, kontak WhatsApp, kategori loyalitas, dan pantau riwayat belanja.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={openAddModal}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white shadow-xs shadow-emerald-600/20 hover:bg-emerald-700 transition active:scale-[0.99] cursor-pointer"
                    >
                        <span>+</span>
                        <span>Tambah Pelanggan</span>
                    </button>
                </div>
            </div>

            {/* Notification alert */}
            {actionSuccess && (
                <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/90 text-emerald-800 text-xs font-semibold flex items-center gap-2.5 shadow-2xs">
                    <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{actionSuccess}</span>
                </div>
            )}

            {/* KPI Cockpit Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Total Pelanggan
                    </div>
                    <div className="mt-1.5 text-2xl font-black text-slate-900">
                        {totalCustomers.toLocaleString('id-ID')}
                    </div>
                    <div className="mt-1 text-[11px] font-medium text-slate-500">
                        Terdaftar di sistem
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Pelanggan Aktif
                    </div>
                    <div className="mt-1.5 text-2xl font-black text-emerald-600">
                        {activeCustomers.toLocaleString('id-ID')}
                    </div>
                    <div className="mt-1 text-[11px] font-medium text-emerald-700">
                        {totalCustomers > 0 ? Math.round((activeCustomers / totalCustomers) * 100) : 0}% rasio aktif
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Total Belanja CRM
                    </div>
                    <div className="mt-1.5 text-xl sm:text-2xl font-black text-slate-900 truncate">
                        Rp{Math.round(totalSpent).toLocaleString('id-ID')}
                    </div>
                    <div className="mt-1 text-[11px] font-medium text-slate-500">
                        Akumulasi penjualan
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Total Pesanan
                    </div>
                    <div className="mt-1.5 text-2xl font-black text-slate-900">
                        {totalOrders.toLocaleString('id-ID')}
                    </div>
                    <div className="mt-1 text-[11px] font-medium text-slate-500">
                        Frekuensi transaksi
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200/80 p-3 shadow-2xs">
                <div className="relative flex-1 max-w-md">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </span>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari nama, kode, nomor HP, atau alamat..."
                        className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50/70 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                    />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                    {['all', 'regular', 'member', 'vip', 'wholesale'].map((cat) => (
                        <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                                selectedCategory === cat
                                    ? 'bg-emerald-600 text-white shadow-xs shadow-emerald-600/20'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            {cat === 'all' ? 'Semua Kategori' : CATEGORY_CONFIG[cat as CustomerCategory]?.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table / List */}
            {filtered.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-slate-200 shadow-2xs">
                    <div className="w-14 h-14 mx-auto mb-3.5 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-800 border border-emerald-100">
                        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">Belum Ada Pelanggan</h3>
                    <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                        {search || selectedCategory !== 'all'
                            ? 'Tidak ada pelanggan yang cocok dengan filter pencarian.'
                            : 'Mulai bangun database CRM toko Anda untuk meningkatkan transaksi berulang dan loyalitas pembeli.'}
                    </p>
                    <button
                        type="button"
                        onClick={openAddModal}
                        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white shadow-xs shadow-emerald-600/20 hover:bg-emerald-700 transition cursor-pointer"
                    >
                        <span>+ Tambah Pelanggan Pertama</span>
                    </button>
                </div>
            ) : (
                <div className="overflow-hidden bg-white rounded-3xl border border-slate-200/80 shadow-xs">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                                <tr>
                                    <th className="py-3 px-4">Pelanggan</th>
                                    <th className="py-3 px-4">Kategori &amp; Diskon</th>
                                    <th className="py-3 px-4">Kontak &amp; Alamat</th>
                                    <th className="py-3 px-4 text-center">Total Belanja</th>
                                    <th className="py-3 px-4 text-center">Status</th>
                                    <th className="py-3 px-4 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                                {filtered.map((c) => {
                                    const catInfo = CATEGORY_CONFIG[c.category] || CATEGORY_CONFIG.regular
                                    const rawPhone = c.phone?.replace(/[^0-9]/g, '') || ''
                                    const waNumber = rawPhone.startsWith('0') ? '62' + rawPhone.slice(1) : rawPhone
                                    const initials = (c.name || 'P')
                                        .split(' ')
                                        .map((w) => w[0])
                                        .slice(0, 2)
                                        .join('')
                                        .toUpperCase()

                                    return (
                                        <tr key={c.id} className="hover:bg-slate-50/70 transition">
                                            <td className="py-3.5 px-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-black text-white shadow-2xs">
                                                        {initials}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-900">{c.name}</div>
                                                        {c.code && (
                                                            <span className="inline-block mt-0.5 text-[10px] font-mono font-medium text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded-md">
                                                                {c.code}
                                                            </span>
                                                        )}
                                                        {c.notes && (
                                                            <div className="mt-0.5 text-[11px] text-slate-400 italic line-clamp-1">
                                                                {c.notes}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border ${catInfo.badge}`}>
                                                    {catInfo.label}
                                                </span>
                                                {c.default_discount_pct > 0 && (
                                                    <div className="mt-1 text-[11px] font-bold text-emerald-600">
                                                        Diskon {c.default_discount_pct}%
                                                    </div>
                                                )}
                                                {c.receivable_limit > 0 ? (
                                                    <div className="mt-1 text-[10px] font-semibold text-slate-600">
                                                        Limit: Rp{c.receivable_limit.toLocaleString('id-ID')}
                                                    </div>
                                                ) : (
                                                    <div className="mt-1 text-[10px] text-slate-400">
                                                        Tanpa Limit Piutang
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                {c.phone ? (
                                                    <a
                                                        href={`https://wa.me/${waNumber}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1.5"
                                                    >
                                                        <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                        </svg>
                                                        <span>{c.phone}</span>
                                                    </a>
                                                ) : (
                                                    <span className="text-slate-300">-</span>
                                                )}
                                                {c.address && (
                                                    <div className="mt-0.5 text-[11px] text-slate-500 line-clamp-1 flex items-center gap-1">
                                                        <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        </svg>
                                                        <span className="truncate">{c.address}</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <div className="font-bold text-slate-900">
                                                    Rp{Math.round(c.total_spent || 0).toLocaleString('id-ID')}
                                                </div>
                                                <div className="text-[10px] text-slate-400">
                                                    {c.total_orders || 0} transaksi
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleStatus(c)}
                                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition cursor-pointer ${
                                                        c.status === 'active'
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 hover:bg-emerald-100'
                                                            : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                                                    }`}
                                                >
                                                    {c.status === 'active' ? 'Aktif' : 'Nonaktif'}
                                                </button>
                                            </td>
                                            <td className="py-3.5 px-4 text-right">
                                                <div className="inline-flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditModal(c)}
                                                        className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                                    >
                                                        Edit
                                                    </button>
                                                    {isOwner && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(c)}
                                                            className="px-2.5 py-1 text-[11px] font-semibold text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                                        >
                                                            Hapus
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal Tambah / Edit Pelanggan */}
            {(isAddModalOpen || editingCustomer) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px]">
                    <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-bold text-slate-900">
                                    {editingCustomer ? 'Edit Data Pelanggan' : 'Tambah Pelanggan Baru'}
                                </h2>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    {editingCustomer ? 'Perbarui informasi kontak dan loyalitas pelanggan' : 'Daftarkan pelanggan baru ke direktori CRM toko'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsAddModalOpen(false)
                                    setEditingCustomer(null)
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                                aria-label="Tutup"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={editingCustomer ? handleUpdate : handleCreate} className="flex-1 flex flex-col min-h-0">
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {actionError && (
                                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-2">
                                        <svg className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span>{actionError}</span>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Kode (Opsional)
                                        </label>
                                        <input
                                            type="text"
                                            value={formCode}
                                            onChange={(e) => setFormCode(e.target.value)}
                                            placeholder="CUST-01"
                                            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-700 font-mono transition"
                                        />
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Nama Pelanggan <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={formName}
                                            onChange={(e) => setFormName(e.target.value)}
                                            placeholder="Contoh: Budi Santoso"
                                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 transition"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Nomor WhatsApp / HP
                                        </label>
                                        <input
                                            type="tel"
                                            value={formPhone}
                                            onChange={(e) => setFormPhone(e.target.value)}
                                            placeholder="081234567890"
                                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 font-mono transition"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Email (Opsional)
                                        </label>
                                        <input
                                            type="email"
                                            value={formEmail}
                                            onChange={(e) => setFormEmail(e.target.value)}
                                            placeholder="pelanggan@email.com"
                                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 transition"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Kategori Pelanggan
                                        </label>
                                        <select
                                            value={formCategory}
                                            onChange={(e) => setFormCategory(e.target.value as CustomerCategory)}
                                            className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 transition cursor-pointer"
                                        >
                                            <option value="regular">Reguler</option>
                                            <option value="member">Member</option>
                                            <option value="vip">VIP</option>
                                            <option value="wholesale">Grosir / Reseller</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Diskon Default (%)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="0.5"
                                            value={formDiscount}
                                            onChange={(e) => setFormDiscount(e.target.value)}
                                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 font-mono transition"
                                        />
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-xs font-semibold text-slate-700">
                                                Limit Piutang (Rp)
                                            </label>
                                            {!isOwner && (
                                                <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                                                    Owner Only
                                                </span>
                                            )}
                                        </div>
                                        <input
                                            type="number"
                                            min="0"
                                            step="10000"
                                            disabled={!isOwner}
                                            readOnly={!isOwner}
                                            value={formReceivableLimit}
                                            onChange={(e) => setFormReceivableLimit(e.target.value)}
                                            className={`w-full px-2.5 py-1.5 text-xs rounded-lg font-mono transition ${
                                                !isOwner
                                                    ? 'bg-slate-100 text-slate-500 border border-slate-200 cursor-not-allowed'
                                                    : 'bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-700'
                                            }`}
                                        />
                                        {!isOwner && (
                                            <p className="text-[10px] text-slate-400 mt-1">
                                                Batas kredit hanya dapat diubah oleh Owner.
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Alamat Pengiriman
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={formAddress}
                                        onChange={(e) => setFormAddress(e.target.value)}
                                        placeholder="Jalan, nomor rumah, RT/RW, kelurahan..."
                                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 transition"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Catatan Khusus (Preferensi / Kebiasaan)
                                    </label>
                                    <input
                                        type="text"
                                        value={formNotes}
                                        onChange={(e) => setFormNotes(e.target.value)}
                                        placeholder="Misal: Suka kopi less sweet, langganan catering Jumat"
                                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 transition"
                                    />
                                </div>
                            </div>

                            <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAddModalOpen(false)
                                        setEditingCustomer(null)
                                    }}
                                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 bg-white transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-4 py-1.5 text-xs font-bold bg-emerald-800 text-white rounded-lg shadow-2xs hover:bg-emerald-900 active:bg-emerald-950 transition disabled:opacity-50 cursor-pointer"
                                >
                                    {isSubmitting ? 'Menyimpan...' : editingCustomer ? 'Simpan Perubahan' : 'Tambah Pelanggan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
