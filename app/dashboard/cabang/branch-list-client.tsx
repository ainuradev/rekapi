'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { addBranch, updateBranch, deleteBranch, toggleBranchStatus } from './actions'

export type BranchType = 'outlet' | 'central_kitchen' | 'warehouse' | 'hub'
export type BranchStatus = 'active' | 'inactive' | 'closed'
export type OwnershipStatus = 'owned' | 'rented'

export interface Branch {
    id: string
    business_id?: string
    name: string
    code?: string | null
    branch_type?: BranchType
    city?: string | null
    latitude?: number | null
    longitude?: number | null
    phone?: string | null
    manager_name?: string | null
    ownership_status?: OwnershipStatus
    lease_start_date?: string | null
    lease_end_date?: string | null
    operating_hours?: { note?: string } | string | null
    status?: BranchStatus
    parent_branch_id?: string | null
    address?: string | null
    created_at?: string
}

interface Props {
    branches: Branch[]
    allowed: boolean
    reason?: string | null
    activeBranchId?: string
    maxBranches?: number | null
    planName?: string
}

const BRANCH_TYPE_CONFIG: Record<BranchType, { label: string; badge: string }> = {
    outlet: {
        label: 'Outlet Toko (POS)',
        badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    central_kitchen: {
        label: 'Dapur Pusat',
        badge: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    warehouse: {
        label: 'Gudang Pasokan',
        badge: 'bg-blue-50 text-blue-800 border-blue-200',
    },
    hub: {
        label: 'Hub Distribusi',
        badge: 'bg-purple-50 text-purple-800 border-purple-200',
    },
}

export default function BranchListClient({
    branches,
    allowed,
    reason,
    activeBranchId,
    maxBranches,
    planName,
}: Props) {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [addLoading, setAddLoading] = useState(false)
    const [addError, setAddError] = useState<string | null>(null)

    const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
    const [editLoading, setEditLoading] = useState(false)
    const [editError, setEditError] = useState<string | null>(null)

    const router = useRouter()
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [togglingId, setTogglingId] = useState<string | null>(null)

    // Lookup map parent branches
    const branchMap = new Map(branches.map((b) => [b.id, b.name]))

    const outletCount = branches.filter((b) => (b.branch_type || 'outlet') === 'outlet').length
    const nonOutletCount = branches.length - outletCount
    const activeBranchesCount = branches.filter((b) => (b.status || 'active') === 'active').length

    async function handleToggleStatus(branch: Branch) {
        if (togglingId) return
        const isCurrentlyActive = (branch.status || 'active') === 'active'
        const targetStatus = isCurrentlyActive ? 'inactive' : 'active'

        if (targetStatus === 'active') {
            const limit = maxBranches ?? 1
            if (activeBranchesCount >= limit) {
                alert(`Batas kuota cabang aktif paket Anda (${limit} cabang) sudah penuh. Upgrade paket atau nonaktifkan cabang lain terlebih dahulu.`)
                return
            }
        }

        if (targetStatus === 'inactive') {
            const confirmed = window.confirm(
                `Nonaktifkan cabang "${branch.name}"?\nKasir yang bertugas di cabang ini akan otomatis dinonaktifkan.`
            )
            if (!confirmed) return
        }

        setTogglingId(branch.id)
        try {
            const res = await toggleBranchStatus(branch.id, targetStatus)
            if (res?.error) {
                alert(res.error)
            } else {
                router.refresh()
            }
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Gagal mengubah status cabang')
        } finally {
            setTogglingId(null)
        }
    }

    async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setAddLoading(true)
        setAddError(null)

        const form = e.currentTarget
        const fd = new FormData(form)
        const res = await addBranch(fd)
        setAddLoading(false)

        if (res?.error) {
            setAddError(res.error)
        } else {
            setIsAddModalOpen(false)
        }
    }

    async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (!editingBranch) return

        setEditLoading(true)
        setEditError(null)

        const fd = new FormData(e.currentTarget)
        fd.set('branch_id', editingBranch.id)

        const res = await updateBranch(fd)
        setEditLoading(false)

        if (res?.error) {
            setEditError(res.error)
        } else {
            setEditingBranch(null)
        }
    }

    async function handleDelete(branch: Branch) {
        if (!confirm(`Hapus cabang "${branch.name}"? Data transaksi historis tetap tercatat aman.`)) {
            return
        }

        setDeletingId(branch.id)
        const res = await deleteBranch(branch.id)
        setDeletingId(null)

        if (res?.error) {
            alert(`Gagal menghapus cabang: ${res.error}`)
        }
    }

    const parseOperatingHours = (val: { note?: string } | string | null | undefined): string => {
        if (!val) return ''
        if (typeof val === 'string') {
            try {
                const parsed = JSON.parse(val)
                return parsed?.note || val
            } catch {
                return val
            }
        }
        return val.note || ''
    }

    return (
        <div className="space-y-6">
            {/* Header: Title & Add Branch Trigger */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                        Manajemen Cabang & Outlet
                    </h1>
                    <p className="mt-1 text-xs sm:text-sm text-slate-500">
                        Kelola outlet toko fisik (POS), dapur sentral, gudang pasokan, dan hub distribusi.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setAddError(null)
                        setIsAddModalOpen(true)
                    }}
                    className="inline-flex items-center justify-center gap-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg px-3.5 py-2 text-xs sm:text-sm font-semibold shrink-0 cursor-pointer transition shadow-xs active:scale-[0.99]"
                >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Tambah Cabang</span>
                </button>
            </div>

            {/* 1 Baris Stat Strip Horizontal */}
            <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-y sm:divide-y-0 divide-slate-200 border border-slate-200 rounded-lg bg-white overflow-hidden shadow-2xs">
                <div className="p-3.5 sm:p-4">
                    <p className="text-[11px] sm:text-xs font-medium text-slate-500">Total Cabang Aktif</p>
                    <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
                            {branches.length}
                        </span>
                        <span className="text-xs text-slate-500">Lokasi</span>
                    </div>
                </div>

                <div className="p-3.5 sm:p-4">
                    <p className="text-[11px] sm:text-xs font-medium text-slate-500">Tipe Lokasi</p>
                    <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                            {outletCount} <span className="text-xs font-normal text-slate-500">Outlet</span>
                        </span>
                        <span className="text-slate-300">/</span>
                        <span className="text-base sm:text-lg font-bold text-slate-700 tabular-nums">
                            {nonOutletCount} <span className="text-xs font-normal text-slate-500">Dapur/Gudang</span>
                        </span>
                    </div>
                </div>

                <div className="p-3.5 sm:p-4 col-span-2 sm:col-span-1 border-t sm:border-t-0">
                    <p className="text-[11px] sm:text-xs font-medium text-slate-500">Kuota Paket Cabang</p>
                    <div className="mt-1 flex items-baseline justify-between sm:justify-start gap-2">
                        <span className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
                            {branches.length}{' '}
                            <span className="text-xs font-normal text-slate-500">
                                / {maxBranches !== null && maxBranches !== undefined ? `${maxBranches} Cabang` : '∞'}
                            </span>
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {planName || 'Standar'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Desktop Table View (hidden md:block) */}
            <div className="hidden md:block rounded-lg border border-slate-200 bg-white shadow-2xs overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                            <th className="py-3 px-4">Nama &amp; Kode Cabang</th>
                            <th className="py-3 px-4">Tipe &amp; Kepemilikan</th>
                            <th className="py-3 px-4">Wilayah &amp; Alamat</th>
                            <th className="py-3 px-4">PIC &amp; Operasional</th>
                            <th className="py-3 px-4 text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {branches.map((branch, index) => {
                            const typeInfo = BRANCH_TYPE_CONFIG[branch.branch_type || 'outlet'] || BRANCH_TYPE_CONFIG.outlet
                            const parentName = branch.parent_branch_id ? branchMap.get(branch.parent_branch_id) : null
                            const opHours = parseOperatingHours(branch.operating_hours)
                            const isActive = activeBranchId === branch.id
                            const isPrimary = index === 0 || branch.code === 'PUSAT' || branch.name.toLowerCase().includes('cabang utama')

                            return (
                                <tr
                                    key={branch.id}
                                    className={`hover:bg-slate-50/80 transition ${isActive ? 'bg-emerald-50/20' : ''
                                        }`}
                                >
                                    <td className="py-3.5 px-4 align-top">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-slate-900 text-sm">
                                                {branch.name}
                                            </span>
                                            {isPrimary && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                                                    Cabang Utama (Induk)
                                                </span>
                                            )}
                                            {branch.code && (
                                                <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                                    {branch.code}
                                                </span>
                                            )}
                                        </div>
                                        {isActive && (
                                            <div className="mt-1">
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                                    Aktif di Navbar
                                                </span>
                                            </div>
                                        )}
                                        {parentName && (
                                            <p className="mt-1 text-[11px] text-slate-400">
                                                Induk: <span className="text-slate-600 font-medium">{parentName}</span>
                                            </p>
                                        )}
                                    </td>

                                    <td className="py-3.5 px-4 align-top">
                                        <div>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${typeInfo.badge}`}>
                                                    {typeInfo.label}
                                                </span>
                                                {(branch.status || 'active') === 'active' ? (
                                                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                        Aktif
                                                    </span>
                                                ) : (
                                                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                                        Nonaktif
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1 text-[11px] text-slate-500">
                                                {branch.ownership_status === 'rented' ? 'Sewa Tempat' : 'Milik Sendiri'}
                                            </p>
                                        </div>
                                    </td>

                                    <td className="py-3.5 px-4 align-top">
                                        <p className="font-medium text-slate-800">
                                            {branch.city || 'Wilayah Belum Diatur'}
                                        </p>
                                        <p className="mt-0.5 text-slate-500 text-[11px] line-clamp-1 max-w-xs">
                                            {branch.address || 'Alamat fisik belum diisi'}
                                        </p>
                                    </td>

                                    <td className="py-3.5 px-4 align-top">
                                        <p className="font-medium text-slate-800">
                                            {branch.manager_name ? `PIC: ${branch.manager_name}` : 'PIC Belum Ditentukan'}
                                        </p>
                                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                                            {branch.phone && <span>{branch.phone}</span>}
                                            {branch.phone && opHours && <span>•</span>}
                                            {opHours && <span>{opHours}</span>}
                                        </div>
                                    </td>

                                    <td className="py-3.5 px-4 align-top text-right">
                                        <div className="inline-flex items-center gap-1.5">
                                            {!isPrimary && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleStatus(branch)}
                                                    disabled={togglingId === branch.id}
                                                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${(branch.status || 'active') === 'active'
                                                            ? 'border-amber-200 bg-amber-50/50 text-amber-800 hover:bg-amber-100/60'
                                                            : 'border-emerald-200 bg-emerald-50/50 text-emerald-800 hover:bg-emerald-100/60'
                                                        }`}
                                                >
                                                    {togglingId === branch.id
                                                        ? '...'
                                                        : (branch.status || 'active') === 'active'
                                                            ? 'Nonaktifkan'
                                                            : 'Aktifkan'}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingBranch(branch)
                                                    setEditError(null)
                                                }}
                                                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(branch)}
                                                disabled={deletingId === branch.id || isPrimary || branches.length <= 1}
                                                title={isPrimary || branches.length <= 1 ? 'Cabang Utama tidak dapat dihapus' : undefined}
                                                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${isPrimary || branches.length <= 1
                                                        ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-50'
                                                        : 'border-rose-200 bg-white text-rose-600 hover:bg-rose-50 hover:border-rose-300 cursor-pointer'
                                                    }`}
                                            >
                                                {deletingId === branch.id ? '...' : 'Hapus'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}

                        {branches.length === 0 && (
                            <tr>
                                <td colSpan={5} className="py-12 text-center text-slate-500">
                                    <p className="font-medium text-slate-700">Belum ada cabang terdaftar</p>
                                    <p className="text-xs text-slate-400 mt-1">
                                        Mulai dengan menambahkan outlet toko fisik atau dapur pusat pertama Anda.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setIsAddModalOpen(true)}
                                        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline cursor-pointer"
                                    >
                                        + Tambah Cabang Sekarang
                                    </button>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Sheet View (md:hidden - Fluid, Zero Overflow) */}
            <div className="md:hidden divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                {branches.map((branch, index) => {
                    const typeInfo = BRANCH_TYPE_CONFIG[branch.branch_type || 'outlet'] || BRANCH_TYPE_CONFIG.outlet
                    const opHours = parseOperatingHours(branch.operating_hours)
                    const isActive = activeBranchId === branch.id
                    const isPrimary = index === 0 || branch.code === 'PUSAT' || branch.name.toLowerCase().includes('cabang utama')

                    return (
                        <div
                            key={branch.id}
                            className={`p-3.5 space-y-2.5 transition ${isActive ? 'bg-emerald-50/25' : ''
                                }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-semibold text-sm text-slate-900 truncate">
                                            {branch.name}
                                        </span>
                                        {isPrimary && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                                                Cabang Utama (Induk)
                                            </span>
                                        )}
                                        {branch.code && (
                                            <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                                                {branch.code}
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${typeInfo.badge}`}>
                                            {typeInfo.label}
                                        </span>
                                        {(branch.status || 'active') === 'active' ? (
                                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                Aktif
                                            </span>
                                        ) : (
                                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                                Nonaktif
                                            </span>
                                        )}
                                        {isActive && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                                Navbar Aktif
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                    {!isPrimary && (
                                        <button
                                            type="button"
                                            onClick={() => handleToggleStatus(branch)}
                                            disabled={togglingId === branch.id}
                                            className={`rounded-md border px-2 py-1 text-xs font-medium transition cursor-pointer ${(branch.status || 'active') === 'active'
                                                    ? 'border-amber-200 bg-amber-50/50 text-amber-800 hover:bg-amber-100/60'
                                                    : 'border-emerald-200 bg-emerald-50/50 text-emerald-800 hover:bg-emerald-100/60'
                                                }`}
                                        >
                                            {togglingId === branch.id
                                                ? '...'
                                                : (branch.status || 'active') === 'active'
                                                    ? 'Nonaktifkan'
                                                    : 'Aktifkan'}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingBranch(branch)
                                            setEditError(null)
                                        }}
                                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(branch)}
                                        disabled={deletingId === branch.id || isPrimary || branches.length <= 1}
                                        title={isPrimary || branches.length <= 1 ? 'Cabang Utama tidak dapat dihapus' : undefined}
                                        className={`rounded-md border px-2 py-1 text-xs font-medium transition ${isPrimary || branches.length <= 1
                                                ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-50'
                                                : 'border-rose-200 bg-white text-rose-600 hover:bg-rose-50 cursor-pointer'
                                            }`}
                                    >
                                        {deletingId === branch.id ? '...' : 'Hapus'}
                                    </button>
                                </div>
                            </div>

                            <div className="text-xs text-slate-500 space-y-1 pt-1.5 border-t border-slate-100">
                                <div className="flex items-center justify-between text-[11px]">
                                    <span className="text-slate-700 font-medium">
                                        {branch.city || 'Wilayah belum diatur'}
                                    </span>
                                    <span>
                                        {branch.ownership_status === 'rented' ? 'Sewa Tempat' : 'Milik Sendiri'}
                                    </span>
                                </div>
                                {branch.address && (
                                    <p className="text-[11px] text-slate-500 line-clamp-1">
                                        {branch.address}
                                    </p>
                                )}
                                <div className="flex items-center gap-2 text-[11px] text-slate-500 tabular-nums flex-wrap">
                                    {branch.manager_name && <span>PIC: {branch.manager_name}</span>}
                                    {branch.phone && <span>• {branch.phone}</span>}
                                    {opHours && <span>• {opHours}</span>}
                                </div>
                            </div>
                        </div>
                    )
                })}

                {branches.length === 0 && (
                    <div className="p-6 text-center text-slate-500">
                        <p className="font-medium text-slate-700 text-xs">Belum ada cabang terdaftar</p>
                        <button
                            type="button"
                            onClick={() => setIsAddModalOpen(true)}
                            className="mt-2 text-xs font-semibold text-emerald-800 hover:underline cursor-pointer"
                        >
                            + Tambah Cabang Sekarang
                        </button>
                    </div>
                )}
            </div>

            {/* Modal Tambah Cabang (On-Demand Dialog) */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px]">
                    <div className="w-full max-w-md sm:max-w-lg max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
                        {/* Header Tetap */}
                        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 text-sm">Tambah Cabang Baru</h3>
                                <p className="text-xs text-slate-500">Daftarkan outlet, dapur pusat, atau gudang pasokan.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                                aria-label="Tutup"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleAdd} className="flex-1 flex flex-col min-h-0">
                            {/* Body Scrollable */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                                {!allowed && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800">
                                        <p className="font-bold">Batas Kuota Cabang Tercapai</p>
                                        <p className="mt-0.5 leading-relaxed">{reason}</p>
                                        <Link
                                            href="/dashboard/subscription"
                                            className="mt-1.5 inline-block font-semibold text-emerald-800 hover:underline"
                                        >
                                            Upgrade paket langganan sekarang →
                                        </Link>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Kode Cabang
                                    </label>
                                    <input
                                        type="text"
                                        name="code"
                                        disabled={!allowed || addLoading}
                                        placeholder="CAB-01"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 disabled:bg-slate-100 transition"
                                    />
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Nama Cabang <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        name="name"
                                        required
                                        disabled={!allowed || addLoading}
                                        placeholder="Contoh: Outlet Tebet / Dapur Sentral"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 disabled:bg-slate-100 transition font-medium"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Tipe Cabang
                                    </label>
                                    <select
                                        name="branch_type"
                                        disabled={!allowed || addLoading}
                                        defaultValue="outlet"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 disabled:bg-slate-100 transition cursor-pointer"
                                    >
                                        <option value="outlet">Outlet Toko (POS)</option>
                                        <option value="central_kitchen">Dapur Pusat</option>
                                        <option value="warehouse">Gudang Pasokan</option>
                                        <option value="hub">Hub Distribusi</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Kota / Wilayah
                                    </label>
                                    <input
                                        type="text"
                                        name="city"
                                        disabled={!allowed || addLoading}
                                        placeholder="Jakarta Selatan"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 disabled:bg-slate-100 transition"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Penanggung Jawab (PIC)
                                    </label>
                                    <input
                                        type="text"
                                        name="manager_name"
                                        disabled={!allowed || addLoading}
                                        placeholder="Nama Manajer Cabang"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 disabled:bg-slate-100 transition"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Status Kepemilikan
                                    </label>
                                    <select
                                        name="ownership_status"
                                        disabled={!allowed || addLoading}
                                        defaultValue="owned"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 disabled:bg-slate-100 transition cursor-pointer"
                                    >
                                        <option value="owned">Milik Sendiri</option>
                                        <option value="rented">Sewa Tempat</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Jam Operasional
                                    </label>
                                    <input
                                        type="text"
                                        name="operating_hours"
                                        disabled={!allowed || addLoading}
                                        placeholder="08:00 - 22:00 WIB"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 disabled:bg-slate-100 transition"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Cabang Induk (Opsional)
                                    </label>
                                    <select
                                        name="parent_branch_id"
                                        disabled={!allowed || addLoading}
                                        defaultValue=""
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 disabled:bg-slate-100 transition cursor-pointer"
                                    >
                                        <option value="">-- Tanpa Induk (Pusat) --</option>
                                        {branches.map((b) => (
                                            <option key={b.id} value={b.id}>
                                                {b.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Alamat Lengkap
                                    </label>
                                    <input
                                        type="text"
                                        name="address"
                                        disabled={!allowed || addLoading}
                                        placeholder="Jl. Kemang Raya No. 10"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 disabled:bg-slate-100 transition"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        No. Telepon / WA Cabang
                                    </label>
                                    <input
                                        type="text"
                                        name="phone"
                                        disabled={!allowed || addLoading}
                                        placeholder="081298765432"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 disabled:bg-slate-100 font-mono transition"
                                    />
                                </div>
                            </div>

                            {addError && (
                                <p className="text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-lg">
                                    {addError}
                                </p>
                            )}

                            </div>

                            {/* Footer Tetap */}
                            <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={!allowed || addLoading}
                                    className="rounded-lg bg-emerald-800 hover:bg-emerald-900 px-4 py-1.5 text-xs font-bold text-white shadow-2xs transition disabled:bg-slate-300 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    {addLoading ? 'Menyimpan...' : 'Simpan Cabang'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Edit Cabang */}
            {editingBranch && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px]">
                    <div className="w-full max-w-md sm:max-w-lg max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
                        {/* Header Tetap */}
                        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 text-sm">
                                    Edit Cabang: {editingBranch.name}
                                </h3>
                                <p className="text-xs text-slate-500">Perbarui informasi cabang dan operasional.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingBranch(null)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                                aria-label="Tutup"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleEdit} className="flex-1 flex flex-col min-h-0">
                            {/* Body Scrollable */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Kode Cabang
                                    </label>
                                    <input
                                        type="text"
                                        name="code"
                                        defaultValue={editingBranch.code || ''}
                                        placeholder="CAB-01"
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700"
                                    />
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Nama Cabang <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        name="name"
                                        required
                                        defaultValue={editingBranch.name}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 font-medium"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Tipe Cabang
                                    </label>
                                    <select
                                        name="branch_type"
                                        defaultValue={editingBranch.branch_type || 'outlet'}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 cursor-pointer"
                                    >
                                        <option value="outlet">Outlet Toko (POS)</option>
                                        <option value="central_kitchen">Dapur Pusat</option>
                                        <option value="warehouse">Gudang Pasokan</option>
                                        <option value="hub">Hub Distribusi</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Kota / Wilayah
                                    </label>
                                    <input
                                        type="text"
                                        name="city"
                                        defaultValue={editingBranch.city || ''}
                                        placeholder="Jakarta Selatan"
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Penanggung Jawab (PIC)
                                    </label>
                                    <input
                                        type="text"
                                        name="manager_name"
                                        defaultValue={editingBranch.manager_name || ''}
                                        placeholder="Nama PIC"
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Status Operasional
                                    </label>
                                    <select
                                        name="status"
                                        defaultValue={editingBranch.status || 'active'}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 cursor-pointer"
                                    >
                                        <option value="active">Aktif</option>
                                        <option value="inactive">Nonaktif</option>
                                        <option value="closed">Tutup Permanen</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Status Kepemilikan
                                    </label>
                                    <select
                                        name="ownership_status"
                                        defaultValue={editingBranch.ownership_status || 'owned'}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 cursor-pointer"
                                    >
                                        <option value="owned">Milik Sendiri</option>
                                        <option value="rented">Sewa Tempat</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Cabang Induk
                                    </label>
                                    <select
                                        name="parent_branch_id"
                                        defaultValue={editingBranch.parent_branch_id || ''}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 cursor-pointer"
                                    >
                                        <option value="">-- Tanpa Induk --</option>
                                        {branches
                                            .filter((b) => b.id !== editingBranch.id)
                                            .map((b) => (
                                                <option key={b.id} value={b.id}>
                                                    {b.name}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                    Jam Operasional
                                </label>
                                <input
                                    type="text"
                                    name="operating_hours"
                                    defaultValue={parseOperatingHours(editingBranch.operating_hours)}
                                    placeholder="08:00 - 22:00 WIB"
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        Alamat Lengkap
                                    </label>
                                    <input
                                        type="text"
                                        name="address"
                                        defaultValue={editingBranch.address || ''}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">
                                        No. Telepon / WA Cabang
                                    </label>
                                    <input
                                        type="text"
                                        name="phone"
                                        defaultValue={editingBranch.phone || ''}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 font-mono"
                                    />
                                </div>
                            </div>

                            {editError && (
                                <p className="text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-lg">
                                    {editError}
                                </p>
                            )}

                            </div>

                            {/* Footer Tetap */}
                            <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingBranch(null)}
                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={editLoading}
                                    className="rounded-lg bg-emerald-800 hover:bg-emerald-900 px-4 py-1.5 text-xs font-bold text-white shadow-2xs transition disabled:opacity-50 cursor-pointer"
                                >
                                    {editLoading ? 'Menyimpan...' : 'Simpan Perubahan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
