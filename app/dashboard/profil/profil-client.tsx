'use client'

import { useState } from 'react'
import {
    updateOwnerName,
    updateBusinessName,
    changeOwnPassword,
    changeEmployeePassword,
} from './actions'

interface Employee {
    id: string
    full_name: string
    branch_name: string | null
}

interface Props {
    userId: string
    email: string
    fullName: string
    businessName: string
    subscriptionStatus?: string
    trialEndsAt?: string | null
    isGoogleUser: boolean
    hasPasswordSet: boolean
    isNewUser: boolean
    employees: Employee[]
}

// ─── Komponen form generik ────────────────────────────────────────────────────
function ActionForm({
    action,
    title,
    subtitle,
    children,
    submitLabel,
    successMsg = 'Berhasil disimpan.',
    highlight,
}: {
    action: (fd: FormData) => Promise<{ success?: boolean; error?: string }>
    title: string
    subtitle?: string
    children: React.ReactNode
    submitLabel: string
    successMsg?: string
    highlight?: boolean
}) {
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setLoading(true)
        setMsg(null)
        const fd = new FormData(e.currentTarget)
        const result = await action(fd)
        setLoading(false)
        if (result.error) setMsg({ type: 'err', text: result.error })
        else setMsg({ type: 'ok', text: successMsg })
    }

    return (
        <div
            className={`rounded-2xl border p-6 shadow-sm ${
                highlight
                    ? 'border-orange-300 bg-orange-50 ring-2 ring-orange-200'
                    : 'border-gray-200 bg-white'
            }`}
        >
            <h2 className="mb-0.5 text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="mb-4 text-xs text-gray-500">{subtitle}</p>}
            {!subtitle && <div className="mb-4" />}
            <form onSubmit={handleSubmit} className="space-y-4">
                {children}
                {msg && (
                    <p
                        className={`text-xs font-semibold ${
                            msg.type === 'ok' ? 'text-green-600' : 'text-red-600'
                        }`}
                    >
                        {msg.type === 'ok' ? '✓ ' : '✗ '}
                        {msg.text}
                    </p>
                )}
                <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-gray-800 transition active:scale-[0.99] disabled:opacity-50"
                >
                    {loading ? 'Menyimpan...' : submitLabel}
                </button>
            </form>
        </div>
    )
}

