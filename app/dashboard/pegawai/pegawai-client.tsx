'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addEmployee, updatePegawai, removeEmployee, toggleEmployeeStatus } from './actions'

export interface EmployeeProfile {
    id: string
    full_name: string | null
    email: string
    role: string | null
    branch_id: string | null
    is_active?: boolean | null
    branches: { id?: string; name: string; status?: string | null } | null
    created_at?: string
}

export interface BranchItem {
    id: string
    name: string
    status?: string | null
}

interface PegawaiClientProps {
    employees: EmployeeProfile[]
    branches: BranchItem[]
    planName: string
    maxEmployees: number | null
    allowed: boolean
    limitReason?: string
    activeBranchId: string
    activeBranchName: string
}

export default function PegawaiClient({
    employees,
    branches,
    planName,
    maxEmployees,
    allowed,
    limitReason,
    activeBranchId,
    activeBranchName,
}: PegawaiClientProps) {
    const router = useRouter()
    const [submittingAdd, setSubmittingAdd] = useState(false)
    const [submittingEdit, setSubmittingEdit] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [togglingId, setTogglingId] = useState<string | null>(null)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)

    // Modals
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [editingEmployee, setEditingEmployee] = useState<EmployeeProfile | null>(null)

    // Peta cabang yang sudah ditempati pegawai aktif
    const occupiedBranchMap = new Map<string, { employeeId: string; name: string }>()
    employees.forEach((emp) => {
        if (emp.branch_id && emp.is_active !== false) {
            occupiedBranchMap.set(emp.branch_id, {
                employeeId: emp.id,
                name: emp.full_name || 'Kasir',
            })
        }
    })

    const activeEmployeesCount = employees.filter((e) => e.is_active !== false).length
    const availableBranches = branches.filter((b) => !occupiedBranchMap.has(b.id) && (b.status || 'active') === 'active')
    const isQuotaFull = !allowed || (maxEmployees !== null && activeEmployeesCount >= maxEmployees)
    const noAvailableBranches = availableBranches.length === 0

    const handleToggleStatus = async (emp: EmployeeProfile, targetActive: boolean) => {
        if (togglingId) return

        if (targetActive) {
            const limit = maxEmployees ?? 1
            if (activeEmployeesCount >= limit) {
                alert(`Batas kuota pegawai aktif paket Anda (${limit} pegawai) sudah penuh. Upgrade paket langganan atau nonaktifkan pegawai lain terlebih dahulu.`)
                return
            }
            if (!emp.branch_id) {
                alert('Pegawai belum memiliki cabang penugasan. Edit pegawai untuk memilih cabang terlebih dahulu.')
                return
            }
            if (emp.branches?.status && emp.branches.status !== 'active') {
                alert(`Cabang penugasan (${emp.branches?.name || 'Cabang'}) sedang nonaktif. Aktifkan cabang terlebih dahulu di menu Cabang.`)
                return
            }
        } else {
            const confirmed = window.confirm(`Nonaktifkan akun pegawai "${emp.full_name || emp.email}"?\nPegawai ini tidak akan dapat login atau membuka dashboard kasir.`)
            if (!confirmed) return
        }

        setTogglingId(emp.id)
        setErrorMsg(null)
        setSuccessMsg(null)
        try {
            const res = await toggleEmployeeStatus(emp.id, targetActive)
            if (res?.error) {
                setErrorMsg(res.error)
            } else {
                setSuccessMsg(`Status akun pegawai berhasil diubah menjadi ${targetActive ? 'Aktif' : 'Nonaktif'}.`)
                router.refresh()
            }
        } catch (err: unknown) {
            setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah status pegawai.')
        } finally {
            setTogglingId(null)
        }
    }

    // Filter daftar pegawai sesuai cabang aktif dari Top Navbar
    const displayedEmployees = activeBranchId === 'all'
        ? employees
        : employees.filter((e) => e.branch_id === activeBranchId)

    // Cabang default untuk form tambah (jika cabang aktif belum terisi)
    const defaultBranchForAdd =
        activeBranchId !== 'all' && !occupiedBranchMap.has(activeBranchId)
            ? activeBranchId
            : (availableBranches[0]?.id || '')

    const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setErrorMsg(null)
        setSuccessMsg(null)
        setSubmittingAdd(true)

        const formData = new FormData(e.currentTarget)
        const branchId = String(formData.get('branch_id') ?? '')

        const occupied = occupiedBranchMap.get(branchId)
        if (occupied) {
            setErrorMsg(`Cabang ini sudah memiliki akun pegawai (${occupied.name}). Setiap cabang hanya dapat memiliki 1 akun pegawai.`)
            setSubmittingAdd(false)
            return
        }

        try {
            const res = await addEmployee(formData)
            if (res?.error) {
                setErrorMsg(res.error)
            } else {
                setSuccessMsg('Akun pegawai kasir berhasil ditambahkan!')
                setIsAddModalOpen(false)
                router.refresh()
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.'
            setErrorMsg(message)
        } finally {
            setSubmittingAdd(false)
        }
    }

    const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setErrorMsg(null)
        setSuccessMsg(null)
        setSubmittingEdit(true)

        const formData = new FormData(e.currentTarget)
        const targetBranchId = String(formData.get('branch_id') ?? '')
        const currentBranchId = editingEmployee?.branch_id

        if (targetBranchId !== currentBranchId) {
            const occupied = occupiedBranchMap.get(targetBranchId)
            if (occupied && occupied.employeeId !== editingEmployee?.id) {
                setErrorMsg(`Cabang tujuan sudah memiliki akun pegawai (${occupied.name}). Setiap cabang hanya dapat memiliki 1 akun pegawai.`)
                setSubmittingEdit(false)
                return
            }
        }

        try {
            const res = await updatePegawai(formData)
            if (res?.error) {
                setErrorMsg(res.error)
            } else {
                setSuccessMsg('Data pegawai berhasil diperbarui!')
                setEditingEmployee(null)
                router.refresh()
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Terjadi kesalahan sistem saat memperbarui data pegawai.'
            setErrorMsg(message)
        } finally {
            setSubmittingEdit(false)
        }
    }

    const handleDelete = async (emp: EmployeeProfile) => {
        if (!confirm(`Yakin ingin menghapus akun pegawai "${emp.full_name || 'ini'}" (${emp.email})? Tindakan ini tidak dapat dibatalkan.`)) {
            return
        }

        setErrorMsg(null)
        setSuccessMsg(null)
        setDeletingId(emp.id)

        try {
            const res = await removeEmployee(emp.id)
            if (res?.error) {
                setErrorMsg(res.error)
            } else {
                setSuccessMsg(`Akun pegawai "${emp.full_name || 'Kasir'}" berhasil dihapus.`)
                router.refresh()
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Gagal menghapus akun pegawai.'
            setErrorMsg(message)
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <div className="space-y-6">
            {/* 1. STAT STRIP HORIZONTAL (Clean Sheet, Zero Slop) */}
            <div className="rounded-lg border border-slate-200 bg-white shadow-2xs overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
                    <div className="p-4 sm:p-5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Total Pegawai
                        </span>
                        <div className="mt-1 flex items-baseline gap-1.5">
                            <span className="text-2xl font-bold text-slate-900 tabular-nums">
                                {employees.length}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">orang terdaftar</span>
                        </div>
                        <span className="mt-1 text-[11px] text-slate-400 block truncate">
                            Seluruh cabang bisnis
                        </span>
                    </div>

                    <div className="p-4 sm:p-5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Pegawai Cabang Aktif
                        </span>
                        <div className="mt-1 flex items-baseline gap-1.5">
                            <span className="text-2xl font-bold text-emerald-800 tabular-nums">
                                {displayedEmployees.length}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">kasir aktif</span>
                        </div>
                        <span className="mt-1 text-[11px] text-slate-500 font-medium block truncate">
                            Cabang: {activeBranchName}
                        </span>
                    </div>

                    <div className="p-4 sm:p-5">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                                Kuota Paket
                            </span>
                            <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200/60 uppercase">
                                {planName}
                            </span>
                        </div>
                        <div className="mt-1 flex items-baseline gap-1.5">
                            <span className={`text-2xl font-bold tabular-nums ${isQuotaFull ? 'text-amber-700' : 'text-slate-900'}`}>
                                {activeEmployeesCount} / {maxEmployees !== null ? maxEmployees : '∞'}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">kasir aktif</span>
                        </div>
                        <span className="mt-1 text-[11px] text-slate-400 block flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${isQuotaFull ? 'bg-amber-500' : 'bg-emerald-600'}`} />
                            <span>1 cabang = 1 akun pegawai kasir</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Alert Error / Sukses */}
            {errorMsg && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 flex items-start justify-between gap-3 shadow-2xs">
                    <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="leading-relaxed">{errorMsg}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setErrorMsg(null)}
                        className="text-rose-500 hover:text-rose-700 text-xs font-bold cursor-pointer"
                    >
                        ✕
                    </button>
                </div>
            )}
            {successMsg && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-800 flex items-start justify-between gap-3 shadow-2xs">
                    <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="leading-relaxed">{successMsg}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSuccessMsg(null)}
                        className="text-emerald-600 hover:text-emerald-800 text-xs font-bold cursor-pointer"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Banner Informasi Batas Kuota jika penuh */}
            {isQuotaFull && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 leading-relaxed shadow-2xs flex items-start gap-2.5">
                    <span className="text-amber-600 font-bold text-sm">ℹ️</span>
                    <div>
                        {limitReason || `Kuota pegawai untuk paket Anda sudah penuh (maksimal ${maxEmployees} pegawai).`}{' '}
                        <a href="/dashboard/subscription" className="underline font-bold text-amber-950 hover:text-black">
                            Upgrade paket langganan
                        </a>{' '}
                        untuk menambah kuota cabang dan kasir.
                    </div>
                </div>
            )}

            {/* 2. HEADER DAFTAR & TOMBOL TAMBAH PEGAWAI */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-slate-900">
                            Daftar Pegawai Kasir
                        </h2>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 border border-slate-200">
                            {displayedEmployees.length} akun
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                        {activeBranchId !== 'all'
                            ? `Menampilkan pegawai kasir khusus Cabang: ${activeBranchName}`
                            : 'Menampilkan seluruh pegawai kasir dari semua cabang'}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setErrorMsg(null)
                            setSuccessMsg(null)
                            setIsAddModalOpen(true)
                        }}
                        disabled={isQuotaFull || noAvailableBranches}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-900 active:bg-emerald-950 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                        <span>+ Tambah Pegawai</span>
                    </button>
                </div>
            </div>

            {/* 3. TABEL DATA SHEET BERSIH (Desktop & Tablet) */}
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-2xs">
                {/* Desktop View */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3">Nama Lengkap</th>
                                <th className="px-4 py-3">Email Login Kasir</th>
                                <th className="px-4 py-3">Cabang Penugasan</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Peran</th>
                                <th className="px-4 py-3 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {displayedEmployees.map((emp) => (
                                <tr key={emp.id} className="hover:bg-slate-50/70 transition">
                                    {/* Nama Pegawai */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full shrink-0 ${emp.is_active !== false ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                                            <span className="font-semibold text-slate-900 text-xs">
                                                {emp.full_name || 'Tanpa Nama'}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Email Login (Wajib terlihat jelas) */}
                                    <td className="px-4 py-3">
                                        <span className="font-mono text-xs text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 inline-block">
                                            {emp.email}
                                        </span>
                                    </td>

                                    {/* Cabang Penugasan */}
                                    <td className="px-4 py-3 text-slate-700 font-medium">
                                        {emp.branches?.name ? (
                                            <span className="inline-flex items-center gap-1.5">
                                                <span>{emp.branches.name}</span>
                                                {emp.branches.status && emp.branches.status !== 'active' && (
                                                    <span className="text-[10px] text-rose-600 font-normal">
                                                        (Cabang Nonaktif)
                                                    </span>
                                                )}
                                            </span>
                                        ) : (
                                            <span className="text-amber-600 font-normal italic">
                                                Belum ditugaskan
                                            </span>
                                        )}
                                    </td>

                                    {/* Status Akun */}
                                    <td className="px-4 py-3">
                                        {emp.is_active !== false ? (
                                            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                                Aktif
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200">
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                                Nonaktif
                                            </span>
                                        )}
                                    </td>

                                    {/* Peran */}
                                    <td className="px-4 py-3">
                                        <span className="inline-flex items-center rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                                            Kasir / Pegawai
                                        </span>
                                    </td>

                                    {/* Aksi: Toggle Status, Edit & Hapus */}
                                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                                        <button
                                            type="button"
                                            onClick={() => handleToggleStatus(emp, emp.is_active === false)}
                                            disabled={togglingId === emp.id}
                                            className={`rounded px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                                                emp.is_active !== false
                                                    ? 'text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100'
                                                    : 'text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                                            }`}
                                        >
                                            {togglingId === emp.id
                                                ? '...'
                                                : emp.is_active !== false
                                                ? 'Nonaktifkan'
                                                : 'Aktifkan'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setErrorMsg(null)
                                                setSuccessMsg(null)
                                                setEditingEmployee(emp)
                                            }}
                                            className="rounded px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(emp)}
                                            disabled={deletingId === emp.id}
                                            className="rounded px-2.5 py-1 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 disabled:opacity-50 transition cursor-pointer"
                                        >
                                            {deletingId === emp.id ? 'Menghapus...' : 'Hapus'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile View (2 Kolom Ringkas, Zero-Icon Slop) */}
                <div className="md:hidden divide-y divide-slate-100">
                    {displayedEmployees.map((emp) => (
                        <div key={emp.id} className="p-3.5 flex items-start justify-between gap-3">
                            {/* Kolom Kiri: Nama, Email, Cabang, Status */}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${emp.is_active !== false ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                                    <span className="font-semibold text-xs text-slate-900 truncate">
                                        {emp.full_name || 'Tanpa Nama'}
                                    </span>
                                    {emp.is_active !== false ? (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase shrink-0">
                                            Aktif
                                        </span>
                                    ) : (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase shrink-0">
                                            Nonaktif
                                        </span>
                                    )}
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-50 text-slate-600 border border-slate-200 uppercase shrink-0">
                                        Kasir
                                    </span>
                                </div>

                                <div className="mt-1 font-mono text-[11px] text-slate-600 truncate">
                                    {emp.email}
                                </div>

                                <div className="mt-1 text-[11px] text-slate-500 font-medium truncate">
                                    Cabang: <span className="text-slate-800 font-semibold">{emp.branches?.name || 'Belum ada cabang'}</span>
                                    {emp.branches?.status && emp.branches.status !== 'active' && (
                                        <span className="ml-1 text-[10px] text-rose-600 font-normal">
                                            (Nonaktif)
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Kolom Kanan: Tombol Toggle, Edit & Hapus */}
                            <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                                <button
                                    type="button"
                                    onClick={() => handleToggleStatus(emp, emp.is_active === false)}
                                    disabled={togglingId === emp.id}
                                    className={`rounded px-2 py-1 text-[11px] font-semibold transition cursor-pointer ${
                                        emp.is_active !== false
                                            ? 'text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100'
                                            : 'text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                                    }`}
                                >
                                    {togglingId === emp.id ? '...' : emp.is_active !== false ? 'Nonaktif' : 'Aktifkan'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setErrorMsg(null)
                                        setSuccessMsg(null)
                                        setEditingEmployee(emp)
                                    }}
                                    className="rounded px-2 py-1 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
                                >
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDelete(emp)}
                                    disabled={deletingId === emp.id}
                                    className="rounded px-2 py-1 text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 disabled:opacity-50 transition cursor-pointer"
                                >
                                    {deletingId === emp.id ? '...' : 'Hapus'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Empty State */}
                {displayedEmployees.length === 0 && (
                    <div className="p-10 text-center text-xs text-slate-500 space-y-2">
                        <p className="font-semibold text-slate-800 text-sm">
                            Belum ada akun pegawai
                        </p>
                        <p className="text-slate-500 max-w-sm mx-auto">
                            {activeBranchId !== 'all'
                                ? `Belum ada pegawai kasir yang ditugaskan di Cabang "${activeBranchName}".`
                                : 'Belum ada akun pegawai kasir yang terdaftar di bisnis Anda.'}
                        </p>
                        {!isQuotaFull && !noAvailableBranches && (
                            <button
                                type="button"
                                onClick={() => {
                                    setErrorMsg(null)
                                    setSuccessMsg(null)
                                    setIsAddModalOpen(true)
                                }}
                                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-900 transition cursor-pointer"
                            >
                                + Tambah Pegawai Sekarang
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* 4. MODAL ON-DEMAND: TAMBAH AKUN PEGAWAI */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px]">
                    <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
                        {/* Header Tetap */}
                        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900">
                                    Tambah Akun Pegawai
                                </h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    Daftarkan akun kasir baru untuk cabang yang tersedia
                                </p>
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
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Nama Lengkap Pegawai
                                    </label>
                                    <input
                                        type="text"
                                        name="full_name"
                                        required
                                        placeholder="Contoh: Kasir Cabang Kemang"
                                        disabled={submittingAdd}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none transition"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Email Login Kasir
                                    </label>
                                    <input
                                        type="email"
                                        name="email"
                                        required
                                        placeholder="kasir.kemang@dimsum.com"
                                        disabled={submittingAdd}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none transition"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Password Login (Min. 6 Karakter)
                                    </label>
                                    <input
                                        type="password"
                                        name="password"
                                        required
                                        minLength={6}
                                        placeholder="••••••••"
                                        disabled={submittingAdd}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none transition"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Penugasan Cabang
                                    </label>
                                    <select
                                        name="branch_id"
                                        required
                                        defaultValue={defaultBranchForAdd}
                                        disabled={submittingAdd}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-emerald-600 focus:outline-none transition"
                                    >
                                        <option value="" disabled>-- Pilih Cabang --</option>
                                        {branches.map((b) => {
                                            const occupied = occupiedBranchMap.get(b.id)
                                            const isBranchInactive = Boolean(b.status && b.status !== 'active')
                                            return (
                                                <option key={b.id} value={b.id} disabled={Boolean(occupied || isBranchInactive)}>
                                                    {b.name} {isBranchInactive ? '(Cabang Nonaktif)' : occupied ? `(Sudah ada: ${occupied.name})` : '— Tersedia'}
                                                </option>
                                            )
                                        })}
                                    </select>
                                    <p className="text-[10px] text-slate-500 mt-1">
                                        Aturan sistem: 1 cabang = 1 akun kasir.
                                    </p>
                                </div>
                            </div>

                            {/* Footer Tetap */}
                            <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    disabled={submittingAdd}
                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={submittingAdd}
                                    className="rounded-lg bg-emerald-800 px-4 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-900 disabled:opacity-50 transition cursor-pointer"
                                >
                                    {submittingAdd ? 'Menyimpan...' : 'Simpan Akun Pegawai'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 5. MODAL ON-DEMAND: EDIT DATA PEGAWAI */}
            {editingEmployee && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px]">
                    <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
                        {/* Header Tetap */}
                        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900">
                                    Edit Akun Pegawai
                                </h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    Ubah nama, pindahkan cabang, atau atur ulang password
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingEmployee(null)}
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
                                <input type="hidden" name="profile_id" value={editingEmployee.id} />

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Nama Lengkap Pegawai
                                    </label>
                                    <input
                                        type="text"
                                        name="full_name"
                                        required
                                        defaultValue={editingEmployee.full_name || ''}
                                        disabled={submittingEdit}
                                        placeholder="Contoh: Kasir Cabang Kemang"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none transition"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Email Login Kasir
                                    </label>
                                    <input
                                        type="email"
                                        disabled
                                        value={editingEmployee.email}
                                        className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs text-slate-500 font-mono cursor-not-allowed"
                                    />
                                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                                        Email login tidak dapat diubah (digunakan untuk identitas akun).
                                    </span>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Pindahkan Cabang Penugasan
                                    </label>
                                    <select
                                        name="branch_id"
                                        required
                                        defaultValue={editingEmployee.branch_id || ''}
                                        disabled={submittingEdit}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-emerald-600 focus:outline-none transition"
                                    >
                                        <option value="" disabled>-- Pilih Cabang --</option>
                                        {branches.map((b) => {
                                            const occupied = occupiedBranchMap.get(b.id)
                                            const isCurrentEmployeeBranch = occupied?.employeeId === editingEmployee.id
                                            const isOccupiedByOther = Boolean(occupied && !isCurrentEmployeeBranch)
                                            const isBranchInactive = Boolean(b.status && b.status !== 'active')

                                            return (
                                                <option key={b.id} value={b.id} disabled={Boolean(isOccupiedByOther || (isBranchInactive && !isCurrentEmployeeBranch))}>
                                                    {b.name} {isBranchInactive ? '(Cabang Nonaktif)' : isCurrentEmployeeBranch ? '(Cabang Saat Ini)' : isOccupiedByOther ? `(Sudah ada: ${occupied?.name})` : '— Tersedia'}
                                                </option>
                                            )
                                        })}
                                    </select>
                                    <p className="text-[10px] text-slate-500 mt-1">
                                        Pilih cabang yang masih tersedia jika ingin merotasi kasir ini ke cabang lain.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Reset Password Baru (Opsional)
                                    </label>
                                    <input
                                        type="password"
                                        name="new_password"
                                        minLength={6}
                                        placeholder="Kosongkan jika tidak ingin ganti password"
                                        disabled={submittingEdit}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none transition"
                                    />
                                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                                        Isi minimal 6 karakter hanya jika kasir lupa password atau ingin diganti baru.
                                    </span>
                                </div>
                            </div>

                            {/* Footer Tetap */}
                            <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingEmployee(null)}
                                    disabled={submittingEdit}
                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={submittingEdit}
                                    className="rounded-lg bg-emerald-800 px-4 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-900 disabled:opacity-50 transition cursor-pointer"
                                >
                                    {submittingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
