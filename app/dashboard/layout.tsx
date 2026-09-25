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
        .select('role, full_name, branch_id, branches(name), businesses(name, subscription_status, trial_ends_at)')
        .eq('id', user.id)
        .single()

    const isOwner = profile?.role === 'owner'
    const userName = profile?.full_name || user.email || 'Pengguna'
    const branchName = (profile as any)?.branches?.name ?? null
    const businessData = (profile as any)?.businesses
    const businessName = businessData?.name ?? null
    const subscriptionStatus = businessData?.subscription_status ?? 'trial'
    const trialEndsAt = businessData?.trial_ends_at ?? null

    let daysRemaining = 0
    let isExpired = false

    if (trialEndsAt) {
        const msLeft = new Date(trialEndsAt).getTime() - Date.now()
        daysRemaining = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
        isExpired = subscriptionStatus === 'expired' || msLeft <= 0
    }

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">
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

            {/* Mobile: pt-14 for mobile top header, pb-16 for mobile bottom nav.
                Desktop: sm:pt-0 sm:pb-0 sm:pl-56 for desktop sidebar */}
            <main className="pt-14 pb-16 sm:pt-0 sm:pb-0 sm:pl-56">
                {isExpired && (
                    <div className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span>⚠️</span>
                            <span>
                                <strong>Masa Trial 7 Hari Berakhir:</strong> Masa percobaan gratis untuk bisnis Anda telah selesai. Silakan hubungi admin atau perbarui langganan untuk melanjutkan akses penuh.
                            </span>
                        </div>
                    </div>
                )}
                {children}
            </main>
        </div>
    )
}