// ─── Input standar ────────────────────────────────────────────────────────────
function Field({
    label,
    name,
    type = 'text',
    defaultValue,
    placeholder,
    minLength,
    readOnly,
}: {
    label: string
    name: string
    type?: string
    defaultValue?: string
    placeholder?: string
    minLength?: number
    readOnly?: boolean
}) {
    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
            <input
                type={type}
                name={name}
                defaultValue={defaultValue}
                placeholder={placeholder}
                minLength={minLength}
                readOnly={readOnly}
                required={!readOnly}
                className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black ${
                    readOnly
                        ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
                        : 'border-gray-300 bg-white'
                }`}
            />
        </div>
    )
}

// ─── Komponen utama ───────────────────────────────────────────────────────────
export default function ProfilClient({
    email,
    fullName,
    businessName,
    subscriptionStatus = 'trial',
    trialEndsAt,
    isGoogleUser,
    hasPasswordSet,
    isNewUser,
    employees,
}: Props) {
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)

    let daysRemaining = 0
    let isExpired = false
    let formattedEndDate = '-'

    if (trialEndsAt) {
        const endDate = new Date(trialEndsAt)
        const msLeft = endDate.getTime() - Date.now()
        daysRemaining = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
        isExpired = subscriptionStatus === 'expired' || msLeft <= 0
        formattedEndDate = new Intl.DateTimeFormat('id-ID', {
            dateStyle: 'full',
            timeStyle: 'short',
        }).format(endDate)
    }

    return (
        <div className="mx-auto max-w-lg space-y-6 px-4 py-8 sm:py-12">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Profil & Pengaturan</h1>
                <p className="mt-1 text-sm text-gray-500">Kelola informasi akun dan bisnis Anda.</p>
            </div>

            {/* ── Banner untuk user baru Google ── */}
            {isNewUser && (
                <div className="flex items-start gap-3 rounded-2xl border border-orange-300 bg-orange-50 p-4">
                    <span className="text-xl">👋</span>
                    <div>
                        <p className="text-sm font-semibold text-orange-800">Selamat datang di Rekapin!</p>
                        <p className="mt-0.5 text-xs text-orange-700">
                            Lengkapi nama bisnis Anda di bawah sebelum mulai menggunakan aplikasi.
                        </p>
                    </div>
                </div>
            )}

            {/* ── Status Paket & Masa Percobaan (Trial 7 Hari) ── */}
            <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-slate-900">Paket & Masa Percobaan</h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                            Status aktif akun dan hak akses fitur bisnis Anda.
                        </p>
                    </div>
                    <span
                        className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
                            isExpired
                                ? 'bg-red-100 text-red-700 border border-red-200'
                                : 'bg-blue-100 text-blue-700 border border-blue-200'
                        }`}
                    >
                        {isExpired ? 'Trial Berakhir' : 'Trial 7 Hari Aktif'}
                    </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 border border-slate-100">
                    <div>
                        <span className="text-[11px] font-medium text-slate-400">Paket Layanan</span>
                        <p className="mt-0.5 text-sm font-bold text-slate-800">Free Trial 7 Hari</p>
                    </div>
                    <div>
                        <span className="text-[11px] font-medium text-slate-400">Sisa Waktu</span>
                        <p className={`mt-0.5 text-sm font-bold ${isExpired ? 'text-red-600' : 'text-blue-600'}`}>
                            {isExpired ? '0 hari (Kedaluwarsa)' : `${daysRemaining} hari lagi`}
                        </p>
                    </div>
                    <div className="col-span-2 border-t border-slate-200/60 pt-3">
                        <span className="text-[11px] font-medium text-slate-400">Berlaku Sampai</span>
                        <p className="mt-0.5 text-xs font-semibold text-slate-700">
                            {formattedEndDate}
                        </p>
                    </div>
                </div>

                <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                    ✨ Selama masa trial 7 hari, Anda dapat menikmati akses penuh ke semua fitur kasir multi-cabang, laporan laba rugi, HPP otomatis, dan ekspor laporan.
                </p>
            </div>

            {/* ── Info Akun (email read-only) ── */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-base font-semibold text-gray-900">Informasi Akun</h2>
                <Field label="Email Login" name="email" type="email" defaultValue={email} readOnly />
                {isGoogleUser && (
                    <p className="mt-2 text-xs text-gray-500">
                        🔗 Login menggunakan Google. Kamu tetap bisa set kata sandi di bawah.
                    </p>
                )}
            </div>

            {/* ── Edit Nama Owner ── */}
            <ActionForm
                action={updateOwnerName}
                title="Nama Pemilik"
                submitLabel="Simpan Nama"
                successMsg="Nama berhasil diperbarui."
            >
                <Field
                    label="Nama Lengkap"
                    name="full_name"
                    defaultValue={fullName}
                    placeholder="Nama lengkap Anda"
                />
            </ActionForm>

            {/* ── Edit Nama Bisnis (highlight jika user baru) ── */}
            <ActionForm
                action={updateBusinessName}
                title="Nama Bisnis"
                subtitle={isNewUser ? '⚠️ Belum diisi — silakan isi nama bisnis Anda.' : undefined}
                submitLabel="Simpan Nama Bisnis"
                successMsg="Nama bisnis berhasil diperbarui."
                highlight={isNewUser}
            >
                <Field
                    label="Nama Bisnis / Brand"
                    name="business_name"
                    defaultValue={isNewUser ? '' : businessName}
                    placeholder="Contoh: Dimsum Mentai"
                />
            </ActionForm>

            {/* ── Ganti / Set Password ── */}
            <ActionForm
                action={changeOwnPassword}
                title={isGoogleUser && !hasPasswordSet ? 'Set Kata Sandi' : 'Ganti Kata Sandi'}
                subtitle={
                    isGoogleUser && !hasPasswordSet
                        ? 'Tambahkan kata sandi agar bisa login dengan email & password selain Google.'
                        : undefined
                }
                submitLabel={isGoogleUser && !hasPasswordSet ? 'Set Kata Sandi' : 'Ganti Kata Sandi'}
                successMsg={
                    isGoogleUser && !hasPasswordSet
                        ? 'Kata sandi berhasil diset! Sekarang kamu bisa login dengan email & password.'
                        : 'Kata sandi berhasil diganti.'
                }
            >
                <Field
                    label="Kata Sandi Baru (minimal 6 karakter)"
                    name="new_password"
                    type="password"
                    placeholder="••••••••"
                    minLength={6}
                />
                <Field
                    label="Konfirmasi Kata Sandi Baru"
                    name="confirm_password"
                    type="password"
                    placeholder="••••••••"
                    minLength={6}
                />
            </ActionForm>

            {/* ── Ganti Password Pegawai ── */}
            {employees.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-1 text-base font-semibold text-gray-900">Reset Kata Sandi Pegawai</h2>
                    <p className="mb-4 text-xs text-gray-500">
                        Pilih pegawai, lalu set kata sandi baru untuk mereka.
                    </p>

                    <div className="mb-4">
                        <label className="mb-1 block text-xs font-medium text-gray-700">Pilih Pegawai</label>
                        <select
                            className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                            value={selectedEmployee?.id ?? ''}
                            onChange={(e) => {
                                const emp = employees.find((x) => x.id === e.target.value) ?? null
                                setSelectedEmployee(emp)
                            }}
                        >
                            <option value="">-- Pilih Pegawai --</option>
                            {employees.map((emp) => (
                                <option key={emp.id} value={emp.id}>
                                    {emp.full_name}
                                    {emp.branch_name ? ` — ${emp.branch_name}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {selectedEmployee && (
                        <EmployeePasswordForm employee={selectedEmployee} />
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Form reset password pegawai ──────────────────────────────────────────────
function EmployeePasswordForm({ employee }: { employee: Employee }) {
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setLoading(true)
        setMsg(null)
        const fd = new FormData(e.currentTarget)
        fd.set('employee_id', employee.id)
        const result = await changeEmployeePassword(fd)
        setLoading(false)
        if (result.error) setMsg({ type: 'err', text: result.error })
        else {
            setMsg({ type: 'ok', text: `Kata sandi ${employee.full_name} berhasil diganti.` })
            ;(e.target as HTMLFormElement).reset()
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-gray-100 pt-4">
            <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                    Kata Sandi Baru untuk{' '}
                    <span className="font-semibold text-gray-900">{employee.full_name}</span>
                </label>
                <input
                    type="password"
                    name="new_password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                />
            </div>

            {msg && (
                <p
                    className={`text-xs font-semibold ${
                        msg.type === 'ok' ? 'text-green-600' : 'text-red-600'
                    }`}
                >
                    {msg.type === 'ok' ? '✓ ' : '✗ '}
                    {msg.text}
                </p>
            )}

            <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-gray-800 transition active:scale-[0.99] disabled:opacity-50"
            >
                {loading ? 'Menyimpan...' : 'Set Kata Sandi Pegawai'}
            </button>
        </form>
    )
}
