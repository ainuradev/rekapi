import Link from 'next/link'

export default function SubscriptionErrorPage() {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                <div className="mb-6">
                    <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                        <svg
                            className="w-10 h-10 text-red-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Pembayaran Gagal</h1>
                    <p className="text-gray-600">
                        Maaf, terjadi kesalahan saat memproses pembayaran Anda. Silakan coba lagi atau hubungi support jika masalah berlanjut.
                    </p>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-800">
                    <p className="font-semibold mb-1">Kemungkinan penyebab:</p>
                    <ul className="text-left space-y-1">
                        <li>• Saldo tidak mencukupi</li>
                        <li>• Transaksi dibatalkan</li>
                        <li>• Masalah jaringan</li>
                        <li>• Batas waktu pembayaran terlewat</li>
                    </ul>
                </div>

                <div className="space-y-3">
                    <Link
                        href="/dashboard/subscription"
                        className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                        Coba Lagi
                    </Link>
                    <Link
                        href="/dashboard"
                        className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                        Kembali ke Dashboard
                    </Link>
                </div>
            </div>
        </div>
    )
}
