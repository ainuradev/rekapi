import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import DashboardNav from './dashboard-nav'
import { isSuperAdmin } from '@/lib/auth-admin'
import { getActiveBranchId } from '@/lib/active-branch'
import { hasActiveAccess, type SubscriptionStatus } from '@/lib/subscription-access'

interface ProfileLayoutData {
    role?: string | null
    full_name?: string | null
    business_id?: string | null
    branch_id?: string | null
    branches?: { name: string; address?: string | null } | null
    businesses?: {
        name: string | null
        subscription_status: string | null
        trial_ends_at: string | null
        subscription_expires_at: string | null
        subscription_plan_id: string | null
        subscription_plans?: { name: string; max_branches: number } | null
    } | null
}

function calculateRemainingDays(targetDateStr: string | null): { daysRemaining: number; isExpired: boolean } {
    if (!targetDateStr) return { daysRemaining: 0, isExpired: false }
    const msLeft = new Date(targetDateStr).getTime() - Date.now()
    return {
        daysRemaining: Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24))),
        isExpired: msLeft <= 0,
    }
}

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

    const { data } = await supabase
        .from('profiles')
        .select('role, full_name, business_id, branch_id, branches(name, address), businesses(name, subscription_status, trial_ends_at, subscription_expires_at, subscription_plan_id, subscription_plans(name, max_branches))')
        .eq('id', user.id)
        .single()

    const profile = data as unknown as ProfileLayoutData | null
    const isOwner = profile?.role === 'owner'
    const userName = profile?.full_name || user.email || 'Pengguna'
    const branchName = profile?.branches?.name ?? null
    const branchAddress = profile?.branches?.address ?? null
    const businessData = profile?.businesses
    const businessName = businessData?.name ?? null
    const subscriptionStatus = businessData?.subscription_status ?? 'trial'
    const trialEndsAt = businessData?.trial_ends_at ?? null
    const subscriptionExpiresAt = businessData?.subscription_expires_at ?? null
    const planName = businessData?.subscription_plans?.name || (subscriptionStatus === 'active' ? 'Pro' : 'Trial')
    const maxBranches = businessData?.subscription_plans?.max_branches || 5

    let daysRemaining = 0
    const active = hasActiveAccess({
        status: (subscriptionStatus as SubscriptionStatus) || 'expired',
        planCode: null,
        expiresAt: subscriptionExpiresAt,
        trialEndsAt: trialEndsAt,
    })
    const isExpired = !active

    if (subscriptionStatus === 'active' && subscriptionExpiresAt) {
        const res = calculateRemainingDays(subscriptionExpiresAt)
        daysRemaining = res.daysRemaining
    } else if (subscriptionStatus === 'trial' && trialEndsAt) {
        const res = calculateRemainingDays(trialEndsAt)
        daysRemaining = res.daysRemaining
    }

    // Hard Lock: Jika langganan expired, hanya izinkan halaman expired, subscription, dan profil
    const headersList = await headers()
    const pathname = headersList.get('x-pathname') || ''
    const isAllowedExpiredPath =
        pathname.startsWith('/dashboard/expired') ||
        pathname.startsWith('/dashboard/subscription') ||
        pathname.startsWith('/dashboard/profil')

    if (isExpired && !isAllowedExpiredPath) {
        redirect('/dashboard/expired')
    }

    if (!isExpired && pathname.startsWith('/dashboard/expired')) {
        redirect('/dashboard')
    }

    // Jika pada halaman expired, tampilkan konten khusus tanpa navbar operasional
    if (isExpired && pathname.startsWith('/dashboard/expired')) {
        return <>{children}</>
    }

    // Ambil semua cabang bisnis untuk branch switcher
    let branchesList: { id: string; name: string; address?: string | null }[] = []
    if (profile?.business_id) {
        const { data: bList } = await supabase
            .from('branches')
            .select('id, name, address')
            .eq('business_id', profile.business_id)
            .order('name')
        if (bList) branchesList = bList
    }

    // Resolusi active branch dari cookie (rekapi_active_branch_id)
    const cookieBranchId = await getActiveBranchId()

    let activeBranchId: string = 'all'
    let activeBranchName: string = 'Semua Cabang'
    let activeBranchAddress: string = 'Konsolidasi Seluruh Cabang'

    if (!isOwner && profile?.branch_id) {
        activeBranchId = profile.branch_id
        activeBranchName = profile.branches?.name || 'Cabang Saya'
        activeBranchAddress = profile.branches?.address || 'Lokasi Kerja'
    } else if (isOwner) {
        if (cookieBranchId && cookieBranchId !== 'all') {
            const found = branchesList.find((b) => b.id === cookieBranchId)
            if (found) {
                activeBranchId = found.id
                activeBranchName = found.name
                activeBranchAddress = found.address || 'Pusat Operasional'
            } else if (branchesList.length > 0) {
                activeBranchId = branchesList[0].id
                activeBranchName = branchesList[0].name
                activeBranchAddress = branchesList[0].address || 'Pusat Operasional'
            }
        } else if (cookieBranchId === 'all') {
            activeBranchId = 'all'
            activeBranchName = 'Semua Cabang'
            activeBranchAddress = 'Konsolidasi Seluruh Cabang'
        } else if (branchesList.length > 0) {
            // Default ke cabang pertama jika cookie belum ada
            activeBranchId = branchesList[0].id
            activeBranchName = branchesList[0].name
            activeBranchAddress = branchesList[0].address || 'Pusat Operasional'
        }
    }

    return (
        <div className="min-h-screen w-full bg-[#f8fafc] text-slate-900 font-sans">
            <DashboardNav
                isOwner={isOwner}
                userName={userName}
                activeBranchId={activeBranchId}
                branchName={activeBranchName}
                branchAddress={activeBranchAddress}
                businessName={businessName}
                subscriptionStatus={subscriptionStatus}
                planName={planName}
                trialEndsAt={trialEndsAt}
                subscriptionExpiresAt={subscriptionExpiresAt}
                daysRemaining={daysRemaining}
                isExpired={isExpired}
                branchesList={branchesList}
                maxBranches={maxBranches}
                isSuperAdminUser={isSuperAdmin(user.email)}
            >
                <main className="flex-1 w-full min-w-0 py-6 pb-24 sm:pb-12 transition-all">
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
                    <div className="px-3 sm:px-8 max-w-7xl mx-auto min-w-0">
                        {children}
                    </div>
                </main>
            </DashboardNav>
        </div>
    )
}