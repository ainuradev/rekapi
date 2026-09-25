'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Plan {
    id: string
    code: string
    name: string
    price: number
    max_branches: number | null
}

interface SubscriptionClientProps {
    plans: Plan[]
    currentStatus: string
    trialEndsAt: string | null
}

export default function SubscriptionClient({
    plans,
    currentStatus,
    trialEndsAt,
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

            const { token } = await res.json()

            // Load Midtrans Snap
            const snapScript = document.createElement('script')
            snapScript.src = process.env.NEXT_PUBLIC_MIDTRANS_SNAP_URL || 'https://app.sandbox.midtrans.com/snap/snap.js'
            snapScript.setAttribute('data-client-key', process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || '')

            snapScript.onload = () => {
                // @ts-ignore
                window.snap.pay(token, {
                    onSuccess: function () {
                        router.push('/dashboard/subscription/success')
                    },
                    onPending: function () {
                        router.push('/dashboard/subscription/pending')
                    },
                    onError: function () {
                        router.push('/dashboard/subscription/error')
                    },
                    onClose: function () {
                        setLoading(false)
                        setSelectedPlan(null)
                    },
                })
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
                    <p className="text-gray-600">
                        Status saat ini: <span className="font-semibold">{currentStatus}</span>
                        {trialEndsAt && (
                            <span className="ml-2 text-sm text-gray-500">
                                (Trial berakhir: {new Date(trialEndsAt).toLocaleDateString('id-ID')})
                            </span>
                        )}
                    </p>
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
                                <div className="flex items-center text-sm text-gray-700">
                                    <svg
                                        className="w-5 h-5 text-green-500 mr-2"
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
                                        className="w-5 h-5 text-green-500 mr-2"
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
                                        className="w-5 h-5 text-green-500 mr-2"
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
                                    <span>Laporan lengkap</span>
                                </div>
                                <div className="flex items-center text-sm text-gray-700">
                                    <svg
                                        className="w-5 h-5 text-green-500 mr-2"
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
                                    <span>Support prioritas</span>
                                </div>
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
                        <li>• Pembayaran dilakukan melalui Midtrans dengan berbagai metode (VA, e-wallet, kartu kredit, dll)</li>
                        <li>• Langganan berlaku 30 hari sejak pembayaran berhasil</li>
                        <li>• Anda dapat upgrade atau downgrade paket kapan saja</li>
                        <li>• Hubungi support untuk bantuan lebih lanjut</li>
                    </ul>
                </div>
            </div>
        </div>
    )
}
