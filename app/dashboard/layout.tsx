import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import DashboardNav from './dashboard-nav'
import { isSuperAdmin } from '@/lib/auth-admin'
import { getActiveBranchId } from '@/lib/active-branch'
import { hasActiveAccess, type SubscriptionStatus } from '@/lib/subscription-access'
import { executeAutoDeactivateOnDowngrade } from '@/lib/subscription-downgrade'
import { DashboardNotificationItem } from './notification-actions'

interface ProfileLayoutData {
    role?: string | null
    full_name?: string | null
    business_id?: string | null
    branch_id?: string | null
    is_active?: boolean | null
    branches?: { name: string; address?: string | null; status?: string | null } | null
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
        .select('role, full_name, business_id, branch_id, is_active, branches(name, address, status), businesses(name, subscription_status, trial_ends_at, subscription_expires_at, subscription_plan_id, subscription_plans(name, max_branches))')
        .eq('id', user.id)
        .single()

    const profile = data as unknown as ProfileLayoutData | null

    // Proteksi Kasir Dinonaktifkan: Jika pegawai berstatus is_active = false atau cabangnya tidak aktif
    if (profile?.role === 'pegawai') {
        const isEmployeeInactive = profile.is_active === false
        const isBranchInactive = !profile.branch_id || profile.branches?.status !== 'active'

        if (isEmployeeInactive || isBranchInactive) {
            return (
                <div className="min-h-screen w-full flex items-center justify-center bg-[#f8fafc] px-4 font-sans text-slate-800">
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
                        <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto mb-4">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h1 className="text-base font-bold text-slate-900 mb-2">
                            Akun Kasir atau Cabang Anda Sedang Dinonaktifkan
                        </h1>
                        <p className="text-xs text-slate-500 leading-relaxed mb-6">
                            {isEmployeeInactive
                                ? 'Akun kasir Anda saat ini sedang dinonaktifkan oleh Pemilik Bisnis.'
                                : `Cabang penugasan Anda (${profile.branches?.name || 'Cabang'}) saat ini berstatus non-aktif.`}
                            <br className="my-1" />
                            Silakan hubungi Pemilik Bisnis (Owner) untuk mengaktifkan kembali akun kasir atau cabang Anda.
                        </p>
                        <form action="/api/auth/signout" method="POST">
                            <button
                                type="submit"
                                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
                            >
                                Keluar dari Akun
                            </button>
                        </form>
                    </div>
                </div>
            )
        }
    }

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
    const maxBranches = subscriptionStatus === 'active'
        ? (businessData?.subscription_plans?.max_branches ?? 1)
        : 1

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

