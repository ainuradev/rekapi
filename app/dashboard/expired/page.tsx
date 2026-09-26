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

    const businessData = (profile as any)?.businesses
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

                    <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-sm text-blue-800">
                            Untuk melanjutkan menggunakan Rekapi dan mengakses semua fitur kasir, laporan, dan
                            manajemen bisnis Anda, silakan pilih paket langganan.
                        </p>
                    </div>

                    <div className="space-y-3">
                        {profile?.role === 'owner' ? (
                            <>
                                <Link
                                    href="/dashboard/subscription"
                                    className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition"
                                >
                                    Pilih Paket Langganan
                                </Link>
                                <Link
                                    href="/dashboard/profil"
                                    className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-4 rounded-lg transition"
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
                                className="w-full text-gray-500 hover:text-gray-700 text-sm font-medium py-2 transition"
                            >
                                Logout
                            </button>
                        </form>
                    </div>
                </div>

                <p className="text-center text-xs text-gray-500 mt-4">
                    Butuh bantuan?{' '}
                    <a href="mailto:support@rekapi.com" className="text-blue-600 hover:underline">
                        Hubungi Support
                    </a>
                </p>
            </div>
        </div>
    )
}
