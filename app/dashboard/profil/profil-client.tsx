'use client'

import { useState, useRef } from 'react'
import {
    updateOwnerName,
    updateBusinessProfile,
    changeOwnPassword,
    changeEmployeePassword,
} from './actions'
import { uploadImageWithCompression } from '@/lib/cloudinary-upload'

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
    businessAddress?: string | null
    businessPhone?: string | null
    businessLogoUrl?: string | null
    businessQrisUrl?: string | null
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
            className={`rounded-3xl border p-6 shadow-2xs transition ${
                highlight
                    ? 'border-amber-300 bg-amber-50/50 ring-2 ring-amber-200/60'
                    : 'border-slate-200/80 bg-white'
            }`}
        >
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-1 mb-4 text-xs text-slate-500">{subtitle}</p>}
            {!subtitle && <div className="mb-4" />}
            <form onSubmit={handleSubmit} className="space-y-4">
                {children}
                {msg && (
                    <div
                        className={`rounded-xl p-3 text-xs font-semibold flex items-center gap-2 ${
                            msg.type === 'ok'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                    >
                        {msg.type === 'ok' ? (
                            <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        )}
                        <span>{msg.text}</span>
                    </div>
                )}
                <div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs shadow-emerald-600/20 hover:bg-emerald-700 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                    >
                        {loading ? 'Menyimpan...' : submitLabel}
                    </button>
                </div>
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
    required = true,
}: {
    label: string
    name: string
    type?: string
    defaultValue?: string
    placeholder?: string
    minLength?: number
    readOnly?: boolean
    required?: boolean
}) {
    const [showPassword, setShowPassword] = useState(false)
    const isPasswordField = type === 'password'
    const inputType = isPasswordField ? (showPassword ? 'text' : 'password') : type
    const isRequired = !readOnly && required

    return (
        <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</label>
            <div className="relative">
                <input
                    type={inputType}
                    name={name}
                    defaultValue={defaultValue}
                    placeholder={placeholder}
                    minLength={minLength}
                    readOnly={readOnly}
                    required={isRequired}
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition ${
                        isPasswordField ? 'pr-10' : ''
                    } ${
                        readOnly
                            ? 'border-slate-200 bg-slate-50/80 text-slate-500 cursor-not-allowed'
                            : 'border-slate-200 bg-white'
                    }`}
                />
                {isPasswordField && (
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 transition cursor-pointer"
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

function QrisUploadField({ defaultValue }: { defaultValue?: string | null }) {
    const [qrisUrl, setQrisUrl] = useState(defaultValue ?? '')
    const [previewLoading, setPreviewLoading] = useState(false)
    const [uploadErr, setUploadErr] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploadErr(null)
        setPreviewLoading(true)
        try {
            const uploaded = await uploadImageWithCompression(file, 'qris')
            setQrisUrl(uploaded.url)
        } catch (err) {
            setUploadErr(err instanceof Error ? err.message : 'Gagal memproses gambar QRIS.')
        } finally {
            setPreviewLoading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    return (
        <div className="space-y-2.5 pt-3 border-t border-slate-100">
            <label className="block text-xs font-semibold text-slate-800">
                Kode QRIS Statis Toko (Tampil di Kasir POS)
            </label>
            <p className="text-[11px] text-slate-500 leading-relaxed">
                Unggah gambar/screenshot QRIS statis toko Anda (BCA, Mandiri, BRI, GoPay, OVO, ShopeePay, DANA, dll). Gambar diproses dengan resolusi tajam (800x1000 px WebP kualitas tinggi tanpa crop kotak) agar matriks barcode mudah dipindai kamera HP pelanggan, dan hanya dapat diubah oleh Owner.
            </p>

            <input type="hidden" name="qris_image_url" value={qrisUrl} />
            <input type="hidden" name="business_qris_url" value={qrisUrl} />

            {uploadErr && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-700">
                    {uploadErr}
                </div>
            )}

            {qrisUrl ? (
                <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 p-4">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="relative rounded-2xl border border-slate-200 bg-white p-2 shadow-2xs shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={qrisUrl}
                                alt="Pratinjau QRIS Toko"
                                className="h-40 w-40 object-contain rounded-xl"
                            />
                            <span className="absolute -top-2 -right-2 bg-emerald-600 text-white rounded-full p-1 shadow-xs">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                </svg>
                            </span>
                        </div>
                        <div className="flex-1 text-center sm:text-left space-y-2">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                                <svg className="w-3.5 h-3.5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                </svg>
                                <span>QRIS Aktif di Kasir POS</span>
                            </div>
                            <p className="text-xs text-slate-600">
                                Saat kasir memilih metode <strong>QRIS</strong>, gambar QRIS ini akan langsung muncul untuk di-scan oleh pelanggan.
                            </p>
                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                                >
                                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span>Ganti Gambar QRIS</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setQrisUrl('')}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-white text-xs font-semibold text-rose-600 hover:bg-rose-50 transition cursor-pointer shadow-2xs"
                                >
                                    <svg className="w-3.5 h-3.5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    <span>Hapus QRIS</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="group cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 hover:bg-emerald-50/40 hover:border-emerald-400 p-6 text-center transition"
                >
                    <div className="mx-auto w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs group-hover:scale-105 transition">
                        <svg className="w-6 h-6 text-slate-600 group-hover:text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                    </div>
                    <div className="mt-3 text-xs font-bold text-slate-800 group-hover:text-emerald-700">
                        {previewLoading ? 'Memproses gambar...' : '+ Klik untuk Unggah Gambar QRIS Toko'}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                        Mendukung format PNG, JPG, JPEG, atau WEBP dari galeri ponsel atau laptop Anda.
                    </p>
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/webp"
                onChange={handleFileChange}
                className="hidden"
            />
        </div>
    )
}

function calculateSubscriptionDetails(endDateStr: string | null | undefined, subscriptionStatus?: string) {
    if (!endDateStr) {
        return {
            daysRemaining: 0,
            isExpired: false,
            formattedEndDate: '-',
        }
    }
    const endDate = new Date(endDateStr)
    const msLeft = endDate.getTime() - Date.now()
    const daysRemaining = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
    const isExpired = subscriptionStatus === 'expired' || msLeft <= 0
    const formattedEndDate = new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'full',
        timeStyle: 'short',
    }).format(endDate)

    return { daysRemaining, isExpired, formattedEndDate }
}

// ─── Komponen utama ───────────────────────────────────────────────────────────
export default function ProfilClient({
    email,
    fullName,
    role = 'owner',
    branchName,
    businessName,
    businessAddress,
    businessPhone,
    businessLogoUrl,
    businessQrisUrl,
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
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Profil Kasir</h1>
                        <p className="mt-0.5 text-xs text-slate-500">Informasi akun dan pengaturan pegawai kasir</p>
                    </div>
                </div>

                {/* Profile Card Header */}
                <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-xl flex items-center justify-center shadow-xs shadow-emerald-500/20">
                                {initials}
                            </div>
                            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">{fullName || 'Pegawai Kasir'}</h2>
                            <p className="text-xs text-slate-500 capitalize">
                                Kasir {branchName ? `· ${branchName}` : ''}
                            </p>
                            <div className="mt-1 flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Kasir Aktif
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
                <div className="rounded-3xl border border-slate-200/80 bg-white shadow-2xs divide-y divide-slate-100 overflow-hidden">
                    {/* 1. Informasi Akun */}
                    <div className="transition hover:bg-slate-50/80">
                        <button
                            type="button"
                            onClick={() => setActiveTab(activeTab === 'info' ? null : 'info')}
                            className="w-full flex items-center justify-between p-5 text-left cursor-pointer"
                        >
                            <div className="flex items-center gap-3.5">
                                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-slate-900">Informasi Akun</div>
                                    <div className="text-xs text-slate-400">Lihat data diri dan akun kasir</div>
                                </div>
                            </div>
                            <svg className={`w-4 h-4 text-slate-400 transition-transform ${activeTab === 'info' ? 'rotate-90 text-emerald-600' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                                        <span className="font-bold text-emerald-700 uppercase">Pegawai Kasir</span>
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
                                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-slate-900">Ubah Kata Sandi</div>
                                    <div className="text-xs text-slate-400">Ganti kata sandi akun kasir</div>
                                </div>
                            </div>
                            <svg className={`w-4 h-4 text-slate-400 transition-transform ${activeTab === 'password' ? 'rotate-90 text-emerald-600' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-slate-900">Bantuan Rekapi</div>
                                    <div className="text-xs text-slate-400">Pusat bantuan &amp; FAQ WhatsApp</div>
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
                                    <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 group-hover:bg-rose-100 transition">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-rose-600">Keluar Akun</div>
                                        <div className="text-xs text-slate-400">Keluar dari sesi login kasir</div>
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

    const endDateStr = isActive ? subscriptionExpiresAt : trialEndsAt
    const { daysRemaining, isExpired, formattedEndDate } = calculateSubscriptionDetails(endDateStr, subscriptionStatus)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Profil &amp; Pengaturan Bisnis</h1>
                <p className="mt-1 text-xs text-slate-500">Kelola identitas pemilik, informasi bisnis, struk kasir, dan keamanan akun.</p>
            </div>

            {/* ── Banner untuk user baru Google ── */}
            {isNewUser && (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50/70 p-4 shadow-2xs">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-800 shrink-0 mt-0.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-amber-900">Selamat datang di Rekapi!</p>
                        <p className="mt-0.5 text-xs text-amber-800 leading-relaxed">
                            Lengkapi nama bisnis dan profil usaha Anda di bawah sebelum mulai mencatat penjualan di kasir.
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Kolom Kiri: Status Langganan & Akun Login */}
                <div className="space-y-6 lg:col-span-1">
                    {/* ── Status Paket & Subscription ── */}
                    <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <h2 className="text-sm font-bold text-slate-900">
                                    {isActive ? 'Paket Langganan' : 'Paket & Masa Trial'}
                                </h2>
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                    Status aktif akun toko
                                </p>
                            </div>
                            <span
                                className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider border ${
                                    isExpired
                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                        : isActive
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                                        : 'bg-sky-50 text-sky-700 border-sky-200'
                                }`}
                            >
                                {isExpired ? (isTrial ? 'Trial Berakhir' : 'Berakhir') : isActive ? 'Aktif' : 'Trial 7 Hari'}
                            </span>
                        </div>

                        <div className="mt-4 space-y-3 rounded-2xl bg-slate-50/80 p-4 border border-slate-100 text-xs">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 font-medium">Paket Layanan</span>
                                <span className="font-bold text-slate-900">
                                    {isActive && planName ? planName : 'Free Trial 7 Hari'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 font-medium">Sisa Waktu</span>
                                <span className={`font-bold ${isExpired ? 'text-rose-600' : isActive ? 'text-emerald-700' : 'text-sky-700'}`}>
                                    {isExpired ? '0 hari (Kedaluwarsa)' : `${daysRemaining} hari lagi`}
                                </span>
                            </div>
                            <div className="pt-2 border-t border-slate-200/60">
                                <span className="text-slate-400 text-[11px] block">Berlaku Sampai</span>
                                <span className="font-semibold text-slate-700 text-xs block mt-0.5">
                                    {formattedEndDate}
                                </span>
                            </div>
                        </div>

                        <div className="mt-4">
                            <a
                                href="/dashboard/subscription"
                                className="block w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-center text-xs font-bold text-white shadow-xs shadow-emerald-600/20 transition active:scale-[0.99]"
                            >
                                {isExpired ? 'Perpanjang Langganan' : isActive ? 'Kelola Langganan' : 'Upgrade ke Premium'}
                            </a>
                        </div>
                    </div>

                    {/* ── Info Akun Login ── */}
                    <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-sm font-bold text-slate-900">Akun Login</h2>
                                <p className="text-[11px] text-slate-500 mt-0.5">Kredensial akses Anda</p>
                            </div>
                            <form
                                action="/api/auth/signout"
                                method="post"
                                onSubmit={(e) => {
                                    if (!confirm('Yakin ingin keluar dari akun?')) e.preventDefault()
                                }}
                            >
                                <button
                                    type="submit"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer shadow-2xs"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                    <span>Keluar</span>
                                </button>
                            </form>
                        </div>
                        <Field label="Email Terdaftar" name="email" type="email" defaultValue={email} readOnly />
                        {isGoogleUser && (
                            <div className="mt-2.5 text-[11px] text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-start gap-2">
                                <svg className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                                <span>Terhubung melalui akun Google. Anda dapat menambahkan kata sandi pada menu keamanan.</span>
                            </div>
                        )}
                    </div>

                    {/* ── Edit Nama Owner ── */}
                    <ActionForm
                        action={updateOwnerName}
                        title="Nama Pemilik Toko"
                        subtitle="Nama yang tertera pada akun pemilik bisnis."
                        submitLabel="Simpan Nama"
                        successMsg="Nama berhasil diperbarui."
                    >
                        <Field
                            label="Nama Lengkap Pemilik"
                            name="full_name"
                            defaultValue={fullName}
                            placeholder="Nama lengkap Anda"
                        />
                    </ActionForm>
                </div>

                {/* Kolom Kanan: Profil Bisnis, Branding Struk, dan Keamanan */}
                <div className="space-y-6 lg:col-span-2">
                    {/* ── Edit Profil Bisnis & Branding ── */}
                    <ActionForm
                        action={updateBusinessProfile}
                        title="Profil Bisnis &amp; Struk Kasir"
                        subtitle={
                            isNewUser
                                ? 'Belum diisi — silakan lengkapi nama bisnis Anda.'
                                : 'Informasi identitas bisnis yang akan dicetak pada struk kasir dan faktur transaksi.'
                        }
                        submitLabel="Simpan Profil Bisnis"
                        successMsg="Profil bisnis berhasil diperbarui."
                        highlight={isNewUser}
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2">
                                <Field
                                    label="Nama Bisnis / Brand *"
                                    name="business_name"
                                    defaultValue={isNewUser ? '' : businessName}
                                    placeholder="Contoh: Dimsum Mentai"
                                    required={true}
                                />
                            </div>

                            <div className="sm:col-span-2">
                                <Field
                                    label="Alamat Bisnis (Opsional)"
                                    name="business_address"
                                    defaultValue={businessAddress ?? ''}
                                    placeholder="Contoh: Jl. Senopati No. 12, Jakarta Selatan"
                                    required={false}
                                />
                            </div>

                            <div>
                                <Field
                                    label="Nomor Telepon / WhatsApp (Opsional)"
                                    name="business_phone"
                                    defaultValue={businessPhone ?? ''}
                                    placeholder="Contoh: 081234567890"
                                    required={false}
                                />
                            </div>

                            <div>
                                <Field
                                    label="URL Logo Bisnis (Opsional)"
                                    name="business_logo_url"
                                    defaultValue={businessLogoUrl ?? ''}
                                    placeholder="Contoh: https://example.com/logo.png"
                                    required={false}
                                />
                            </div>
                        </div>

                        {businessLogoUrl && (
                            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={businessLogoUrl}
                                    alt="Logo Bisnis"
                                    className="h-10 w-10 rounded-xl object-contain border border-slate-200 bg-white p-0.5"
                                    onError={(e) => {
                                        (e.target as HTMLElement).style.display = 'none'
                                    }}
                                />
                                <div className="text-xs text-slate-600">
                                    <span className="font-bold text-slate-800">Logo Aktif</span>
                                    <p className="text-[11px] text-slate-400">Logo ini ditampilkan pada header struk kasir.</p>
                                </div>
                            </div>
                        )}

                        <QrisUploadField defaultValue={businessQrisUrl} />
                    </ActionForm>

                    {/* ── Ganti / Set Password Owner ── */}
                    <ActionForm
                        action={changeOwnPassword}
                        title={isGoogleUser && !hasPasswordSet ? 'Set Kata Sandi Akun' : 'Ganti Kata Sandi Akun'}
                        subtitle={
                            isGoogleUser && !hasPasswordSet
                                ? 'Tambahkan kata sandi agar bisa login dengan email & password selain Google.'
                                : 'Perbarui kata sandi akun pemilik bisnis Anda secara berkala.'
                        }
                        submitLabel={isGoogleUser && !hasPasswordSet ? 'Set Kata Sandi' : 'Ganti Kata Sandi'}
                        successMsg={
                            isGoogleUser && !hasPasswordSet
                                ? 'Kata sandi berhasil diset! Sekarang kamu bisa login dengan email & password.'
                                : 'Kata sandi berhasil diganti.'
                        }
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field
                                label="Kata Sandi Baru (Min. 6 Karakter)"
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
                        </div>
                    </ActionForm>

                    {/* ── Ganti Password Pegawai ── */}
                    {employees.length > 0 && (
                        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs">
                            <h2 className="text-base font-bold text-slate-900">Reset Kata Sandi Pegawai</h2>
                            <p className="mt-0.5 mb-4 text-xs text-slate-500">
                                Pilih pegawai kasir, lalu tetapkan kata sandi baru jika kasir lupa akses login.
                            </p>

                            <div className="mb-4">
                                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Pilih Pegawai Kasir</label>
                                <select
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
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
            </div>
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
        <form onSubmit={handleSubmit} className="space-y-3.5 border-t border-slate-100 pt-4">
            <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Kata Sandi Baru untuk{' '}
                    <span className="font-bold text-slate-900">{employee.full_name}</span>
                </label>
                <input
                    type="password"
                    name="new_password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                />
            </div>

            {msg && (
                <div
                    className={`rounded-xl p-3 text-xs font-semibold flex items-center gap-2 ${
                        msg.type === 'ok'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                >
                    {msg.type === 'ok' ? (
                        <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )}
                    <span>{msg.text}</span>
                </div>
            )}

            <div>
                <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs shadow-emerald-600/20 hover:bg-emerald-700 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                    {loading ? 'Menyimpan...' : 'Set Kata Sandi Pegawai'}
                </button>
            </div>
        </form>
    )
}
