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
    role?: string
    branchName?: string | null
    businessName: string
    subscriptionStatus?: string
    trialEndsAt?: string | null
    subscriptionExpiresAt?: string | null
    planName?: string | null
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
    const [showPassword, setShowPassword] = useState(false)
    const isPasswordField = type === 'password'
    const inputType = isPasswordField ? (showPassword ? 'text' : 'password') : type

    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
            <div className="relative">
                <input
                    type={inputType}
                    name={name}
                    defaultValue={defaultValue}
                    placeholder={placeholder}
                    minLength={minLength}
                    readOnly={readOnly}
                    required={!readOnly}
                    className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black ${
                        isPasswordField ? 'pr-10' : ''
                    } ${
                        readOnly
                            ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
                            : 'border-gray-300 bg-white'
                    }`}
                />
                {isPasswordField && (
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 transition cursor-pointer"
                        tabIndex={-1}
                    >
                        {showPassword ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                        )}
                    </button>
                )}
            </div>
        </div>
    )
}

// ─── Komponen utama ───────────────────────────────────────────────────────────
export default function ProfilClient({
    email,
    fullName,
    role = 'owner',
    branchName,
    businessName,
    subscriptionStatus = 'trial',
    trialEndsAt,
    subscriptionExpiresAt,
    planName,
    isGoogleUser,
    hasPasswordSet,
    isNewUser,
    employees,
}: Props) {
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
    const [activeTab, setActiveTab] = useState<'info' | 'password' | null>(null)

    // ── Dedicated Pegawai Profile View (Matches Mockup) ──
    if (role === 'pegawai') {
        const initials = fullName
            ? fullName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .substring(0, 2)
                  .toUpperCase()
            : 'PK'

        return (
            <div className="mx-auto max-w-xl space-y-6 px-4 py-8 sm:py-12">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Profil</h1>
                        <p className="mt-0.5 text-xs text-slate-500">Informasi akun dan pengaturan pegawai</p>
                    </div>
                </div>

                {/* Profile Card Header */}
                <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-black text-xl flex items-center justify-center shadow-md shadow-blue-500/20">
                                {initials}
                            </div>
                            <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white ring-1 ring-emerald-300" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">{fullName || 'Pegawai Kasir'}</h2>
                            <p className="text-xs text-slate-500 capitalize">
                                Pegawai {branchName ? `· ${branchName}` : ''}
                            </p>
                            <div className="mt-1 flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Aktif
                                </span>
                                {businessName && (
                                    <span className="text-[11px] text-slate-400 font-medium">
                                        {businessName}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Menu Action Cards */}
                <div className="rounded-3xl border border-slate-200/80 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden">
                    {/* 1. Informasi Akun */}
                    <div className="transition hover:bg-slate-50/80">
                        <button
                            type="button"
                            onClick={() => setActiveTab(activeTab === 'info' ? null : 'info')}
                            className="w-full flex items-center justify-between p-5 text-left cursor-pointer"
                        >
                            <div className="flex items-center gap-3.5">
                                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-slate-900">Informasi Akun</div>
                                    <div className="text-xs text-slate-400">Lihat data diri dan akun kasir</div>
                                </div>
                            </div>
                            <svg className={`w-4 h-4 text-slate-400 transition-transform ${activeTab === 'info' ? 'rotate-90 text-blue-600' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>

                        {activeTab === 'info' && (
                            <div className="px-5 pb-5 pt-1 border-t border-slate-100 bg-slate-50/50">
                                <div className="space-y-3 text-xs">
                                    <div className="flex justify-between py-2 border-b border-slate-100">
                                        <span className="text-slate-500 font-medium">Nama Lengkap</span>
                                        <span className="font-bold text-slate-800">{fullName}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b border-slate-100">
                                        <span className="text-slate-500 font-medium">Email / Username</span>
                                        <span className="font-bold text-slate-800">{email}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b border-slate-100">
                                        <span className="text-slate-500 font-medium">Peran / Role</span>
                                        <span className="font-bold text-blue-600 uppercase">Pegawai Kasir</span>
                                    </div>
                                    <div className="flex justify-between py-2">
                                        <span className="text-slate-500 font-medium">Cabang Penempatan</span>
                                        <span className="font-bold text-slate-800">{branchName || 'Cabang Utama'}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 2. Ubah Password */}
                    <div className="transition hover:bg-slate-50/80">
                        <button
                            type="button"
                            onClick={() => setActiveTab(activeTab === 'password' ? null : 'password')}
                            className="w-full flex items-center justify-between p-5 text-left cursor-pointer"
                        >
                            <div className="flex items-center gap-3.5">
                                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-slate-900">Ubah Password</div>
                                    <div className="text-xs text-slate-400">Ganti kata sandi akun</div>
                                </div>
                            </div>
                            <svg className={`w-4 h-4 text-slate-400 transition-transform ${activeTab === 'password' ? 'rotate-90 text-blue-600' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>

                        {activeTab === 'password' && (
                            <div className="px-5 pb-5 pt-3 border-t border-slate-100 bg-slate-50/50">
                                <ActionForm
                                    action={changeOwnPassword}
                                    title="Ganti Kata Sandi Sendiri"
                                    subtitle="Masukkan kata sandi baru minimal 6 karakter."
                                    submitLabel="Simpan Password Baru"
                                    successMsg="Kata sandi berhasil diperbarui!"
                                >
                                    <Field
                                        label="Kata Sandi Baru"
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
                            </div>
                        )}
                    </div>

                    {/* 3. Bantuan & FAQ */}
                    <div className="transition hover:bg-slate-50/80">
                        <a
                            href="https://wa.me/?text=Halo%20Admin%20Rekapi%2C%20saya%20butuh%20bantuan%20terkait%20aplikasi%20kasir"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center justify-between p-5 text-left cursor-pointer"
                        >
                            <div className="flex items-center gap-3.5">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-slate-900">Bantuan</div>
                                    <div className="text-xs text-slate-400">Pusat bantuan & FAQ</div>
                                </div>
                            </div>
                            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </a>
                    </div>

                    {/* 4. Keluar */}
                    <div className="transition hover:bg-rose-50/50">
                        <form
                            action="/api/auth/signout"
                            method="post"
                            onSubmit={(e) => {
                                if (!confirm('Yakin ingin keluar dari akun kasir?')) e.preventDefault()
                            }}
                        >
                            <button
                                type="submit"
                                className="w-full flex items-center justify-between p-5 text-left cursor-pointer group"
                            >
                                <div className="flex items-center gap-3.5">
                                    <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:bg-rose-100 transition">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-rose-600">Keluar</div>
                                        <div className="text-xs text-slate-400">Keluar dari akun</div>
                                    </div>
                                </div>
                                <svg className="w-4 h-4 text-slate-400 group-hover:text-rose-500 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        )
    }

    const isActive = subscriptionStatus === 'active'
    const isTrial = subscriptionStatus === 'trial'

    let daysRemaining = 0
    let isExpired = false
    let formattedEndDate = '-'

    const endDateStr = isActive ? subscriptionExpiresAt : trialEndsAt

    if (endDateStr) {
        const endDate = new Date(endDateStr)
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
                        <p className="text-sm font-semibold text-orange-800">Selamat datang di Rekapi!</p>
                        <p className="mt-0.5 text-xs text-orange-700">
                            Lengkapi nama bisnis Anda di bawah sebelum mulai menggunakan aplikasi.
                        </p>
                    </div>
                </div>
            )}

            {/* ── Status Paket & Subscription ── */}
            <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-slate-900">
                            {isActive ? 'Paket Langganan' : 'Paket & Masa Percobaan'}
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                            Status aktif akun dan hak akses fitur bisnis Anda.
                        </p>
                    </div>
                    <span
                        className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
                            isExpired
                                ? 'bg-red-100 text-red-700 border border-red-200'
                                : isActive
                                ? 'bg-green-100 text-green-700 border border-green-200'
                                : 'bg-blue-100 text-blue-700 border border-blue-200'
                        }`}
                    >
                        {isExpired ? (isTrial ? 'Trial Berakhir' : 'Berakhir') : isActive ? 'Aktif' : 'Trial 7 Hari'}
                    </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 border border-slate-100">
                    <div>
                        <span className="text-[11px] font-medium text-slate-400">Paket Layanan</span>
                        <p className="mt-0.5 text-sm font-bold text-slate-800">
                            {isActive && planName ? planName : 'Free Trial 7 Hari'}
                        </p>
                    </div>
                    <div>
                        <span className="text-[11px] font-medium text-slate-400">Sisa Waktu</span>
                        <p className={`mt-0.5 text-sm font-bold ${isExpired ? 'text-red-600' : isActive ? 'text-green-600' : 'text-blue-600'}`}>
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

                <div className="mt-3 flex items-start gap-2">
                    <p className="text-[11px] text-slate-500 leading-relaxed flex-1">
                        {isActive
                            ? `🎉 Anda berlangganan paket ${planName}. Nikmati akses penuh ke semua fitur premium.`
                            : '✨ Selama masa trial 7 hari, Anda dapat menikmati akses penuh ke semua fitur kasir multi-cabang, laporan laba rugi, HPP otomatis, dan ekspor laporan.'}
                    </p>
                </div>

                {(isExpired || daysRemaining <= 3) && (
                    <a
                        href="/dashboard/subscription"
                        className="mt-3 block w-full rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700 transition"
                    >
                        {isExpired ? 'Perpanjang Langganan' : isActive ? 'Perpanjang Sekarang' : 'Upgrade ke Premium'}
                    </a>
                )}
            </div>

            {/* ── Info Akun (email read-only & logout) ── */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-gray-900">Informasi Akun</h2>
                    <form
                        action="/api/auth/signout"
                        method="post"
                        onSubmit={(e) => {
                            if (!confirm('Yakin ingin keluar dari akun?')) e.preventDefault()
                        }}
                    >
                        <button
                            type="submit"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition cursor-pointer"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            <span>Keluar dari Akun</span>
                        </button>
                    </form>
                </div>
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
