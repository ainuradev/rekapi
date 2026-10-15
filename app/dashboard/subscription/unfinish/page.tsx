import Link from 'next/link'
import { cancelPendingTransaction } from '@/lib/midtrans/sync'

interface UnfinishProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function SubscriptionUnfinishPage({ searchParams }: UnfinishProps) {
    const params = await searchParams
    const orderId = typeof params.order_id === 'string' ? params.order_id : ''

    if (orderId) {
        await cancelPendingTransaction(orderId)
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                <div className="mb-6">
                    <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                        <svg
                            className="w-10 h-10 text-amber-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Pembayaran Dibatalkan</h1>
                    <p className="text-gray-600">
                        Anda telah kembali tanpa menyelesaikan transaksi. Pesanan langganan dibatalkan dan tidak ada biaya yang dipotong dari akun Anda.
                    </p>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-800 text-left">
                    <p className="font-medium mb-1">Catatan:</p>
                    <p>
                        Jika Anda ingin mengaktifkan fitur premium Rekapi, Anda dapat memilih kembali paket langganan kapan saja.
                    </p>
                </div>

                <div className="space-y-3">
                    <Link
                        href="/dashboard/subscription"
                        className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors text-center"
                    >
                        Pilih Paket Langganan
                    </Link>
                    <Link
                        href="/dashboard"
                        className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-colors text-center"
                    >
                        Kembali ke Dashboard
                    </Link>
                </div>
            </div>
        </div>
    )
}
