import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { syncPaymentStatus } from '@/lib/midtrans/sync'

interface PendingProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function SubscriptionPendingPage({ searchParams }: PendingProps) {
    const params = await searchParams
    const orderId = typeof params.order_id === 'string' ? params.order_id : ''

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    if (orderId) {
        const syncResult = await syncPaymentStatus(orderId)
        if (syncResult.paymentStatus === 'settlement') {
            redirect(`/dashboard/subscription/success?order_id=${encodeURIComponent(orderId)}`)
        } else if (
            syncResult.paymentStatus === 'cancel' ||
            syncResult.paymentStatus === 'expire' ||
            syncResult.paymentStatus === 'deny'
        ) {
            redirect(`/dashboard/subscription/unfinish?order_id=${encodeURIComponent(orderId)}`)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
            <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center">
                <div className="mb-6">
                    <div className="mx-auto w-16 h-16 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mb-4 text-amber-600">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Menunggu Pembayaran</h1>
                    <p className="text-sm text-slate-600">
                        Pembayaran Anda sedang menunggu proses penyelesaian. Silakan lakukan pembayaran sesuai instruksi bank/QRIS yang dipilih.
                    </p>
                </div>

                <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 mb-6 text-xs text-amber-900 text-left">
                    <p className="font-semibold mb-1">Catatan:</p>
                    <p>
                        Setelah Anda mentransfer atau membayar via QRIS/VA, sistem akan mendeteksi pembayaran secara otomatis. Anda juga dapat menekan tombol &quot;Cek Status Sekarang&quot; di bawah ini.
                    </p>
                </div>

                <div className="space-y-3">
                    {orderId ? (
                        <a
                            href={`/dashboard/subscription/pending?order_id=${encodeURIComponent(orderId)}`}
                            className="inline-flex items-center justify-center gap-2 w-full bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 text-white font-semibold py-2.5 px-4 rounded-xl transition text-center text-sm shadow-2xs cursor-pointer"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span>Cek Status Sekarang</span>
                        </a>
                    ) : null}
                    <Link
                        href="/dashboard/subscription"
                        className="block w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl transition text-center text-sm"
                    >
                        Kembali ke Halaman Langganan
                    </Link>
                </div>
            </div>
        </div>
    )
}
