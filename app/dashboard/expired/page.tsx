import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ExpiredPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, businesses(name, subscription_status)')
        .eq('id', user.id)
        .single()

    interface ProfileWithBizName {
        role: string
        businesses?: {
            name: string | null
            subscription_status: string | null
        } | null
    }

    const businessData = (profile as unknown as ProfileWithBizName | null)?.businesses
    const subscriptionStatus = businessData?.subscription_status || 'expired'
    const businessName = businessData?.name || 'Bisnis Anda'

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="max-w-md w-full">
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
                    <div className="mb-6">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg
                                className="w-8 h-8 text-red-600"
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
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">
                            {subscriptionStatus === 'trial' ? 'Trial Berakhir' : 'Langganan Berakhir'}
                        </h1>
                        <p className="text-gray-600 text-sm">
                            {subscriptionStatus === 'trial'
                                ? 'Masa trial 7 hari Anda untuk ' + businessName + ' telah berakhir.'
                                : 'Langganan Anda untuk ' + businessName + ' telah berakhir.'}
                        </p>
                    </div>

                    <div className="mb-6 p-4 bg-emerald-50 rounded-xl border border-emerald-200/80">
                        <p className="text-sm text-emerald-900 leading-relaxed">
                            Untuk melanjutkan menggunakan Rekapi dan mengakses semua fitur kasir, laporan, dan
                            manajemen bisnis Anda, silakan pilih paket langganan.
                        </p>
                    </div>

                    <div className="space-y-3">
                        {profile?.role === 'owner' ? (
                            <>
                                <Link
                                    href="/dashboard/subscription"
                                    className="block w-full bg-emerald-800 hover:bg-emerald-900 text-white font-semibold py-3 px-4 rounded-xl shadow-md shadow-emerald-900/20 transition text-center"
                                >
                                    Pilih Paket Langganan
                                </Link>
                                <Link
                                    href="/dashboard/profil"
                                    className="block w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 px-4 rounded-xl transition text-center"
                                >
                                    Lihat Profil
                                </Link>
                            </>
                        ) : (
                            <div className="text-sm text-gray-600 p-4 bg-gray-50 rounded-lg">
                                <p className="font-medium mb-2">Anda adalah pegawai</p>
                                <p>
                                    Hubungi owner bisnis Anda untuk memperpanjang langganan. Anda akan dapat
                                    mengakses sistem kembali setelah langganan diperpanjang.
                                </p>
                            </div>
                        )}

                        <form action="/api/auth/signout" method="post">
                            <button
                                type="submit"
                                className="w-full text-gray-500 hover:text-gray-700 text-sm font-medium py-2 transition cursor-pointer"
                            >
                                Logout
                            </button>
                        </form>
                    </div>
                </div>

                <p className="text-center text-xs text-gray-500 mt-4">
                    Butuh bantuan?{' '}
                    <a href="mailto:support@rekapi.com" className="text-emerald-800 font-semibold hover:underline">
                        Hubungi Support
                    </a>
                </p>
            </div>
        </div>
    )
}