    // Ambil semua cabang bisnis untuk branch switcher (diurutkan created_at ASC agar Cabang Utama selalu pertama)
    let branchesList: { id: string; name: string; address?: string | null; code?: string | null; status?: string | null; is_primary?: boolean }[] = []
    if (profile?.business_id) {
        const { data: bList } = await supabase
            .from('branches')
            .select('id, name, address, code, status, created_at')
            .eq('business_id', profile.business_id)
            .order('created_at', { ascending: true })

        if (bList && bList.length > 0) {
            branchesList = bList.map((b, idx) => ({
                id: b.id,
                name: b.name,
                address: b.address,
                code: b.code,
                status: b.status || 'active',
                is_primary: idx === 0 || b.code === 'PUSAT' || b.name.toLowerCase().includes('cabang utama'),
            }))

            // Self-healing kuota cabang: Jika jumlah cabang berstatus active melebihi maxBranches paket aktif
            const activeBranches = branchesList.filter((b) => b.status === 'active')
            if (activeBranches.length > maxBranches) {
                const admin = createAdminClient()
                await executeAutoDeactivateOnDowngrade(profile.business_id, admin)
                // Perbarui branchesList lokal agar segera mencerminkan status terbaru
                const mainBranchId = branchesList.find((b) => b.is_primary)?.id || branchesList[0]?.id
                branchesList = branchesList.map((b) => ({
                    ...b,
                    status: b.id === mainBranchId ? 'active' : 'inactive',
                }))
            }
        } else {
            // Self-healing: jika bisnis belum memiliki cabang sama sekali, otomatis buat Cabang Utama
            const admin = createAdminClient()
            const { data: newBranch } = await admin
                .from('branches')
                .insert({
                    business_id: profile.business_id,
                    name: 'Cabang Utama',
                    code: 'PUSAT',
                    branch_type: 'outlet',
                    status: 'active',
                    address: 'Pusat Operasional',
                })
                .select('id, name, address, code, status, created_at')
                .single()

            if (newBranch) {
                branchesList = [{
                    id: newBranch.id,
                    name: newBranch.name,
                    address: newBranch.address,
                    code: newBranch.code,
                    status: newBranch.status || 'active',
                    is_primary: true,
                }]
            }
        }

        // Sinkronisasi profil jika branch_id belum terisi (kaitkan ke Cabang Utama)
        if (!profile.branch_id && branchesList.length > 0) {
            const admin = createAdminClient()
            await admin
                .from('profiles')
                .update({ branch_id: branchesList[0].id })
                .eq('id', user.id)
        }
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
            // Pastikan cabang yang dipilih dalam cookie berstatus 'active'.
            // Jika cabang tersebut nonaktif, jangan izinkan dipilih dan fallback ke Cabang Utama!
            if (found && found.status === 'active') {
                activeBranchId = found.id
                activeBranchName = found.name
                activeBranchAddress = found.address || 'Pusat Operasional'
            } else if (branchesList.length > 0) {
                const primaryBranch = branchesList.find((b) => b.is_primary && b.status === 'active') || branchesList.find((b) => b.status === 'active') || branchesList[0]
                activeBranchId = primaryBranch.id
                activeBranchName = primaryBranch.name
                activeBranchAddress = primaryBranch.address || 'Pusat Operasional'
            }
        } else if (cookieBranchId === 'all') {
            activeBranchId = 'all'
            activeBranchName = 'Semua Cabang'
            activeBranchAddress = 'Konsolidasi Seluruh Cabang'
        } else if (branchesList.length > 0) {
            // Default ke cabang aktif pertama jika cookie belum ada
            const primaryBranch = branchesList.find((b) => b.is_primary && b.status === 'active') || branchesList.find((b) => b.status === 'active') || branchesList[0]
            activeBranchId = primaryBranch.id
            activeBranchName = primaryBranch.name
            activeBranchAddress = primaryBranch.address || 'Pusat Operasional'
        }
    }

    // Ambil Notifikasi Super Admin & Sistem Toko untuk pengguna saat ini
    let initialNotifications: DashboardNotificationItem[] = []
    if (profile?.business_id) {
        const { data: rawNotifs } = await supabase
            .from('system_notifications')
            .select('id, business_id, title, message, category, action_url, created_at')
            .or(`business_id.is.null,business_id.eq.${profile.business_id}`)
            .order('created_at', { ascending: false })
            .limit(30)

        const notifIds = (rawNotifs ?? []).map((n) => n.id)
        let readNotifIds = new Set<string>()
        if (notifIds.length > 0) {
            const { data: reads } = await supabase
                .from('notification_reads')
                .select('notification_id')
                .eq('user_id', user.id)
                .in('notification_id', notifIds)

            if (reads) {
                readNotifIds = new Set(reads.map((r) => r.notification_id))
            }
        }

        // Peringatan Sistem Toko Otomatis
        const systemAlerts: DashboardNotificationItem[] = []
        if (isExpired) {
            systemAlerts.push({
                id: 'sys_expired',
                business_id: profile.business_id,
                title: 'Masa Langganan Berakhir',
                message: 'Masa aktif paket toko Anda telah berakhir. Segera perpanjang agar seluruh fitur kasir dan pelaporan dapat digunakan kembali.',
                category: 'subscription',
                source: 'system',
                action_url: '/dashboard/subscription',
                created_at: new Date().toISOString(),
                is_read: false,
            })
        } else if (daysRemaining <= 3) {
            systemAlerts.push({
                id: `sys_expiring_${daysRemaining}`,
                business_id: profile.business_id,
                title: 'Masa Aktif Hampir Habis',
                message: `Masa aktif paket toko Anda tersisa ${daysRemaining} hari lagi. Segera perpanjang untuk menjaga kelancaran operasional.`,
                category: 'subscription',
                source: 'system',
                action_url: '/dashboard/subscription',
                created_at: new Date().toISOString(),
                is_read: false,
            })
        }

        const adminNotifs: DashboardNotificationItem[] = (rawNotifs ?? []).map((n) => ({
            id: n.id,
            business_id: n.business_id,
            title: n.title,
            message: n.message,
            category: n.category as DashboardNotificationItem['category'],
            source: 'admin' as const,
            action_url: n.action_url,
            created_at: n.created_at,
            is_read: readNotifIds.has(n.id),
        }))

        initialNotifications = [...systemAlerts, ...adminNotifs]
    }

    return (
        <div className="min-h-screen w-full max-w-full min-w-0 bg-[#f8fafc] text-slate-900 font-sans">
            <DashboardNav
                userId={user.id}
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
                initialNotifications={initialNotifications}
            >
                <main className="flex-1 w-full min-w-0 py-6 pb-24 sm:pb-12 transition-all">
                    {isExpired && (
                        <div className="border-b border-red-200 bg-red-50/90 backdrop-blur-xs px-6 py-3 text-xs text-red-800 flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
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