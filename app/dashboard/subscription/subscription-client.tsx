'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Plan {
    id: string
    code: string
    name: string
    price: number
    max_branches: number | null
    max_employees?: number | null
    duration_days?: number
    description?: string | null
    features?: string[] | null
}

interface MidtransSnapResult {
    order_id?: string
    status_code?: string
    transaction_status?: string
    [key: string]: unknown
}

interface MidtransSnap {
    pay: (
        token: string,
        options: {
            onSuccess: (result: MidtransSnapResult) => void
            onPending: (result: MidtransSnapResult) => void
            onError: (result: MidtransSnapResult) => void
            onClose: () => void | Promise<void>
        }
    ) => void
}

declare global {
    interface Window {
        snap?: MidtransSnap
    }
}

interface SubscriptionClientProps {
    plans: Plan[]
    currentStatus: string
    trialEndsAt: string | null
    currentPlanId?: string | null
    currentPlanName: string | null
    subscriptionExpiresAt: string | null
    pendingTransaction?: {
        id: string
        orderId: string
        amount: number
        createdAt: string
        planName: string | null
    } | null
}

export default function SubscriptionClient({
    plans,
    currentStatus,
    trialEndsAt,
    currentPlanId = null,
    currentPlanName,
    subscriptionExpiresAt,
    pendingTransaction = null,
}: SubscriptionClientProps) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
    const [cancellingPending, setCancellingPending] = useState(false)

    const handleCancelPending = async (orderId: string) => {
        if (!confirm('Apakah Anda yakin ingin membatalkan pesanan langganan ini?')) return
        setCancellingPending(true)
        try {
            const res = await fetch('/api/midtrans/cancel-transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ orderId }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                alert(data.error || 'Gagal membatalkan transaksi.')
            } else {
                router.refresh()
            }
        } catch {
            alert('Terjadi kesalahan jaringan saat membatalkan transaksi.')
        } finally {
            setCancellingPending(false)
        }
    }

    const handleSubscribe = async (planId: string) => {
        setLoading(true)
        setSelectedPlan(planId)

        try {
            const res = await fetch('/api/midtrans/create-transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ planId }),
            })

            const contentType = res.headers.get('content-type') || ''
            let data: {
                error?: string
                token?: string
                redirectUrl?: string
                orderId?: string
                snapUrl?: string
                clientKey?: string
            } = {}

            if (contentType.includes('application/json')) {
                data = await res.json()
            } else {
                const text = await res.text()
                if (res.status === 401 || res.redirected || text.includes('/login') || text.includes('<!DOCTYPE')) {
                    alert('Sesi login telah berakhir atau Anda belum login sebagai Owner. Mengalihkan ke halaman login...')
                    router.push('/login?next=/dashboard/subscription')
                    setLoading(false)
                    setSelectedPlan(null)
                    return
                }
                throw new Error(`Koneksi server pembayaran gagal (Status ${res.status}). Silakan coba beberapa saat lagi.`)
            }

            if (!res.ok) {
                throw new Error(data.error || `Gagal menyiapkan pembayaran (Kode: ${res.status})`)
            }

            const { token, redirectUrl, orderId, snapUrl: serverSnapUrl, clientKey: serverClientKey } = data

            if (!token && !redirectUrl) {
                throw new Error('Sistem pembayaran tidak mengembalikan token atau tautan pembayaran yang valid.')
            }

            // Fail-closed Snap URL: gunakan URL yang telah divalidasi server, atau default aman Sandbox (bukan production)
            const targetSnapUrl =
                serverSnapUrl ||
                process.env.NEXT_PUBLIC_MIDTRANS_SNAP_URL ||
                'https://app.sandbox.midtrans.com/snap/snap.js'
            const clientKey = serverClientKey || process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || ''

            const openSnap = () => {
                if (token && window.snap && typeof window.snap.pay === 'function') {
                    window.snap.pay(token, {
                        onSuccess: function (result: MidtransSnapResult) {
                            const finalOrderId = result?.order_id || orderId || ''
                            router.push(
                                `/dashboard/subscription/success?order_id=${encodeURIComponent(finalOrderId)}`
                            )
                        },
                        onPending: function (result: MidtransSnapResult) {
                            const finalOrderId = result?.order_id || orderId || ''
                            router.push(
                                `/dashboard/subscription/pending?order_id=${encodeURIComponent(finalOrderId)}`
                            )
                        },
                        onError: function (result: MidtransSnapResult) {
                            const finalOrderId = result?.order_id || orderId || ''
                            router.push(
                                `/dashboard/subscription/error?order_id=${encodeURIComponent(finalOrderId)}`
                            )
                        },
                        onClose: function () {
                            setLoading(false)
                            setSelectedPlan(null)
                            // Jangan batalkan otomatis karena user mungkin menyalin kode VA / QRIS untuk bayar di m-banking
                            router.refresh()
                        },
                    })
                } else if (redirectUrl) {
                    // Fallback to direct redirect if Snap popup is unavailable or blocked
                    window.location.href = redirectUrl
                } else {
                    alert('Gagal membuka popup pembayaran. Silakan coba lagi.')
                    setLoading(false)
                    setSelectedPlan(null)
                }
            }

            // Check if Midtrans Snap script is already loaded
            const existingScript = document.querySelector('script[data-midtrans-snap="true"]') as HTMLScriptElement
            if (existingScript) {
                // If existing script has a different src or client key (e.g. from previous sandbox session), replace it
                if (existingScript.src !== targetSnapUrl || existingScript.getAttribute('data-client-key') !== clientKey) {
                    existingScript.remove()
                } else if (window.snap) {
                    openSnap()
                    return
                }
            }

            const snapScript = document.createElement('script')
            snapScript.src = targetSnapUrl
            snapScript.setAttribute('data-client-key', clientKey)
            snapScript.setAttribute('data-midtrans-snap', 'true')

            // Fallback timeout: if snap.js hangs or is blocked, redirect directly via redirectUrl
            const timeoutId = setTimeout(() => {
                if (redirectUrl) {
                    window.location.href = redirectUrl
                }
            }, 5000)

            snapScript.onload = () => {
                clearTimeout(timeoutId)
                openSnap()
            }

            snapScript.onerror = () => {
                clearTimeout(timeoutId)
                if (redirectUrl) {
                    window.location.href = redirectUrl
                } else {
                    alert('Gagal memuat sistem pembayaran Midtrans.')
                    setLoading(false)
                    setSelectedPlan(null)
                }
            }

            document.body.appendChild(snapScript)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Terjadi kesalahan'
            alert(message)
            setLoading(false)
            setSelectedPlan(null)
        }
    }

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
        }).format(price)
    }

    const isActive = currentStatus === 'active'
    const isTrial = currentStatus === 'trial'

    return (
        <div className="space-y-8">
            {/* Header & Status Card */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5">
                        <a href="/dashboard" className="hover:text-emerald-600 transition flex items-center gap-1 font-medium">
                            <span>Dashboard</span>
                        </a>
                        <span>/</span>
                        <span className="font-semibold text-slate-700">Paket Langganan</span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                        Pilih Paket Langganan Bisnis
                    </h1>
                    <p className="mt-1 text-xs text-slate-500">
                        Tingkatkan skala operasional toko Anda dengan fitur multi-cabang, multi-kasir, dan laporan laba rugi akurat.
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status:</span>
                            <span
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                                    isActive
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                                        : isTrial
                                        ? 'bg-sky-50 text-sky-700 border-sky-200'
                                        : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                            >
                                {isActive ? (currentPlanName ? `Aktif (${currentPlanName})` : 'Aktif') : isTrial ? 'Trial 7 Hari' : 'Kedaluwarsa'}
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                            {subscriptionExpiresAt && isActive
                                ? `Berlaku s/d: ${new Date(subscriptionExpiresAt).toLocaleDateString('id-ID', { dateStyle: 'medium' })}`
                                : trialEndsAt && isTrial
                                ? `Trial s/d: ${new Date(trialEndsAt).toLocaleDateString('id-ID', { dateStyle: 'medium' })}`
                                : 'Perpanjang untuk melanjutkan operasional'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Banner Transaksi Menunggu Pembayaran (Pending Midtrans) */}
            {pendingTransaction && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 text-lg border border-amber-200">
                            ⏳
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                                    Menunggu Pembayaran
                                </span>
                                <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-900">
                                    {pendingTransaction.orderId}
                                </span>
                            </div>
                            <p className="text-xs text-amber-900 mt-1">
                                Anda memiliki tagihan paket <strong>{pendingTransaction.planName || 'Langganan'}</strong> sebesar{' '}
                                <strong className="font-mono text-sm">Rp{pendingTransaction.amount.toLocaleString('id-ID')}</strong> yang belum diselesaikan.
                            </p>
                            <p className="text-[11px] text-amber-700/80 mt-0.5">
                                Dibuat pada {new Date(pendingTransaction.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })} WIB
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => handleCancelPending(pendingTransaction.orderId)}
                            disabled={cancellingPending}
                            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 transition cursor-pointer disabled:opacity-50"
                        >
                            {cancellingPending ? 'Membatalkan...' : 'Batalkan Pesanan'}
                        </button>
                        <a
                            href={`/dashboard/subscription/pending?order_id=${encodeURIComponent(pendingTransaction.orderId)}`}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition shadow-xs cursor-pointer flex items-center gap-1.5"
                        >
                            <span>Lanjutkan / Cek Status</span>
                            <span>→</span>
                        </a>
                    </div>
                </div>
            )}

            {/* Pricing Cards */}
            <div className="grid md:grid-cols-3 gap-6 pt-2">
                {plans.map((plan) => {
                    const isBusiness = plan.code === 'business'
                    const isCurrent =
                        isActive &&
                        (currentPlanId
                            ? currentPlanId === plan.id
                            : currentPlanName?.toLowerCase() === plan.name?.toLowerCase())

                    return (
                        <div
                            key={plan.id}
                            className={`relative rounded-3xl bg-white p-6.5 transition-all flex flex-col justify-between ${
                                isBusiness
                                    ? 'border-2 border-emerald-600 shadow-xl shadow-emerald-600/10 ring-4 ring-emerald-500/10'
                                    : 'border border-slate-200/90 shadow-2xs hover:border-emerald-300'
                            }`}
                        >
                            {isBusiness && (
                                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-xs shadow-emerald-600/30">
                                    Paling Populer
                                </div>
                            )}

                            <div>
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                                    {isCurrent && (
                                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/60">
                                            Paket Aktif
                                        </span>
                                    )}
                                </div>

                                <div className="mt-4 flex items-baseline gap-1">
                                    <span className="text-3xl font-black text-slate-900">
                                        {formatPrice(plan.price)}
                                    </span>
                                    <span className="text-xs text-slate-400 font-medium">/ {plan.duration_days ?? 28} hari</span>
                                </div>

                                <p className="mt-2 text-xs text-slate-500 leading-relaxed min-h-[36px]">
                                    {plan.description ||
                                        (plan.code === 'standard'
                                            ? 'Cocok untuk bisnis dengan 1 cabang dan 1 akun pegawai kasir.'
                                            : plan.code === 'business'
                                            ? 'Untuk bisnis yang mulai berkembang hingga 3 cabang dan 3 akun pegawai.'
                                            : 'Untuk bisnis berkembang pesat hingga 5 cabang dan 5 akun pegawai.')}
                                </p>

                                <div className="mt-6 space-y-3 pt-6 border-t border-slate-100">
                                    {Array.isArray(plan.features) && plan.features.length > 0 ? (
                                        plan.features.map((feat, idx) => (
                                            <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700">
                                                <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mt-0.5">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <span className="leading-tight">{feat}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <>
                                            <div className="flex items-start gap-2.5 text-xs text-slate-700">
                                                <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mt-0.5">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <span className="leading-tight font-medium">
                                                    {plan.max_branches
                                                        ? `Maksimal ${plan.max_branches} cabang`
                                                        : 'Unlimited cabang'}
                                                </span>
                                            </div>
                                            <div className="flex items-start gap-2.5 text-xs text-slate-700">
                                                <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mt-0.5">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <span className="leading-tight font-medium">
                                                    {plan.max_employees
                                                        ? `Maksimal ${plan.max_employees} akun pegawai (1 per cabang)`
                                                        : 'Unlimited pegawai kasir'}
                                                </span>
                                            </div>
                                            <div className="flex items-start gap-2.5 text-xs text-slate-700">
                                                <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mt-0.5">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <span className="leading-tight">
                                                    Laporan laba rugi &amp; HPP {plan.code === 'pro' ? 'advanced' : 'lengkap'}
                                                </span>
                                            </div>
                                            <div className="flex items-start gap-2.5 text-xs text-slate-700">
                                                <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mt-0.5">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <span className="leading-tight">
                                                    Support WhatsApp {plan.code === 'pro' ? 'prioritas 24/7' : plan.code === 'business' ? 'prioritas' : 'standar'}
                                                </span>
                                            </div>
                                            {plan.code === 'business' && (
                                                <div className="flex items-start gap-2.5 text-xs text-slate-700">
                                                    <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mt-0.5">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </div>
                                                    <span className="leading-tight">Analisis tren penjualan &amp; grafik omzet</span>
                                                </div>
                                            )}
                                            {plan.code === 'pro' && (
                                                <>
                                                    <div className="flex items-start gap-2.5 text-xs text-slate-700">
                                                        <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mt-0.5">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </div>
                                                        <span className="leading-tight">Analisis multi-cabang lanjutan</span>
                                                    </div>
                                                    <div className="flex items-start gap-2.5 text-xs text-slate-700">
                                                        <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mt-0.5">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </div>
                                                        <span className="leading-tight">Akses API &amp; kustomisasi integrasi</span>
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="mt-8">
                                <button
                                    onClick={() => handleSubscribe(plan.id)}
                                    disabled={loading}
                                    className={`w-full py-3 px-4 rounded-xl text-xs font-bold transition active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                                        isBusiness
                                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs shadow-emerald-600/20'
                                            : 'bg-slate-900 hover:bg-slate-800 text-white shadow-2xs'
                                    }`}
                                >
                                    {loading && selectedPlan === plan.id
                                        ? 'Menyiapkan Pembayaran...'
                                        : isCurrent
                                        ? 'Perpanjang Paket Ini'
                                        : isActive
                                        ? 'Upgrade / Ganti ke Paket Ini'
                                        : 'Pilih Paket Ini'}
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Informasi Pembayaran & FAQ Box */}
            <div className="rounded-3xl border border-emerald-200/80 bg-emerald-50/50 p-6 shadow-2xs">
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">🛡️</span>
                    <h3 className="text-sm font-bold text-emerald-950">Informasi &amp; Jaminan Pembayaran</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-emerald-900/90 leading-relaxed">
                    <div className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span>
                            <strong>Metode Pembayaran Lengkap:</strong> Transaksi aman via Midtrans mendukung QRIS (semua e-wallet), Virtual Account BCA, BRI, BNI, Mandiri, dan Kartu Kredit.
                        </span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span>
                            <strong>Aktivasi Otomatis Real-time:</strong> Kuota cabang dan akun kasir otomatis terbuka detik itu juga setelah konfirmasi pembayaran diterima.
                        </span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span>
                            <strong>Akumulasi Masa Aktif &amp; Upgrade Kapan Saja:</strong> Perpanjangan lebih awal otomatis menambah sisa hari aktif Anda (+28 hari), dan upgrade paket langsung menaikkan kuota cabang &amp; kasir.
                        </span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span>
                            <strong>Bantuan Langsung:</strong> Tim support Rekapi siap membantu jika Anda membutuhkan invoice resmi perusahaan atau panduan aktivasi.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
