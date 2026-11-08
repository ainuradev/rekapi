'use client'

import { useState } from 'react'
import {
    adminUpdateBusinessName,
    adminResetUserPassword,
    adminOverrideSubscription,
    adminCreateSystemNotification,
    adminDeleteSystemNotification,
} from './actions'

export interface AdminNotificationItem {
    id: string
    businessId: string | null
    businessName: string | null
    title: string
    message: string
    category: 'announcement' | 'subscription' | 'maintenance' | 'promo' | 'feature' | 'system'
    actionUrl: string | null
    createdAt: string
}

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
    subscriptionExpiresAt: string | null
    effectiveExpiresAt: string | null
    daysRemaining: number
    isExpired: boolean
    branchCount: number
    salesCount: number
    salesVolume: number
}

export interface AdminBusinessItem {
    id: string
    name: string
    ownerName: string
    ownerEmail: string
    subscriptionStatus: string
    planId: string | null
    planCode: string | null
    planName: string
    trialEndsAt: string | null
    subscriptionExpiresAt: string | null
    effectiveExpiresAt: string | null
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
    standardCount: number
    businessTierCount: number
    proCount: number
    totalBranches: number
    totalSalesCount: number
    totalPlatformRevenue: number
}

export interface SubscriptionPlanItem {
    id: string
    code: string
    name: string
    price: number
    maxBranches: number | null
    maxEmployees: number | null
    durationDays: number
}

interface Props {
    users: AdminUserItem[]
    businesses: AdminBusinessItem[]
    recentSales: AdminSaleItem[]
    metrics: PlatformMetrics
    plans: SubscriptionPlanItem[]
    notifications?: AdminNotificationItem[]
}

function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '-'
    try {
        const d = new Date(dateStr)
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
    } catch {
        return '-'
    }
}

