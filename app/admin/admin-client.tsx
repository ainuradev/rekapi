'use client'

import { useState } from 'react'
import {
    adminExtendTrial,
    adminUpdateSubscriptionStatus,
    adminUpdateBusinessName,
    adminResetUserPassword,
} from './actions'

export interface AdminUserItem {
    id: string
    email: string
    fullName: string
    role: 'owner' | 'pegawai'
    provider: 'google' | 'email'
    createdAt: string
    lastSignInAt: string | null
    businessId: string | null
    businessName: string
    branchId: string | null
    branchName: string | null
    subscriptionStatus: string
    trialEndsAt: string | null
    daysRemaining: number
    isExpired: boolean
    branchCount: number
    salesCount: number
    salesVolume: number
}

export interface AdminBusinessItem {
    id: string
    name: string
    subscriptionStatus: string
    trialEndsAt: string | null
    createdAt: string
    branchCount: number
    employeeCount: number
    salesCount: number
    salesVolume: number
    daysRemaining: number
    isExpired: boolean
}

export interface AdminSaleItem {
    id: string
    businessName: string
    branchName: string
    total: number
    channel: string
    paymentMethod: string
    createdAt: string
}

export interface PlatformMetrics {
    totalUsers: number
    totalOwners: number
    totalEmployees: number
    totalBusinesses: number
    trialActiveCount: number
    trialExpiredCount: number
    subscribedCount: number
    totalBranches: number
    totalSalesCount: number
    totalPlatformRevenue: number
}

interface Props {
    users: AdminUserItem[]
    businesses: AdminBusinessItem[]
    recentSales: AdminSaleItem[]
    metrics: PlatformMetrics
}

