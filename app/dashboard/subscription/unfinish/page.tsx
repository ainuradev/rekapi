import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cancelPendingTransaction } from '@/lib/midtrans/sync'

interface UnfinishProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function SubscriptionUnfinishPage({ searchParams }: UnfinishProps) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, business_id')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'owner' || !profile?.business_id) {
        redirect('/dashboard')
    }

    const params = await searchParams
    const orderId = typeof params.order_id === 'string' ? params.order_id : ''

    if (orderId) {
        await cancelPendingTransaction(orderId, profile.business_id)
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
            <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center">
                <div className="mb-6">
                    <div className="mx-auto w-16 h-16 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mb-4 text-2xl">
                        ⚠️
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Pembayaran Dibatalkan</h1>
                    <p className="text-sm text-slate-600">
                        Anda telah kembali tanpa menyelesaikan transaksi. Pesanan langganan dibatalkan dan tidak ada biaya yang dipotong dari akun Anda.
                    </p>
                </div>

                <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 mb-6 text-xs text-amber-900 text-left">
                    <p className="font-semibold mb-1">Catatan:</p>
                    <p>
                        Jika Anda ingin mengaktifkan atau memperpanjang paket langganan Rekapi, Anda dapat memilih kembali paket langganan kapan saja.
                    </p>
                </div>

                <div className="space-y-3">
                    <Link
                        href="/dashboard/subscription"
                        className="block w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-xl transition text-center text-sm shadow-xs"
                    >
                        Pilih Paket Langganan
                    </Link>
                    <Link
                        href="/dashboard"
                        className="block w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl transition text-center text-sm"
                    >
                        Kembali ke Dashboard
                    </Link>
                </div>
            </div>
        </div>
    )
}
