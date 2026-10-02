import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardNav from './dashboard-nav'
import { isSuperAdmin } from '@/lib/auth-admin'

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name, branch_id, branches(name), businesses(name, subscription_status, trial_ends_at, subscription_expires_at)')
        .eq('id', user.id)
        .single()

    const isOwner = profile?.role === 'owner'
    const userName = profile?.full_name || user.email || 'Pengguna'
    const branchName = (profile as any)?.branches?.name ?? null
    const businessData = (profile as any)?.businesses
    const businessName = businessData?.name ?? null
    const subscriptionStatus = businessData?.subscription_status ?? 'trial'
    const trialEndsAt = businessData?.trial_ends_at ?? null
    const subscriptionExpiresAt = businessData?.subscription_expires_at ?? null

    let daysRemaining = 0
    let isExpired = false

    if (subscriptionStatus === 'active' && subscriptionExpiresAt) {
        const msLeft = new Date(subscriptionExpiresAt).getTime() - Date.now()
        daysRemaining = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
        isExpired = msLeft <= 0
    } else if (subscriptionStatus === 'trial' && trialEndsAt) {
        const msLeft = new Date(trialEndsAt).getTime() - Date.now()
        daysRemaining = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
        isExpired = msLeft <= 0
    } else if (subscriptionStatus === 'expired') {
        daysRemaining = 0
        isExpired = true
    }

    return (
        <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans">
            <DashboardNav
                isOwner={isOwner}
                userName={userName}
                branchName={branchName}
                businessName={businessName}
                subscriptionStatus={subscriptionStatus}
                trialEndsAt={trialEndsAt}
                daysRemaining={daysRemaining}
                isExpired={isExpired}
                isSuperAdminUser={isSuperAdmin(user.email)}
            />

            {/* Mobile: pt-20 for top bar, pb-20 for floating mobile nav.
                Desktop: sm:pt-20 sm:pb-12 sm:pl-64 for 64px header and 256px sidebar */}
            <main className="pt-20 pb-24 sm:pt-20 sm:pb-12 sm:pl-64 transition-all">
                {isExpired && (
                    <div className="border-b border-red-200 bg-red-50/90 backdrop-blur-xs px-6 py-3 text-xs text-red-800 flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <span>⚠️</span>
                            <span>
                                <strong>{subscriptionStatus === 'trial' ? 'Masa Trial 7 Hari Berakhir:' : 'Masa Langganan Berakhir:'}</strong>{' '}
                                {subscriptionStatus === 'trial'
                                    ? 'Masa percobaan gratis untuk bisnis Anda telah selesai. Silakan perbarui langganan untuk melanjutkan akses penuh.'
                                    : 'Masa aktif langganan bisnis Anda telah berakhir. Silakan perbarui paket Anda untuk melanjutkan akses.'}
                            </span>
                        </div>
                    </div>
                )}
                <div className="px-4 sm:px-8 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    )
}