export default function AdminClient({
    users,
    businesses,
    recentSales,
    metrics,
}: Props) {
    const [tab, setTab] = useState<'users' | 'businesses' | 'sales'>('users')
    const [search, setSearch] = useState('')
    const [roleFilter, setRoleFilter] = useState<'all' | 'owner' | 'pegawai'>('all')
    const [statusFilter, setStatusFilter] = useState<'all' | 'trial_active' | 'trial_expired' | 'active'>('all')

    // State Modal Aksi
    const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null)
    const [selectedBusiness, setSelectedBusiness] = useState<AdminBusinessItem | null>(null)
    const [actionType, setActionType] = useState<
        'extend_trial' | 'change_status' | 'rename_business' | 'reset_password' | null
    >(null)

    const [loading, setLoading] = useState(false)
    const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

    // Form states
    const [extendDays, setExtendDays] = useState(7)
    const [newStatus, setNewStatus] = useState<'trial' | 'active' | 'expired'>('trial')
    const [newBizName, setNewBizName] = useState('')
    const [newPassword, setNewPassword] = useState('')

    // Filter pengguna
    const filteredUsers = users.filter((u) => {
        const matchSearch =
            u.fullName.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase()) ||
            u.businessName.toLowerCase().includes(search.toLowerCase())

        const matchRole = roleFilter === 'all' || u.role === roleFilter

        let matchStatus = true
        if (statusFilter === 'trial_active') {
            matchStatus = u.subscriptionStatus === 'trial' && !u.isExpired
        } else if (statusFilter === 'trial_expired') {
            matchStatus = u.isExpired
        } else if (statusFilter === 'active') {
            matchStatus = u.subscriptionStatus === 'active'
        }

        return matchSearch && matchRole && matchStatus
    })

    // Filter bisnis
    const filteredBusinesses = businesses.filter((b) => {
        const matchSearch = b.name.toLowerCase().includes(search.toLowerCase())
        let matchStatus = true
        if (statusFilter === 'trial_active') {
            matchStatus = b.subscriptionStatus === 'trial' && !b.isExpired
        } else if (statusFilter === 'trial_expired') {
            matchStatus = b.isExpired
        } else if (statusFilter === 'active') {
            matchStatus = b.subscriptionStatus === 'active'
        }
        return matchSearch && matchStatus
    })

    // Handler submit modal aksi
    async function handleActionSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setFeedback(null)

        try {
            if (actionType === 'extend_trial' && (selectedBusiness || selectedUser?.businessId)) {
                const bId = selectedBusiness?.id || selectedUser!.businessId!
                const res = await adminExtendTrial(bId, extendDays)
                if (res.error) setFeedback({ type: 'err', text: res.error })
                else {
                    setFeedback({ type: 'ok', text: `Masa trial berhasil ditambah +${extendDays} hari!` })
                    setTimeout(() => closeActionModal(), 1200)
                }
            } else if (actionType === 'change_status' && (selectedBusiness || selectedUser?.businessId)) {
                const bId = selectedBusiness?.id || selectedUser!.businessId!
                const res = await adminUpdateSubscriptionStatus(bId, newStatus)
                if (res.error) setFeedback({ type: 'err', text: res.error })
                else {
                    setFeedback({ type: 'ok', text: `Status berhasil diubah ke ${newStatus}!` })
                    setTimeout(() => closeActionModal(), 1200)
                }
            } else if (actionType === 'rename_business' && (selectedBusiness || selectedUser?.businessId)) {
                const bId = selectedBusiness?.id || selectedUser!.businessId!
                const res = await adminUpdateBusinessName(bId, newBizName)
                if (res.error) setFeedback({ type: 'err', text: res.error })
                else {
                    setFeedback({ type: 'ok', text: 'Nama bisnis berhasil diperbarui!' })
                    setTimeout(() => closeActionModal(), 1200)
                }
            } else if (actionType === 'reset_password' && selectedUser) {
                const res = await adminResetUserPassword(selectedUser.id, newPassword)
                if (res.error) setFeedback({ type: 'err', text: res.error })
                else {
                    setFeedback({ type: 'ok', text: `Kata sandi ${selectedUser.fullName} berhasil diganti!` })
                    setTimeout(() => closeActionModal(), 1200)
                }
            }
        } catch (err: any) {
            setFeedback({ type: 'err', text: err.message || 'Terjadi kesalahan sistem.' })
        } finally {
            setLoading(false)
        }
    }

    function openActionModal(
        type: 'extend_trial' | 'change_status' | 'rename_business' | 'reset_password',
        user?: AdminUserItem,
        biz?: AdminBusinessItem
    ) {
        setActionType(type)
        setSelectedUser(user || null)
        setSelectedBusiness(biz || null)
        setFeedback(null)
        if (biz) {
            setNewBizName(biz.name)
            setNewStatus(biz.subscriptionStatus as any)
        } else if (user) {
            setNewBizName(user.businessName)
            setNewStatus(user.subscriptionStatus as any)
        }
        setExtendDays(7)
        setNewPassword('')
    }

    function closeActionModal() {
        setActionType(null)
        setSelectedUser(null)
        setSelectedBusiness(null)
        setFeedback(null)
    }

    return (
        <div className="space-y-8">
            {/* ── Heading ── */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                        👑 Portal Super Admin
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Pemantauan menyeluruh pengguna, bisnis UMKM, masa trial, dan aktivitas penjualan platform Rekapin.
                    </p>
                </div>
            </div>

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Total Users */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Akun</span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-base text-blue-600">
                            👥
                        </span>
                    </div>
                    <div className="mt-3 text-3xl font-black text-slate-900">{metrics.totalUsers}</div>
                    <div className="mt-1 text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">{metrics.totalOwners}</span> Owner ·{' '}
                        <span className="font-semibold text-slate-700">{metrics.totalEmployees}</span> Pegawai
                    </div>
                </div>

                {/* Total Businesses */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Bisnis / UMKM</span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-base text-indigo-600">
                            🏢
                        </span>
                    </div>
                    <div className="mt-3 text-3xl font-black text-slate-900">{metrics.totalBusinesses}</div>
                    <div className="mt-1 text-xs text-slate-500">
                        Total <span className="font-semibold text-slate-700">{metrics.totalBranches}</span> cabang terdaftar
                    </div>
                </div>

                {/* Status Trial */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Masa Trial</span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-base text-amber-600">
                            ⏱️
                        </span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-emerald-600">{metrics.trialActiveCount}</span>
                        <span className="text-xs font-semibold text-slate-400">Aktif</span>
                        {metrics.trialExpiredCount > 0 && (
                            <span className="text-xs font-bold text-red-600">({metrics.trialExpiredCount} Expired)</span>
                        )}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                        {metrics.subscribedCount} bisnis paket berbayar (Active)
                    </div>
                </div>

                {/* Platform GMV */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Omzet Platform</span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-base text-emerald-600">
                            💰
                        </span>
                    </div>
                    <div className="mt-3 text-2xl font-black text-slate-900">
                        Rp {metrics.totalPlatformRevenue.toLocaleString('id-ID')}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                        Dari total <span className="font-semibold text-slate-700">{metrics.totalSalesCount}</span> transaksi kasir
                    </div>
                </div>
            </div>

            {/* ── Tab Switcher ── */}
            <div className="flex items-center gap-2 border-b border-slate-200">
                <button
                    onClick={() => setTab('users')}
                    className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition cursor-pointer ${
                        tab === 'users'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-900'
                    }`}
                >
                    <span>👥</span>
                    <span>Daftar Pengguna & Tenant ({users.length})</span>
                </button>
                <button
                    onClick={() => setTab('businesses')}
                    className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition cursor-pointer ${
                        tab === 'businesses'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-900'
                    }`}
                >
                    <span>🏢</span>
                    <span>Bisnis & Cabang ({businesses.length})</span>
                </button>
                <button
                    onClick={() => setTab('sales')}
                    className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition cursor-pointer ${
                        tab === 'sales'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-900'
                    }`}
                >
                    <span>🧾</span>
                    <span>Aktivitas Transaksi Live ({recentSales.length})</span>
                </button>
            </div>

            {/* ── Filters & Search ── */}
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">🔍</span>
                    <input
                        type="text"
                        placeholder="Cari nama pengguna, email, atau nama bisnis..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {tab === 'users' && (
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value as any)}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-none"
                        >
                            <option value="all">Semua Peran (Role)</option>
                            <option value="owner">Owner Saja</option>
                            <option value="pegawai">Pegawai Saja</option>
                        </select>
                    )}

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-none"
                    >
                        <option value="all">Semua Status Trial</option>
                        <option value="trial_active">Trial Aktif</option>
                        <option value="trial_expired">Trial Expired</option>
                        <option value="active">Berlangganan (Active)</option>
                    </select>

                    {(search || roleFilter !== 'all' || statusFilter !== 'all') && (
                        <button
                            onClick={() => {
                                setSearch('')
                                setRoleFilter('all')
                                setStatusFilter('all')
                            }}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 transition cursor-pointer"
                        >
                            Reset Filter
                        </button>
                    )}
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                TAB 1: DAFTAR PENGGUNA & TENANT
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'users' && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-5 py-3.5">Pengguna & Email</th>
                                    <th className="px-4 py-3.5">Peran</th>
                                    <th className="px-4 py-3.5">Bisnis & Cabang</th>
                                    <th className="px-4 py-3.5">Status Langganan</th>
                                    <th className="px-4 py-3.5">Sisa Trial</th>
                                    <th className="px-4 py-3.5">Transaksi Kasir</th>
                                    <th className="px-4 py-3.5">Tgl Terdaftar</th>
                                    <th className="px-5 py-3.5 text-right">Aksi Admin</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-sm text-slate-400">
                                            Tidak ada data pengguna yang cocok dengan pencarian / filter.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map((u) => (
                                        <tr key={u.id} className="hover:bg-slate-50/60 transition">
                                            {/* User & Email */}
                                            <td className="px-5 py-4">
                                                <div className="font-bold text-slate-900 text-sm">{u.fullName}</div>
                                                <div className="flex items-center gap-1.5 mt-0.5 text-slate-500">
                                                    <span>{u.email}</span>
                                                    <span
                                                        className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                                                            u.provider === 'google'
                                                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                                : 'bg-slate-100 text-slate-600'
                                                        }`}
                                                    >
                                                        {u.provider}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Role */}
                                            <td className="px-4 py-4">
                                                <span
                                                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                                                        u.role === 'owner'
                                                            ? 'bg-blue-100 text-blue-800'
                                                            : 'bg-emerald-100 text-emerald-800'
                                                    }`}
                                                >
                                                    {u.role}
                                                </span>
                                            </td>

                                            {/* Bisnis & Cabang */}
                                            <td className="px-4 py-4">
                                                <div className="font-semibold text-slate-800">{u.businessName}</div>
                                                <div className="text-[11px] text-slate-400">
                                                    {u.role === 'owner'
                                                        ? `${u.branchCount} Cabang`
                                                        : u.branchName || 'Cabang Belum Ditentukan'}
                                                </div>
                                            </td>

                                            {/* Status Langganan */}
                                            <td className="px-4 py-4">
                                                <span
                                                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                                        u.subscriptionStatus === 'active'
                                                            ? 'bg-emerald-100 text-emerald-800'
                                                            : u.isExpired
                                                                ? 'bg-red-100 text-red-800'
                                                                : 'bg-blue-100 text-blue-800'
                                                    }`}
                                                >
                                                    {u.subscriptionStatus === 'active'
                                                        ? 'Pro Aktif'
                                                        : u.isExpired
                                                            ? 'Trial Expired'
                                                            : 'Free Trial'}
                                                </span>
                                            </td>

                                            {/* Sisa Trial */}
                                            <td className="px-4 py-4">
                                                {u.subscriptionStatus === 'active' ? (
                                                    <span className="text-emerald-700 font-semibold">Unlimited</span>
                                                ) : u.isExpired ? (
                                                    <span className="text-red-600 font-bold">Habis</span>
                                                ) : (
                                                    <span className="font-bold text-blue-700">
                                                        {u.daysRemaining} hari lagi
                                                    </span>
                                                )}
                                                {u.trialEndsAt && (
                                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                                        s/d {new Date(u.trialEndsAt).toLocaleDateString('id-ID')}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Transaksi */}
                                            <td className="px-4 py-4">
                                                <div className="font-semibold text-slate-800">
                                                    {u.salesCount} trx
                                                </div>
                                                <div className="text-[11px] text-slate-500">
                                                    Rp {u.salesVolume.toLocaleString('id-ID')}
                                                </div>
                                            </td>

                                            {/* Created At */}
                                            <td className="px-4 py-4 text-slate-500">
                                                <div>{new Date(u.createdAt).toLocaleDateString('id-ID')}</div>
                                                <div className="text-[10px] text-slate-400">
                                                    {new Date(u.createdAt).toLocaleTimeString('id-ID', {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </div>
                                            </td>

                                            {/* Aksi Super Admin */}
                                            <td className="px-5 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {u.role === 'owner' && u.businessId && (
                                                        <button
                                                            onClick={() => openActionModal('extend_trial', u)}
                                                            className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100 transition cursor-pointer"
                                                            title="Tambah masa trial akun ini"
                                                        >
                                                            + Trial
                                                        </button>
                                                    )}

                                                    {u.role === 'owner' && u.businessId && (
                                                        <button
                                                            onClick={() => openActionModal('change_status', u)}
                                                            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                                                            title="Ubah status langganan"
                                                        >
                                                            Status
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => openActionModal('reset_password', u)}
                                                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                                                        title="Setel ulang kata sandi pengguna ini"
                                                    >
                                                        🔑
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 2: BISNIS & CABANG
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'businesses' && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredBusinesses.map((b) => (
                        <div
                            key={b.id}
                            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
                        >
                            <div>
                                <div className="flex items-start justify-between">
                                    <h3 className="text-base font-bold text-slate-900">{b.name}</h3>
                                    <span
                                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                            b.subscriptionStatus === 'active'
                                                ? 'bg-emerald-100 text-emerald-800'
                                                : b.isExpired
                                                    ? 'bg-red-100 text-red-800'
                                                    : 'bg-blue-100 text-blue-800'
                                        }`}
                                    >
                                        {b.subscriptionStatus === 'active'
                                            ? 'Active'
                                            : b.isExpired
                                                ? 'Expired'
                                                : `Trial (${b.daysRemaining}h)`}
                                    </span>
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase">Cabang</span>
                                        <p className="mt-0.5 text-base font-bold text-slate-800">{b.branchCount}</p>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase">Pegawai</span>
                                        <p className="mt-0.5 text-base font-bold text-slate-800">{b.employeeCount}</p>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase">Transaksi</span>
                                        <p className="mt-0.5 text-base font-bold text-slate-800">{b.salesCount}</p>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase">Omzet</span>
                                        <p className="mt-0.5 text-xs font-bold text-slate-800 truncate">
                                            Rp {b.salesVolume.toLocaleString('id-ID')}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-4 text-xs text-slate-500">
                                    <div>
                                        Terdaftar:{' '}
                                        <span className="font-semibold text-slate-700">
                                            {new Date(b.createdAt).toLocaleDateString('id-ID')}
                                        </span>
                                    </div>
                                    {b.trialEndsAt && (
                                        <div className="mt-0.5">
                                            Trial Berakhir:{' '}
                                            <span className="font-semibold text-slate-700">
                                                {new Date(b.trialEndsAt).toLocaleDateString('id-ID')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-5 border-t border-slate-100 pt-4 flex items-center justify-between gap-2">
                                <button
                                    onClick={() => openActionModal('rename_business', undefined, b)}
                                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-center text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                                >
                                    ✏️ Edit Nama
                                </button>
                                <button
                                    onClick={() => openActionModal('extend_trial', undefined, b)}
                                    className="flex-1 rounded-lg border border-blue-200 bg-blue-50 py-1.5 text-center text-xs font-bold text-blue-700 hover:bg-blue-100 transition cursor-pointer"
                                >
                                    + Trial
                                </button>
                                <button
                                    onClick={() => openActionModal('change_status', undefined, b)}
                                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-center text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                                >
                                    Status
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 3: AKTIVITAS TRANSAKSI GLOBAL LIVE
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'sales' && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-bold text-slate-900">30 Transaksi Terakhir di Platform</h3>
                            <p className="text-xs text-slate-500">Live feed transaksi kasir dari semua cabang dan tenant.</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-5 py-3.5">Waktu Transaksi</th>
                                    <th className="px-4 py-3.5">Nama Bisnis</th>
                                    <th className="px-4 py-3.5">Cabang</th>
                                    <th className="px-4 py-3.5">Channel</th>
                                    <th className="px-4 py-3.5">Metode Bayar</th>
                                    <th className="px-5 py-3.5 text-right">Nominal</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {recentSales.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                                            Belum ada transaksi tercatat di platform.
                                        </td>
                                    </tr>
                                ) : (
                                    recentSales.map((s) => (
                                        <tr key={s.id} className="hover:bg-slate-50/60 transition">
                                            <td className="px-5 py-3.5 text-slate-500">
                                                <div>{new Date(s.createdAt).toLocaleDateString('id-ID')}</div>
                                                <div className="text-[10px] text-slate-400">
                                                    {new Date(s.createdAt).toLocaleTimeString('id-ID', {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5 font-bold text-slate-800">{s.businessName}</td>
                                            <td className="px-4 py-3.5 text-slate-600">{s.branchName}</td>
                                            <td className="px-4 py-3.5">
                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                                                    {s.channel}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                                                    {s.paymentMethod}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 text-right font-black text-slate-900 text-sm">
                                                Rp {s.total.toLocaleString('id-ID')}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                MODAL AKSI SUPER ADMIN
            ══════════════════════════════════════════════════════════════ */}
            {actionType && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-base font-bold text-slate-900">
                                {actionType === 'extend_trial' && '⏱️ Perpanjang Masa Trial'}
                                {actionType === 'change_status' && '⚙️ Ubah Status Langganan'}
                                {actionType === 'rename_business' && '✏️ Ubah Nama Bisnis'}
                                {actionType === 'reset_password' && '🔑 Reset Kata Sandi Pengguna'}
                            </h3>
                            <button
                                onClick={closeActionModal}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleActionSubmit} className="mt-4 space-y-4">
                            {/* Target Info */}
                            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 border border-slate-100">
                                <div>
                                    Target:{' '}
                                    <span className="font-bold text-slate-900">
                                        {selectedUser ? `${selectedUser.fullName} (${selectedUser.email})` : selectedBusiness?.name}
                                    </span>
                                </div>
                                {(selectedBusiness || selectedUser?.businessName) && (
                                    <div className="mt-0.5 text-slate-500">
                                        Bisnis: <span className="font-medium">{selectedBusiness?.name || selectedUser?.businessName}</span>
                                    </div>
                                )}
                            </div>

                            {/* Form Perpanjang Trial */}
                            {actionType === 'extend_trial' && (
                                <div className="space-y-3">
                                    <label className="block text-xs font-semibold text-slate-700">
                                        Jumlah Hari Tambahan
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[7, 14, 30].map((d) => (
                                            <button
                                                key={d}
                                                type="button"
                                                onClick={() => setExtendDays(d)}
                                                className={`rounded-xl border py-2 text-xs font-bold transition cursor-pointer ${
                                                    extendDays === d
                                                        ? 'border-blue-600 bg-blue-600 text-white'
                                                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                                }`}
                                            >
                                                +{d} Hari
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-2">
                                        <span className="text-[11px] text-slate-400">Atau masukkan jumlah hari kustom:</span>
                                        <input
                                            type="number"
                                            min={1}
                                            value={extendDays}
                                            onChange={(e) => setExtendDays(Number(e.target.value))}
                                            className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Form Ubah Status Langganan */}
                            {actionType === 'change_status' && (
                                <div className="space-y-2">
                                    <label className="block text-xs font-semibold text-slate-700">Pilih Status Baru</label>
                                    <select
                                        value={newStatus}
                                        onChange={(e) => setNewStatus(e.target.value as any)}
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                                    >
                                        <option value="trial">Trial (Masa Percobaan)</option>
                                        <option value="active">Active (Langganan Berbayar Penuh)</option>
                                        <option value="expired">Expired (Trial / Langganan Selesai)</option>
                                    </select>
                                    <p className="text-[11px] text-slate-500">
                                        *Jika memilih Trial dan masa aktif sebelumnya sudah habis, sistem otomatis mereset masa berlaku 7 hari ke depan.
                                    </p>
                                </div>
                            )}

                            {/* Form Ubah Nama Bisnis */}
                            {actionType === 'rename_business' && (
                                <div className="space-y-2">
                                    <label className="block text-xs font-semibold text-slate-700">Nama Bisnis Baru</label>
                                    <input
                                        type="text"
                                        required
                                        value={newBizName}
                                        onChange={(e) => setNewBizName(e.target.value)}
                                        placeholder="Contoh: Kopi Nusantara"
                                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                            )}

                            {/* Form Reset Password */}
                            {actionType === 'reset_password' && (
                                <div className="space-y-2">
                                    <label className="block text-xs font-semibold text-slate-700">Kata Sandi Baru</label>
                                    <input
                                        type="password"
                                        required
                                        minLength={6}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Minimal 6 karakter"
                                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                            )}

                            {/* Feedback Messages */}
                            {feedback && (
                                <p
                                    className={`text-xs font-semibold ${
                                        feedback.type === 'ok' ? 'text-emerald-600' : 'text-red-600'
                                    }`}
                                >
                                    {feedback.type === 'ok' ? '✓ ' : '✗ '}
                                    {feedback.text}
                                </p>
                            )}

                            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                                <button
                                    type="button"
                                    onClick={closeActionModal}
                                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                                >
                                    {loading ? 'Menyimpan...' : 'Simpan Perubahan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
