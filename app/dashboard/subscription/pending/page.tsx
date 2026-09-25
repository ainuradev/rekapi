import Link from 'next/link'

export default function SubscriptionPendingPage() {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                <div className="mb-6">
                    <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                        <svg
                            className="w-10 h-10 text-yellow-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Pembayaran Pending</h1>
                    <p className="text-gray-600">
                        Pembayaran Anda sedang diproses. Harap selesaikan pembayaran sesuai instruksi yang diberikan.
                    </p>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-sm text-yellow-800">
                    <p>
                        Jika Anda telah menyelesaikan pembayaran, mohon tunggu beberapa saat untuk konfirmasi.
                        Status langganan akan diperbarui secara otomatis.
                    </p>
                </div>

                <div className="space-y-3">
                    <Link
                        href="/dashboard"
                        className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                        Kembali ke Dashboard
                    </Link>
                    <Link
                        href="/dashboard/subscription"
                        className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                        Lihat Paket Langganan
                    </Link>
                </div>
            </div>
        </div>
    )
}