export default function AdminClient({
    users,
    businesses,
    recentSales,
    metrics,
    notifications = [],
}: Props) {
    const [tab, setTab] = useState<'tenants' | 'users' | 'sales' | 'notifications'>('tenants')
    const [notificationsList, setNotificationsList] = useState<AdminNotificationItem[]>(notifications)
    const [search, setSearch] = useState('')
    const [planFilter, setPlanFilter] = useState<'all' | 'active' | 'standard' | 'business' | 'pro' | 'trial' | 'expired'>('all')
    const [roleFilter, setRoleFilter] = useState<'all' | 'owner' | 'pegawai'>('all')

    // State Modal Aksi
    const [selectedBusiness, setSelectedBusiness] = useState<AdminBusinessItem | null>(null)
    const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null)
    const [modalMode, setModalMode] = useState<'override_sub' | 'rename_biz' | 'reset_password' | 'create_notif' | null>(null)

    const [loading, setLoading] = useState(false)
    const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

    // Form Override Subscription State
    const [targetPlanCode, setTargetPlanCode] = useState<'standard' | 'business' | 'pro' | 'trial'>('pro')
    const [targetStatus, setTargetStatus] = useState<'active' | 'trial' | 'expired'>('active')
    const [presetDays, setPresetDays] = useState<number>(30)
    const [customExpiryDate, setCustomExpiryDate] = useState<string>('')
    const [overrideNotes, setOverrideNotes] = useState<string>('')

    // Form Rename Business State
    const [newBizName, setNewBizName] = useState('')

    // Form Reset Password State
    const [newPassword, setNewPassword] = useState('')

    // Form Notifikasi Sistem State
    const [notifTargetBizId, setNotifTargetBizId] = useState<string>('')
    const [notifTitle, setNotifTitle] = useState('')
    const [notifMessage, setNotifMessage] = useState('')
    const [notifCategory, setNotifCategory] = useState<'announcement' | 'subscription' | 'maintenance' | 'promo' | 'feature' | 'system'>('announcement')
    const [notifActionUrl, setNotifActionUrl] = useState('')
    const [deletingNotifId, setDeletingNotifId] = useState<string | null>(null)

    // Filter Businesses
    const filteredBusinesses = businesses.filter((b) => {
        const q = search.toLowerCase()
        const matchSearch =
            b.name.toLowerCase().includes(q) ||
            b.ownerEmail.toLowerCase().includes(q) ||
            b.ownerName.toLowerCase().includes(q)

        let matchPlan = true
        if (planFilter === 'active') {
            matchPlan = b.subscriptionStatus === 'active'
        } else if (planFilter === 'standard') {
            matchPlan = b.subscriptionStatus === 'active' && b.planCode === 'standard'
        } else if (planFilter === 'business') {
            matchPlan = b.subscriptionStatus === 'active' && b.planCode === 'business'
        } else if (planFilter === 'pro') {
            matchPlan = b.subscriptionStatus === 'active' && b.planCode === 'pro'
        } else if (planFilter === 'trial') {
            matchPlan = b.subscriptionStatus === 'trial' && !b.isExpired
        } else if (planFilter === 'expired') {
            matchPlan = b.isExpired
        }

        return matchSearch && matchPlan
    })

    // Filter Users
    const filteredUsers = users.filter((u) => {
        const q = search.toLowerCase()
        const matchSearch =
            u.fullName.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.businessName.toLowerCase().includes(q)

        const matchRole = roleFilter === 'all' || u.role === roleFilter

        return matchSearch && matchRole
    })

    // Filter Notifications
    const filteredNotifications = notificationsList.filter((n) => {
        const q = search.toLowerCase()
        return (
            n.title.toLowerCase().includes(q) ||
            n.message.toLowerCase().includes(q) ||
            (n.businessName && n.businessName.toLowerCase().includes(q)) ||
            n.category.toLowerCase().includes(q)
        )
    })

    // Open Override Modal
    const openOverrideModal = (biz: AdminBusinessItem) => {
        setSelectedBusiness(biz)
        setSelectedUser(null)
        setModalMode('override_sub')
        setFeedback(null)

        // Set initial values from business
        if (biz.subscriptionStatus === 'active' && biz.planCode) {
            setTargetPlanCode(biz.planCode as 'standard' | 'business' | 'pro')
            setTargetStatus('active')
        } else if (biz.isExpired) {
            setTargetPlanCode('standard')
            setTargetStatus('expired')
        } else {
            setTargetPlanCode('trial')
            setTargetStatus('trial')
        }

        setPresetDays(30)
        setCustomExpiryDate('')
        setOverrideNotes('')
    }

    // Open Rename Modal
    const openRenameModal = (biz: AdminBusinessItem) => {
        setSelectedBusiness(biz)
        setSelectedUser(null)
        setNewBizName(biz.name)
        setModalMode('rename_biz')
        setFeedback(null)
    }

    // Open Reset Password Modal
    const openResetPasswordModal = (user: AdminUserItem) => {
        setSelectedUser(user)
        setSelectedBusiness(null)
        setNewPassword('')
        setModalMode('reset_password')
        setFeedback(null)
    }

    // Open Kirim Notifikasi Modal
    const openCreateNotifModal = (targetBusinessId?: string) => {
        setNotifTargetBizId(targetBusinessId || '')
        setNotifTitle('')
        setNotifMessage('')
        setNotifCategory('announcement')
        setNotifActionUrl('')
        setModalMode('create_notif')
        setFeedback(null)
    }

    const closeModal = () => {
        setModalMode(null)
        setSelectedBusiness(null)
        setSelectedUser(null)
        setFeedback(null)
    }

    // Submit Kirim Notifikasi Sistem
    async function handleCreateNotifSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!notifTitle.trim() || !notifMessage.trim()) return
        setLoading(true)
        setFeedback(null)

        try {
            const res = await adminCreateSystemNotification({
                businessId: notifTargetBizId || null,
                title: notifTitle.trim(),
                message: notifMessage.trim(),
                category: notifCategory,
                actionUrl: notifActionUrl.trim() || null,
            })

            if (res.error) {
                setFeedback({ type: 'err', text: res.error })
            } else if (res.notification) {
                const targetBiz = businesses.find((b) => b.id === notifTargetBizId)
                const newNotif: AdminNotificationItem = {
                    id: res.notification.id,
                    businessId: res.notification.business_id,
                    businessName: targetBiz?.name || null,
                    title: res.notification.title,
                    message: res.notification.message,
                    category: res.notification.category,
                    actionUrl: res.notification.action_url,
                    createdAt: res.notification.created_at,
                }
                setNotificationsList((prev) => [newNotif, ...prev])
                setFeedback({ type: 'ok', text: 'Notifikasi berhasil dikirim!' })
                setTimeout(() => closeModal(), 1000)
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.'
            setFeedback({ type: 'err', text: msg })
        } finally {
            setLoading(false)
        }
    }

    // Hapus Notifikasi
    async function handleDeleteNotif(id: string) {
        if (!confirm('Apakah Anda yakin ingin menghapus / menarik pengumuman notifikasi ini?')) return
        setDeletingNotifId(id)
        try {
            const res = await adminDeleteSystemNotification(id)
            if (res.success) {
                setNotificationsList((prev) => prev.filter((n) => n.id !== id))
            } else if (res.error) {
                alert(res.error)
            }
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Gagal menghapus notifikasi.')
        } finally {
            setDeletingNotifId(null)
        }
    }

    // Submit Override Subscription
    async function handleOverrideSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!selectedBusiness) return
        setLoading(true)
        setFeedback(null)

        try {
            const res = await adminOverrideSubscription({
                businessId: selectedBusiness.id,
                planCode: targetPlanCode,
                status: targetStatus,
                daysToAdd: customExpiryDate ? undefined : presetDays,
                expiresAtDate: customExpiryDate || undefined,
                notes: overrideNotes.trim() || undefined,
            })

            if (res.error) {
                setFeedback({ type: 'err', text: res.error })
            } else {
                setFeedback({ type: 'ok', text: 'Langganan berhasil diperbarui dan aktif!' })
                setTimeout(() => closeModal(), 1000)
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.'
            setFeedback({ type: 'err', text: msg })
        } finally {
            setLoading(false)
        }
    }

    // Submit Rename Business
    async function handleRenameSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!selectedBusiness) return
        setLoading(true)
        setFeedback(null)

        try {
            const res = await adminUpdateBusinessName(selectedBusiness.id, newBizName)
            if (res.error) {
                setFeedback({ type: 'err', text: res.error })
            } else {
                setFeedback({ type: 'ok', text: 'Nama bisnis berhasil diperbarui!' })
                setTimeout(() => closeModal(), 1000)
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.'
            setFeedback({ type: 'err', text: msg })
        } finally {
            setLoading(false)
        }
    }

    // Submit Reset Password
    async function handleResetPasswordSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!selectedUser) return
        setLoading(true)
        setFeedback(null)

        try {
            const res = await adminResetUserPassword(selectedUser.id, newPassword)
            if (res.error) {
                setFeedback({ type: 'err', text: res.error })
            } else {
                setFeedback({ type: 'ok', text: `Kata sandi ${selectedUser.fullName} berhasil diperbarui!` })
                setTimeout(() => closeModal(), 1000)
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.'
            setFeedback({ type: 'err', text: msg })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* ── Page Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                        Manajemen Klien & Langganan SaaS
                    </h1>
                    <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
                        Pemantauan operasional multi-tenant, status masa aktif, dan override langganan manual untuk UMKM.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 shadow-2xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Sistem Normal</span>
                    </span>
                </div>
            </div>

            {/* ── 1. Stat Strip SaaS (Clean Sheet, Zero Emoji, 1 Horizontal Row) ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border border-slate-200 rounded-xl bg-white shadow-2xs overflow-hidden">
                {/* Cell 1: Total Bisnis */}
                <div className="p-4 sm:p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Bisnis Terdaftar</p>
                    <p className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
                        {metrics.totalBusinesses}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                        {metrics.totalOwners} Owner • {metrics.totalEmployees} Pegawai
                    </p>
                </div>

                {/* Cell 2: Pelanggan Aktif */}
                <div className="p-4 sm:p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pelanggan Berbayar (Active)</p>
                    <p className="mt-1 text-2xl sm:text-3xl font-bold text-emerald-700 tabular-nums">
                        {metrics.subscribedCount}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                        {metrics.standardCount} Standard • {metrics.businessTierCount} Business • {metrics.proCount} Pro
                    </p>
                </div>

                {/* Cell 3: Status Trial & Expired */}
                <div className="p-4 sm:p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status Trial & Expired</p>
                    <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-2xl sm:text-3xl font-bold text-blue-700 tabular-nums">
                            {metrics.trialActiveCount}
                        </span>
                        <span className="text-xs font-semibold text-slate-400">Aktif</span>
                        {metrics.trialExpiredCount > 0 && (
                            <span className="text-xs font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200/80">
                                {metrics.trialExpiredCount} Expired
                            </span>
                        )}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                        Tingkat konversi: {metrics.totalBusinesses > 0 ? Math.round((metrics.subscribedCount / metrics.totalBusinesses) * 100) : 0}%
                    </p>
                </div>

                {/* Cell 4: Cabang & GMV Platform */}
                <div className="p-4 sm:p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Cabang & Transaksi</p>
                    <p className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
                        {metrics.totalBranches} <span className="text-sm font-semibold text-slate-400">Cabang</span>
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                        {metrics.totalSalesCount.toLocaleString('id-ID')} order • Rp {metrics.totalPlatformRevenue.toLocaleString('id-ID')}
                    </p>
                </div>
            </div>

            {/* ── 2. Navigation Tabs (Clean Underline) ── */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
                <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
                    <button
                        type="button"
                        onClick={() => {
                            setTab('tenants')
                            setSearch('')
                        }}
                        className={`pb-3 text-xs sm:text-sm font-semibold transition border-b-2 cursor-pointer whitespace-nowrap ${
                            tab === 'tenants'
                                ? 'border-emerald-700 text-emerald-900'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        Tenant & Klien Bisnis ({businesses.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setTab('users')
                            setSearch('')
                        }}
                        className={`pb-3 text-xs sm:text-sm font-semibold transition border-b-2 cursor-pointer whitespace-nowrap ${
                            tab === 'users'
                                ? 'border-emerald-700 text-emerald-900'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        Akun Pengguna ({users.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setTab('sales')
                            setSearch('')
                        }}
                        className={`pb-3 text-xs sm:text-sm font-semibold transition border-b-2 cursor-pointer whitespace-nowrap ${
                            tab === 'sales'
                                ? 'border-emerald-700 text-emerald-900'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        Aktivitas Transaksi Live ({recentSales.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setTab('notifications')
                            setSearch('')
                        }}
                        className={`pb-3 text-xs sm:text-sm font-semibold transition border-b-2 cursor-pointer whitespace-nowrap ${
                            tab === 'notifications'
                                ? 'border-emerald-700 text-emerald-900'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        Notifikasi & Broadcast ({notificationsList.length})
                    </button>
                </div>

                <div className="pb-2">
                    <button
                        type="button"
                        onClick={() => openCreateNotifModal()}
                        className="px-3 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Kirim Notifikasi Sistem</span>
                    </button>
                </div>
            </div>

            {/* ── 3. Filters & Search Strip ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="relative flex-1 max-w-md">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={
                            tab === 'tenants'
                                ? 'Cari nama bisnis, nama owner, atau email...'
                                : tab === 'users'
                                ? 'Cari nama, email, atau bisnis...'
                                : tab === 'sales'
                                ? 'Cari transaksi...'
                                : 'Cari judul notifikasi, pesan, atau bisnis...'
                        }
                        className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition shadow-2xs"
                    />
                    <svg
                        className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {tab === 'tenants' && (
                        <select
                            value={planFilter}
                            onChange={(e) => setPlanFilter(e.target.value as 'all' | 'active' | 'standard' | 'business' | 'pro' | 'trial' | 'expired')}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-600 shadow-2xs cursor-pointer"
                        >
                            <option value="all">Semua Status & Paket</option>
                            <option value="active">Paket Berbayar (Semua)</option>
                            <option value="standard">Paket Standard</option>
                            <option value="business">Paket Business</option>
                            <option value="pro">Paket Pro</option>
                            <option value="trial">Free Trial Aktif</option>
                            <option value="expired">Expired / Selesai</option>
                        </select>
                    )}

                    {tab === 'users' && (
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value as 'all' | 'owner' | 'pegawai')}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-600 shadow-2xs cursor-pointer"
                        >
                            <option value="all">Semua Peran (Role)</option>
                            <option value="owner">Owner Saja</option>
                            <option value="pegawai">Pegawai Saja</option>
                        </select>
                    )}

                    {(search || planFilter !== 'all' || roleFilter !== 'all') && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearch('')
                                setPlanFilter('all')
                                setRoleFilter('all')
                            }}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                        >
                            Reset
                        </button>
                    )}
                </div>
            </div>

            {/* ── 4. TAB 1: TENANT SHEET (Data Sheet Klien Bisnis) ── */}
            {tab === 'tenants' && (
                <div className="border border-slate-200 rounded-xl bg-white shadow-2xs overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 sm:px-5 py-3.5">Nama Bisnis</th>
                                    <th className="px-4 py-3.5">Owner Bisnis</th>
                                    <th className="px-4 py-3.5">Paket Langganan</th>
                                    <th className="px-4 py-3.5">Masa Aktif</th>
                                    <th className="px-4 py-3.5">Cabang & Pegawai</th>
                                    <th className="px-4 py-3.5">Aktivitas Trx</th>
                                    <th className="px-4 sm:px-5 py-3.5 text-right">Aksi Admin</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredBusinesses.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                                            Tidak ada bisnis yang cocok dengan filter.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredBusinesses.map((b) => (
                                        <tr key={b.id} className="hover:bg-slate-50/70 transition">
                                            {/* Nama Bisnis */}
                                            <td className="px-4 sm:px-5 py-3.5">
                                                <div className="font-bold text-slate-900 text-sm">{b.name}</div>
                                                <div className="text-[10px] text-slate-400 mt-0.5">
                                                    Bergabung: {formatDate(b.createdAt)}
                                                </div>
                                            </td>

                                            {/* Owner Bisnis */}
                                            <td className="px-4 py-3.5">
                                                <div className="font-semibold text-slate-800">{b.ownerName}</div>
                                                <div className="text-[11px] text-slate-500 font-mono select-all">
                                                    {b.ownerEmail}
                                                </div>
                                            </td>

                                            {/* Paket Langganan */}
                                            <td className="px-4 py-3.5">
                                                <div className="inline-flex items-center gap-1.5">
                                                    <span
                                                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                                                            b.subscriptionStatus === 'active'
                                                                ? b.planCode === 'pro'
                                                                    ? 'bg-purple-50 text-purple-800 border-purple-200'
                                                                    : b.planCode === 'business'
                                                                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                                                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                                : b.isExpired
                                                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                                : 'bg-amber-50 text-amber-800 border-amber-200'
                                                        }`}
                                                    >
                                                        {b.planName}
                                                    </span>
                                                    {b.subscriptionStatus === 'active' && (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Aktif" />
                                                    )}
                                                </div>
                                            </td>

                                            {/* Masa Aktif */}
                                            <td className="px-4 py-3.5">
                                                <div className="font-semibold text-slate-800">
                                                    {b.effectiveExpiresAt ? formatDate(b.effectiveExpiresAt) : 'Masa Aktif Tidak Ada'}
                                                </div>
                                                <div className="mt-0.5">
                                                    {b.subscriptionStatus === 'active' ? (
                                                        b.isExpired ? (
                                                            <span className="text-[10px] font-bold text-rose-600">Langganan Habis</span>
                                                        ) : (
                                                            <span className="text-[10px] font-medium text-emerald-700">
                                                                {b.daysRemaining} hari lagi
                                                            </span>
                                                        )
                                                    ) : b.isExpired ? (
                                                        <span className="text-[10px] font-bold text-rose-600">Trial Habis</span>
                                                    ) : (
                                                        <span className="text-[10px] font-medium text-blue-700">
                                                            Sisa {b.daysRemaining} hari trial
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Cabang & Pegawai */}
                                            <td className="px-4 py-3.5 text-slate-700">
                                                <div className="font-semibold tabular-nums">
                                                    {b.branchCount} Cabang
                                                </div>
                                                <div className="text-[11px] text-slate-400 tabular-nums">
                                                    {b.employeeCount} Pegawai
                                                </div>
                                            </td>

                                            {/* Aktivitas Trx */}
                                            <td className="px-4 py-3.5 text-slate-700">
                                                <div className="font-semibold tabular-nums">
                                                    {b.salesCount} trx
                                                </div>
                                                <div className="text-[11px] text-slate-500 tabular-nums">
                                                    Rp {b.salesVolume.toLocaleString('id-ID')}
                                                </div>
                                            </td>

                                            {/* Aksi Admin */}
                                            <td className="px-4 sm:px-5 py-3.5 text-right">
                                                <div className="inline-flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => openOverrideModal(b)}
                                                        className="rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white px-2.5 py-1 text-xs font-semibold shadow-2xs transition cursor-pointer"
                                                        title="Override Paket & Tanggal Aktif"
                                                    >
                                                        Override Paket
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => openCreateNotifModal(b.id)}
                                                        className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-2 py-1 text-xs font-semibold transition cursor-pointer"
                                                        title="Kirim Notifikasi Khusus ke Bisnis Ini"
                                                    >
                                                        Kirim Notif
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => openRenameModal(b)}
                                                        className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-2 py-1 text-xs font-semibold transition cursor-pointer"
                                                        title="Edit Nama Bisnis"
                                                    >
                                                        Edit
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

            {/* ── 5. TAB 2: AKUN PENGGUNA (User Sheet) ── */}
            {tab === 'users' && (
                <div className="border border-slate-200 rounded-xl bg-white shadow-2xs overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 sm:px-5 py-3.5">Nama & Email Login</th>
                                    <th className="px-4 py-3.5">Peran (Role)</th>
                                    <th className="px-4 py-3.5">Bisnis Penugasan</th>
                                    <th className="px-4 py-3.5">Cabang</th>
                                    <th className="px-4 py-3.5">Status Login</th>
                                    <th className="px-4 py-3.5">Tgl Terdaftar</th>
                                    <th className="px-4 sm:px-5 py-3.5 text-right">Aksi Akun</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                                            Tidak ada pengguna yang cocok dengan filter.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map((u) => (
                                        <tr key={u.id} className="hover:bg-slate-50/70 transition">
                                            <td className="px-4 sm:px-5 py-3.5">
                                                <div className="font-bold text-slate-900 text-sm">{u.fullName}</div>
                                                <div className="text-[11px] text-slate-500 font-mono select-all">
                                                    {u.email}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span
                                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                                                        u.role === 'owner'
                                                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                                                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                    }`}
                                                >
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <div className="font-semibold text-slate-800">{u.businessName}</div>
                                            </td>
                                            <td className="px-4 py-3.5 text-slate-600">
                                                {u.role === 'owner' ? (
                                                    <span className="text-slate-400">Semua ({u.branchCount})</span>
                                                ) : (
                                                    u.branchName || 'Belum diatur'
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 uppercase">
                                                    {u.provider}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 text-slate-500">
                                                {formatDate(u.createdAt)}
                                            </td>
                                            <td className="px-4 sm:px-5 py-3.5 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => openResetPasswordModal(u)}
                                                    className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1 text-xs font-semibold transition cursor-pointer"
                                                >
                                                    Reset Password
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── 6. TAB 3: LIVE TRANSAKSI ── */}
            {tab === 'sales' && (
                <div className="border border-slate-200 rounded-xl bg-white shadow-2xs overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 sm:px-5 py-3.5">Waktu Transaksi</th>
                                    <th className="px-4 py-3.5">Nama Bisnis</th>
                                    <th className="px-4 py-3.5">Cabang</th>
                                    <th className="px-4 py-3.5">Channel</th>
                                    <th className="px-4 py-3.5">Metode Bayar</th>
                                    <th className="px-4 sm:px-5 py-3.5 text-right">Total Transaksi</th>
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
                                        <tr key={s.id} className="hover:bg-slate-50/70 transition">
                                            <td className="px-4 sm:px-5 py-3.5 text-slate-500">
                                                <div>{formatDate(s.createdAt)}</div>
                                                <div className="text-[10px] text-slate-400">
                                                    {new Date(s.createdAt).toLocaleTimeString('id-ID', {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5 font-bold text-slate-900">{s.businessName}</td>
                                            <td className="px-4 py-3.5 text-slate-600">{s.branchName}</td>
                                            <td className="px-4 py-3.5">
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                                                    {s.channel}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                                                    {s.paymentMethod}
                                                </span>
                                            </td>
                                            <td className="px-4 sm:px-5 py-3.5 text-right font-bold text-slate-900 tabular-nums">
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

            {/* ── 7. TAB 4: RIWAYAT NOTIFIKASI & BROADCAST ── */}
            {tab === 'notifications' && (
                <div className="border border-slate-200 rounded-xl bg-white shadow-2xs overflow-hidden">
                    <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                        <div>
                            <h3 className="font-bold text-sm text-slate-900">Riwayat Pengumuman & Notifikasi Sistem</h3>
                            <p className="text-xs text-slate-500">Pesan broadcast global dan notifikasi tenant yang dikirim oleh Super Admin / Sistem</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => openCreateNotifModal()}
                            className="px-3 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer self-start sm:self-auto"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span>Buat Notifikasi Baru</span>
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 sm:px-5 py-3.5">Waktu Kirim</th>
                                    <th className="px-4 py-3.5">Target Penerima</th>
                                    <th className="px-4 py-3.5">Kategori</th>
                                    <th className="px-4 py-3.5">Judul & Isi Notifikasi</th>
                                    <th className="px-4 py-3.5">Link Aksi</th>
                                    <th className="px-4 sm:px-5 py-3.5 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredNotifications.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                                            Belum ada pengumuman notifikasi yang dikirim.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredNotifications.map((n) => {
                                        const categoryLabels: Record<string, { label: string; cls: string }> = {
                                            announcement: { label: 'Pengumuman', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
                                            subscription: { label: 'Langganan', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                                            maintenance: { label: 'Maintenance', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
                                            promo: { label: 'Promo', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
                                            feature: { label: 'Fitur Baru', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
                                            system: { label: 'Sistem Toko', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
                                        }
                                        const cat = categoryLabels[n.category] || { label: n.category, cls: 'bg-slate-100 text-slate-700 border-slate-200' }

                                        return (
                                            <tr key={n.id} className="hover:bg-slate-50/70 transition">
                                                <td className="px-4 sm:px-5 py-3.5 text-slate-500 whitespace-nowrap">
                                                    <div>{formatDate(n.createdAt)}</div>
                                                    <div className="text-[10px] text-slate-400">
                                                        {new Date(n.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5 whitespace-nowrap">
                                                    {n.businessId ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                                                            Bisnis: {n.businessName || 'Tenant'}
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                            Broadcast Global (Semua)
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3.5 whitespace-nowrap">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${cat.cls}`}>
                                                        {cat.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5 max-w-xs sm:max-w-md">
                                                    <div className="font-bold text-slate-900 text-xs">{n.title}</div>
                                                    <p className="text-slate-600 text-xs mt-0.5 line-clamp-2 leading-relaxed">{n.message}</p>
                                                </td>
                                                <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                                                    {n.actionUrl ? (
                                                        <span className="font-mono text-[11px] text-emerald-700 underline truncate max-w-[120px] block" title={n.actionUrl}>
                                                            {n.actionUrl}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-300">-</span>
                                                    )}
                                                </td>
                                                <td className="px-4 sm:px-5 py-3.5 text-right whitespace-nowrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteNotif(n.id)}
                                                        disabled={deletingNotifId === n.id}
                                                        className="rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 px-2.5 py-1 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                                                    >
                                                        {deletingNotifId === n.id ? 'Menghapus...' : 'Hapus'}
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                MODAL 1: OVERRIDE LANGGANAN MANUAL (Zero AI Slop)
            ══════════════════════════════════════════════════════════════ */}
            {modalMode === 'override_sub' && selectedBusiness && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-2xs animate-in fade-in duration-150">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">
                                    Override Langganan Manual
                                </h3>
                                <p className="text-xs text-slate-500">
                                    Atur status paket dan masa berlaku untuk pembayaran transfer manual UMKM.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleOverrideSubmit} className="mt-4 space-y-4">
                            {/* Tenant Details Info */}
                            <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-xs space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Bisnis Klien:</span>
                                    <span className="font-bold text-slate-900">{selectedBusiness.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Owner Login:</span>
                                    <span className="font-mono text-slate-700">{selectedBusiness.ownerEmail}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Paket Saat Ini:</span>
                                    <span className="font-semibold text-slate-800">
                                        {selectedBusiness.planName} ({selectedBusiness.subscriptionStatus})
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Masa Aktif Saat Ini:</span>
                                    <span className="font-medium text-slate-700">
                                        {selectedBusiness.effectiveExpiresAt ? formatDate(selectedBusiness.effectiveExpiresAt) : '-'}
                                    </span>
                                </div>
                            </div>

                            {/* Pilihan Paket Langganan */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                                    Pilih Paket Langganan
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTargetPlanCode('standard')
                                            setTargetStatus('active')
                                        }}
                                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                                            targetPlanCode === 'standard' && targetStatus === 'active'
                                                ? 'border-emerald-700 bg-emerald-50/70 ring-1 ring-emerald-700'
                                                : 'border-slate-200 bg-white hover:bg-slate-50'
                                        }`}
                                    >
                                        <p className="font-bold text-slate-900 text-xs">Standard</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">1 Cabang • 1 Pegawai</p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTargetPlanCode('business')
                                            setTargetStatus('active')
                                        }}
                                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                                            targetPlanCode === 'business' && targetStatus === 'active'
                                                ? 'border-emerald-700 bg-emerald-50/70 ring-1 ring-emerald-700'
                                                : 'border-slate-200 bg-white hover:bg-slate-50'
                                        }`}
                                    >
                                        <p className="font-bold text-slate-900 text-xs">Business</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">3 Cabang • 3 Pegawai</p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTargetPlanCode('pro')
                                            setTargetStatus('active')
                                        }}
                                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                                            targetPlanCode === 'pro' && targetStatus === 'active'
                                                ? 'border-emerald-700 bg-emerald-50/70 ring-1 ring-emerald-700'
                                                : 'border-slate-200 bg-white hover:bg-slate-50'
                                        }`}
                                    >
                                        <p className="font-bold text-slate-900 text-xs">Pro</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">5 Cabang • 5 Pegawai</p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTargetPlanCode('trial')
                                            setTargetStatus('trial')
                                        }}
                                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                                            targetPlanCode === 'trial'
                                                ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
                                                : 'border-slate-200 bg-white hover:bg-slate-50'
                                        }`}
                                    >
                                        <p className="font-bold text-slate-900 text-xs">Free Trial</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">Masa Percobaan Gratis</p>
                                    </button>
                                </div>
                            </div>

                            {/* Status Langganan */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-800 mb-1">
                                    Status Langganan
                                </label>
                                <select
                                    value={targetStatus}
                                    onChange={(e) => setTargetStatus(e.target.value as 'active' | 'trial' | 'expired')}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-600"
                                >
                                    <option value="active">Active (Akses Penuh Berbayar)</option>
                                    <option value="trial">Trial (Masa Uji Coba)</option>
                                    <option value="expired">Expired (Terkunci / Masa Berlaku Habis)</option>
                                </select>
                            </div>

                            {/* Durasi Tambahan / Perpanjangan */}
                            {targetStatus !== 'expired' && (
                                <div className="space-y-2">
                                    <label className="block text-xs font-semibold text-slate-800">
                                        Perpanjang Masa Aktif
                                    </label>
                                    <div className="grid grid-cols-4 gap-1.5">
                                        {[
                                            { label: '+30 Hari', days: 30 },
                                            { label: '+90 Hari', days: 90 },
                                            { label: '+180 Hari', days: 180 },
                                            { label: '+1 Tahun', days: 365 },
                                        ].map((item) => (
                                            <button
                                                key={item.days}
                                                type="button"
                                                onClick={() => {
                                                    setPresetDays(item.days)
                                                    setCustomExpiryDate('')
                                                }}
                                                className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer text-center ${
                                                    presetDays === item.days && !customExpiryDate
                                                        ? 'bg-emerald-800 text-white border-emerald-800'
                                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                                }`}
                                            >
                                                {item.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="pt-1">
                                        <label className="block text-[11px] text-slate-500 mb-1">
                                            Atau pilih tanggal kadaluarsa spesifik:
                                        </label>
                                        <input
                                            type="date"
                                            value={customExpiryDate}
                                            onChange={(e) => setCustomExpiryDate(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Catatan Override */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-800 mb-1">
                                    Catatan / Referensi Transfer (Opsional)
                                </label>
                                <input
                                    type="text"
                                    value={overrideNotes}
                                    onChange={(e) => setOverrideNotes(e.target.value)}
                                    placeholder="Contoh: Transfer Bank BCA ref 948271"
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
                                />
                            </div>

                            {/* Feedback Result */}
                            {feedback && (
                                <p
                                    className={`text-xs font-semibold p-2.5 rounded-lg border ${
                                        feedback.type === 'ok'
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                            : 'bg-rose-50 text-rose-800 border-rose-200'
                                    }`}
                                >
                                    {feedback.type === 'ok' ? '✓ ' : '✕ '}
                                    {feedback.text}
                                </p>
                            )}

                            {/* Modal Footer */}
                            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white px-4 py-2 text-xs font-semibold shadow-2xs transition disabled:opacity-50 cursor-pointer"
                                >
                                    {loading ? 'Menyimpan...' : 'Simpan Langganan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                MODAL 2: EDIT NAMA BISNIS
            ══════════════════════════════════════════════════════════════ */}
            {modalMode === 'rename_biz' && selectedBusiness && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-2xs animate-in fade-in duration-150">
                    <div className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-base font-bold text-slate-900">
                                Edit Nama Bisnis Klien
                            </h3>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleRenameSubmit} className="mt-4 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Nama Bisnis Baru
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={newBizName}
                                    onChange={(e) => setNewBizName(e.target.value)}
                                    placeholder="Nama bisnis"
                                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                                />
                            </div>

                            {feedback && (
                                <p
                                    className={`text-xs font-semibold ${
                                        feedback.type === 'ok' ? 'text-emerald-700' : 'text-rose-600'
                                    }`}
                                >
                                    {feedback.text}
                                </p>
                            )}

                            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white px-4 py-2 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
                                >
                                    {loading ? 'Menyimpan...' : 'Simpan Nama'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                MODAL 3: RESET PASSWORD USER
            ══════════════════════════════════════════════════════════════ */}
            {modalMode === 'reset_password' && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-2xs animate-in fade-in duration-150">
                    <div className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-base font-bold text-slate-900">
                                Reset Kata Sandi Pengguna
                            </h3>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleResetPasswordSubmit} className="mt-4 space-y-4">
                            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 border border-slate-100">
                                <p>
                                    Pengguna: <strong className="text-slate-900">{selectedUser.fullName}</strong>
                                </p>
                                <p className="text-slate-400 font-mono mt-0.5">{selectedUser.email}</p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Kata Sandi Baru (Minimal 6 Karakter)
                                </label>
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Masukkan password baru..."
                                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                                />
                            </div>

                            {feedback && (
                                <p
                                    className={`text-xs font-semibold ${
                                        feedback.type === 'ok' ? 'text-emerald-700' : 'text-rose-600'
                                    }`}
                                >
                                    {feedback.text}
                                </p>
                            )}

                            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white px-4 py-2 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
                                >
                                    {loading ? 'Menyimpan...' : 'Ganti Password'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                MODAL 4: KIRIM NOTIFIKASI SISTEM / BROADCAST (Clean Sheet)
            ══════════════════════════════════════════════════════════════ */}
            {modalMode === 'create_notif' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px] animate-in fade-in duration-150">
                    <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
                        {/* Header Tetap */}
                        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900">
                                    Kirim Notifikasi Sistem & Broadcast
                                </h3>
                                <p className="text-[11px] text-slate-500">
                                    Pesan akan langsung muncul pada ikon lonceng di dashboard pengguna
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                                aria-label="Tutup"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body Scrollable */}
                        <form onSubmit={handleCreateNotifSubmit} className="flex-1 flex flex-col min-h-0">
                            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                                {/* Target Penerima */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                                        Target Penerima Notifikasi
                                    </label>
                                    <select
                                        value={notifTargetBizId}
                                        onChange={(e) => setNotifTargetBizId(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-600"
                                    >
                                        <option value="">Semua Pengguna Rekapi (Broadcast Global)</option>
                                        <optgroup label="Kirim Khusus ke Bisnis Tertentu:">
                                            {businesses.map((b) => (
                                                <option key={b.id} value={b.id}>
                                                    {b.name} ({b.ownerName} - {b.ownerEmail})
                                                </option>
                                            ))}
                                        </optgroup>
                                    </select>
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        {notifTargetBizId
                                            ? 'Pesan hanya akan diterima oleh owner dan staf dari bisnis terpilih.'
                                            : 'Pesan akan diterima oleh seluruh pemilik toko dan staf aktif di Rekapi.'}
                                    </p>
                                </div>

                                {/* Kategori Notifikasi */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                                        Kategori Pengumuman
                                    </label>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        {[
                                            { value: 'announcement', label: 'Pengumuman' },
                                            { value: 'subscription', label: 'Langganan' },
                                            { value: 'feature', label: 'Pembaruan Fitur' },
                                            { value: 'promo', label: 'Promo Paket' },
                                            { value: 'maintenance', label: 'Maintenance' },
                                            { value: 'system', label: 'Sistem Toko' },
                                        ].map((cat) => (
                                            <button
                                                key={cat.value}
                                                type="button"
                                                onClick={() => setNotifCategory(cat.value as AdminNotificationItem['category'])}
                                                className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer text-center ${
                                                    notifCategory === cat.value
                                                        ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                                }`}
                                            >
                                                {cat.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Judul Notifikasi */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                                        Judul Notifikasi <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={notifTitle}
                                        onChange={(e) => setNotifTitle(e.target.value)}
                                        placeholder="Contoh: Pembaruan Sistem Rekapi v2.1 Siap Digunakan"
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-700"
                                    />
                                </div>

                                {/* Pesan Notifikasi */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                                        Isi Pesan <span className="text-rose-500">*</span>
                                    </label>
                                    <textarea
                                        required
                                        rows={3}
                                        value={notifMessage}
                                        onChange={(e) => setNotifMessage(e.target.value)}
                                        placeholder="Tuliskan rincian pengumuman atau instruksi untuk pengguna..."
                                        className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-700 leading-relaxed"
                                    />
                                </div>

                                {/* Link Tujuan Opsional */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                                        Link Aksi Opsional (Action URL)
                                    </label>
                                    <input
                                        type="text"
                                        value={notifActionUrl}
                                        onChange={(e) => setNotifActionUrl(e.target.value)}
                                        placeholder="/dashboard/subscription atau /dashboard/produk"
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-700"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        Jika diisi, pengguna yang mengklik notifikasi akan otomatis diarahkan ke halaman ini.
                                    </p>
                                </div>

                                {feedback && (
                                    <div
                                        className={`p-2.5 rounded-lg text-xs font-semibold border ${
                                            feedback.type === 'ok'
                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                : 'bg-rose-50 text-rose-800 border-rose-200'
                                        }`}
                                    >
                                        {feedback.text}
                                    </div>
                                )}
                            </div>

                            {/* Footer Tetap */}
                            <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white px-4 py-1.5 text-xs font-semibold transition disabled:opacity-50 cursor-pointer shadow-2xs"
                                >
                                    {loading ? 'Mengirim...' : 'Kirim Notifikasi'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
