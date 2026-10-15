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

interface SubscriptionClientProps {
    plans: Plan[]
    currentStatus: string
    trialEndsAt: string | null
    currentPlanName: string | null
    subscriptionExpiresAt: string | null
}

export default function SubscriptionClient({
    plans,
    currentStatus,
    trialEndsAt,
    currentPlanName,
    subscriptionExpiresAt,
}: SubscriptionClientProps) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null)

    const handleSubscribe = async (planId: string) => {
        setLoading(true)
        setSelectedPlan(planId)

        try {
            const res = await fetch('/api/midtrans/create-transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId }),
            })

            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.error || 'Failed to create transaction')
            }

            const { token, redirectUrl, orderId } = await res.json()

            const targetSnapUrl =
                process.env.NEXT_PUBLIC_MIDTRANS_SNAP_URL ||
                'https://app.midtrans.com/snap/snap.js'
            const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || ''

            const openSnap = () => {
                // @ts-ignore
                if (window.snap && typeof window.snap.pay === 'function') {
                    // @ts-ignore
                    window.snap.pay(token, {
                        onSuccess: function (result: any) {
                            const finalOrderId = result?.order_id || orderId || ''
                            router.push(
                                `/dashboard/subscription/success?order_id=${encodeURIComponent(finalOrderId)}`
                            )
                        },
                        onPending: function (result: any) {
                            const finalOrderId = result?.order_id || orderId || ''
                            router.push(
                                `/dashboard/subscription/pending?order_id=${encodeURIComponent(finalOrderId)}`
                            )
                        },
                        onError: function (result: any) {
                            const finalOrderId = result?.order_id || orderId || ''
                            router.push(
                                `/dashboard/subscription/error?order_id=${encodeURIComponent(finalOrderId)}`
                            )
                        },
                        onClose: async function () {
                            setLoading(false)
                            setSelectedPlan(null)
                            // Jika user menutup pop-up tanpa menyelesaikan pembayaran, batalkan status transaksi
                            if (orderId) {
                                try {
                                    await fetch('/api/midtrans/cancel-transaction', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ orderId }),
                                    })
                                } catch {
                                    // Abaikan error jaringan saat cancel
                                }
                            }
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
                    // @ts-ignore
                    delete window.snap
                } else if ((window as any).snap) {
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
        } catch (error: any) {
            alert(error.message || 'Terjadi kesalahan')
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

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-6xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Pilih Paket Langganan</h1>
                    <div className="text-gray-600">
                        <p className="mb-1">
                            Status saat ini: <span className="font-semibold capitalize">{currentStatus}</span>
                            {currentPlanName && currentStatus === 'active' && (
                                <span className="ml-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                                    {currentPlanName}
                                </span>
                            )}
                        </p>
                        {trialEndsAt && currentStatus === 'trial' && (
                            <p className="text-sm text-gray-500">
                                Trial berakhir: {new Date(trialEndsAt).toLocaleDateString('id-ID')}
                            </p>
                        )}
                        {subscriptionExpiresAt && currentStatus === 'active' && (
                            <p className="text-sm text-gray-500">
                                Langganan berakhir: {new Date(subscriptionExpiresAt).toLocaleDateString('id-ID')}
                            </p>
                        )}
                    </div>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                    {plans.map((plan) => (
                        <div
                            key={plan.id}
                            className="bg-white rounded-lg shadow-md border-2 border-gray-200 hover:border-blue-500 transition-all p-6"
                        >
                            <div className="mb-4">
                                <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                                <div className="text-3xl font-bold text-blue-600 mb-1">
                                    {formatPrice(plan.price)}
                                </div>
                                <p className="text-sm text-gray-500">per bulan</p>
                            </div>

                            <div className="mb-6 space-y-3">
                                {Array.isArray(plan.features) && plan.features.length > 0 ? (
                                    plan.features.map((feat, idx) => (
                                        <div key={idx} className="flex items-center text-sm text-gray-700">
                                            <svg
                                                className="w-5 h-5 text-green-500 mr-2 flex-shrink-0"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M5 13l4 4L19 7"
                                                />
                                            </svg>
                                            <span>{feat}</span>
                                        </div>
                                    ))
                                ) : (
                                    <>
                                        <div className="flex items-center text-sm text-gray-700">
                                            <svg
                                                className="w-5 h-5 text-green-500 mr-2 flex-shrink-0"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M5 13l4 4L19 7"
                                                />
                                            </svg>
                                            <span>
                                                {plan.max_branches
                                                    ? `Maksimal ${plan.max_branches} cabang`
                                                    : 'Unlimited cabang'}
                                            </span>
                                        </div>
                                        <div className="flex items-center text-sm text-gray-700">
                                            <svg
                                                className="w-5 h-5 text-green-500 mr-2 flex-shrink-0"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M5 13l4 4L19 7"
                                                />
                                            </svg>
                                            <span>Unlimited pegawai</span>
                                        </div>
                                        <div className="flex items-center text-sm text-gray-700">
                                            <svg
                                                className="w-5 h-5 text-green-500 mr-2 flex-shrink-0"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M5 13l4 4L19 7"
                                                />
                                            </svg>
                                            <span>Laporan {plan.code === 'pro' ? 'advanced' : 'lengkap'}</span>
                                        </div>
                                        <div className="flex items-center text-sm text-gray-700">
                                            <svg
                                                className="w-5 h-5 text-green-500 mr-2 flex-shrink-0"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M5 13l4 4L19 7"
                                                />
                                            </svg>
                                            <span>Support {plan.code === 'pro' ? 'prioritas 24/7' : plan.code === 'business' ? 'prioritas' : 'standar'}</span>
                                        </div>
                                        {plan.code === 'business' && (
                                            <div className="flex items-center text-sm text-gray-700">
                                                <svg
                                                    className="w-5 h-5 text-green-500 mr-2 flex-shrink-0"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M5 13l4 4L19 7"
                                                    />
                                                </svg>
                                                <span>Analisis penjualan</span>
                                            </div>
                                        )}
                                        {plan.code === 'pro' && (
                                            <>
                                                <div className="flex items-center text-sm text-gray-700">
                                                    <svg
                                                        className="w-5 h-5 text-green-500 mr-2 flex-shrink-0"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M5 13l4 4L19 7"
                                                        />
                                                    </svg>
                                                    <span>Analisis penjualan lanjutan</span>
                                                </div>
                                                <div className="flex items-center text-sm text-gray-700">
                                                    <svg
                                                        className="w-5 h-5 text-green-500 mr-2 flex-shrink-0"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M5 13l4 4L19 7"
                                                        />
                                                    </svg>
                                                    <span>API access</span>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>

                            <button
                                onClick={() => handleSubscribe(plan.id)}
                                disabled={loading}
                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                            >
                                {loading && selectedPlan === plan.id ? 'Memproses...' : 'Pilih Paket'}
                            </button>
                        </div>
                    ))}
                </div>

                <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2">ℹ️ Informasi Penting</h3>
                    <ul className="text-sm text-blue-800 space-y-1">
                        <li>• Tersedia trial gratis 7 hari untuk pengguna baru</li>
                        <li>• Pembayaran dilakukan melalui Midtrans dengan berbagai metode (VA, e-wallet, kartu kredit, dll)</li>
                        <li>• Langganan berlaku sesuai durasi paket ({plans[0]?.duration_days ?? 28} hari) sejak pembayaran berhasil</li>
                        <li>• Jika Anda berlangganan saat trial masih aktif, trial akan otomatis diganti dengan periode berlangganan</li>
                        <li>• Anda dapat upgrade atau downgrade paket kapan saja</li>
                        <li>• Hubungi support untuk bantuan lebih lanjut</li>
                    </ul>
                </div>
            </div>
        </div>
    )
}
