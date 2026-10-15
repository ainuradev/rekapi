import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { syncPaymentStatus } from '@/lib/midtrans/sync'

interface SuccessProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function SubscriptionSuccessPage({ searchParams }: SuccessProps) {
    const params = await searchParams
    const orderId = typeof params.order_id === 'string' ? params.order_id : ''
    const transactionStatus =
        typeof params.transaction_status === 'string' ? params.transaction_status : ''

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // 1. Jika ada order_id, lakukan verifikasi langsung ke Midtrans/DB
    if (orderId) {
        const syncResult = await syncPaymentStatus(orderId)

        // Jika transaksi dibatalkan / gagal / expire
        if (
            syncResult.paymentStatus === 'cancel' ||
            syncResult.paymentStatus === 'expire' ||
            syncResult.paymentStatus === 'deny' ||
            transactionStatus === 'cancel' ||
            transactionStatus === 'deny' ||
            transactionStatus === 'expire'
        ) {
            redirect(`/dashboard/subscription/unfinish?order_id=${encodeURIComponent(orderId)}`)
        }

        // Jika transaksi masih pending (misal menunggu transfer VA / kasir minimarket)
        if (
            syncResult.paymentStatus === 'pending' ||
            transactionStatus === 'pending'
        ) {
            redirect(`/dashboard/subscription/pending?order_id=${encodeURIComponent(orderId)}`)
        }

        // Jika status bukan settlement, arahkan ke error
        if (syncResult.paymentStatus !== 'settlement') {
            redirect(`/dashboard/subscription/error?order_id=${encodeURIComponent(orderId)}`)
        }
    } else {
        // 2. Jika tidak ada order_id di URL, cek apakah bisnis user saat ini memang memiliki langganan aktif
        const { data: profile } = await supabase
            .from('profiles')
            .select('business_id, businesses(subscription_status)')
            .eq('id', user.id)
            .single()

        const businessStatus = (profile as any)?.businesses?.subscription_status

        // Jika statusnya bukan active, cegah akses langsung dan kembalikan ke pilihan paket
        if (businessStatus !== 'active') {
            redirect('/dashboard/subscription')
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                <div className="mb-6">
                    <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                        <svg
                            className="w-10 h-10 text-green-600"
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
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Pembayaran Berhasil!</h1>
                    <p className="text-gray-600">
                        Terima kasih! Langganan Anda telah aktif dan tercatat di sistem. Anda sekarang dapat menggunakan semua fitur Rekapi.
                    </p>
                </div>

                <div className="space-y-3">
                    <Link
                        href="/dashboard"
                        className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors text-center"
                    >
                        Kembali ke Dashboard
                    </Link>
                    <Link
                        href="/dashboard/profil"
                        className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-colors text-center"
                    >
                        Lihat Profil Bisnis
                    </Link>
                </div>
            </div>
        </div>
    )
}
