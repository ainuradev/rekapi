import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isSuperAdmin } from '@/lib/auth-admin'
import AdminClient, {
    AdminUserItem,
    AdminBusinessItem,
    AdminSaleItem,
    PlatformMetrics,
    SubscriptionPlanItem,
} from './admin-client'

export const dynamic = 'force-dynamic'

interface ProfileRow {
    id: string
    full_name: string | null
    role: string | null
    business_id: string | null
    branch_id: string | null
    created_at: string
    branches: { id: string; name: string } | null
    businesses: {
        id: string
        name: string
        subscription_status: string | null
        trial_ends_at: string | null
        subscription_expires_at: string | null
        subscription_plan_id: string | null
        created_at: string
    } | null
}

interface BusinessRow {
    id: string
    name: string
    subscription_status: string | null
    trial_ends_at: string | null
    subscription_expires_at: string | null
    subscription_plan_id: string | null
    created_at: string
    branches: { id: string; name: string }[] | null
    subscription_plans: { id: string; code: string; name: string; max_branches: number; max_employees: number } | null
}

interface SaleRow {
    id: string
    business_id: string | null
    branch_id: string | null
    user_id: string | null
    total: number | null
    channel: string | null
    payment_method: string | null
    created_at: string
    businesses: { name: string } | null
    branches: { name: string } | null
}

interface UserIdentityItem {
    provider?: string
}

function calculateRemainingDays(targetDateStr: string | null, subStatus?: string): { daysRemaining: number; isExpired: boolean } {
    if (!targetDateStr) return { daysRemaining: 0, isExpired: false }
    const ms = new Date(targetDateStr).getTime() - Date.now()
    return {
        daysRemaining: Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24))),
        isExpired: subStatus === 'expired' || ms <= 0,
    }
}

export default async function AdminPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user || !isSuperAdmin(user.email)) {
        redirect('/dashboard')
    }

    const admin = createAdminClient()

    // 1. Ambil daftar user auth (hingga 1000 user)
    const {
        data: { users },
    } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
    })

    // 2. Ambil profil beserta relasi
    const { data: profiles } = await admin
        .from('profiles')
        .select(
            'id, full_name, role, business_id, branch_id, created_at, branches(id, name), businesses(id, name, subscription_status, trial_ends_at, subscription_expires_at, subscription_plan_id, created_at)'
        )

    // 3. Ambil semua bisnis, cabang, dan paket langganan
    const { data: businesses } = await admin
        .from('businesses')
        .select(
            'id, name, subscription_status, trial_ends_at, subscription_expires_at, subscription_plan_id, created_at, branches(id, name), subscription_plans(id, code, name, max_branches, max_employees)'
        )
        .order('created_at', { ascending: false })

    // 4. Ambil master subscription_plans
    const { data: plans } = await admin
        .from('subscription_plans')
        .select('id, code, name, price, max_branches, max_employees, duration_days')
        .order('price', { ascending: true })

    // 5. Ambil ringkasan penjualan (sales)
    const { data: allSales } = await admin
        .from('sales')
        .select(
            'id, business_id, branch_id, user_id, total, channel, payment_method, created_at, businesses(name), branches(name)'
        )
        .order('created_at', { ascending: false })

    const salesList = (allSales ?? []) as unknown as SaleRow[]
    const userListRaw = users ?? []
    const profileList = (profiles ?? []) as unknown as ProfileRow[]
    const businessList = (businesses ?? []) as unknown as BusinessRow[]
    const planList: SubscriptionPlanItem[] = (plans ?? []).map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        price: Number(p.price || 0),
        maxBranches: p.max_branches,
        maxEmployees: p.max_employees,
        durationDays: p.duration_days || 28,
    }))

    // Agregasi penjualan per bisnis & user
    const salesByBusiness: Record<string, { count: number; total: number }> = {}
    const salesByUser: Record<string, { count: number; total: number }> = {}

    for (const s of salesList) {
        const amt = Number(s.total || 0)
        if (s.business_id) {
            if (!salesByBusiness[s.business_id]) {
                salesByBusiness[s.business_id] = { count: 0, total: 0 }
            }
            salesByBusiness[s.business_id].count += 1
            salesByBusiness[s.business_id].total += amt
        }
        if (s.user_id) {
            if (!salesByUser[s.user_id]) {
                salesByUser[s.user_id] = { count: 0, total: 0 }
            }
            salesByUser[s.user_id].count += 1
            salesByUser[s.user_id].total += amt
        }
    }

    // Mapping item pengguna
    const enrichedUsers: AdminUserItem[] = userListRaw.map((u) => {
        const prof = profileList.find((p) => p.id === u.id)
        const b = prof?.businesses
        const br = prof?.branches

        const subStatus = b?.subscription_status ?? 'trial'
        const effectiveExpiry = subStatus === 'active' ? b?.subscription_expires_at : b?.trial_ends_at
        const { daysRemaining, isExpired } = calculateRemainingDays(effectiveExpiry ?? null, subStatus)

        // Cek cabang bisnis
        const bizItem = businessList.find((item) => item.id === prof?.business_id)
        const branchCount = bizItem?.branches ? bizItem.branches.length : 0

        // Provider: google atau email
        const identities = (u.identities ?? []) as UserIdentityItem[]
        const isGoogle =
            u.app_metadata?.provider === 'google' ||
            identities.some((i) => i.provider === 'google')

        const uSales = salesByUser[u.id] ?? { count: 0, total: 0 }

        return {
            id: u.id,
            email: u.email ?? 'Tanpa Email',
            fullName: prof?.full_name || 'Tanpa Nama',
            role: prof?.role === 'pegawai' ? 'pegawai' : 'owner',
            provider: isGoogle ? 'google' : 'email',
            createdAt: u.created_at,
            lastSignInAt: u.last_sign_in_at ?? null,
            businessId: prof?.business_id ?? null,
            businessName: b?.name ?? 'Belum ada bisnis',
            branchId: prof?.branch_id ?? null,
            branchName: br?.name ?? null,
            subscriptionStatus: subStatus,
            trialEndsAt: b?.trial_ends_at ?? null,
            subscriptionExpiresAt: b?.subscription_expires_at ?? null,
            effectiveExpiresAt: effectiveExpiry ?? null,
            daysRemaining,
            isExpired,
            branchCount,
            salesCount: uSales.count,
            salesVolume: uSales.total,
        }
    })

    // Mapping item bisnis
    const enrichedBusinesses: AdminBusinessItem[] = businessList.map((b) => {
        const subStatus = b.subscription_status ?? 'trial'
        const effectiveExpiry = subStatus === 'active' ? b.subscription_expires_at : b.trial_ends_at
        const { daysRemaining, isExpired } = calculateRemainingDays(effectiveExpiry ?? null, subStatus)

        const bBranches = b.branches ?? []
        const bEmployees = profileList.filter(
            (p) => p.business_id === b.id && p.role === 'pegawai'
        )
        const bSales = salesByBusiness[b.id] ?? { count: 0, total: 0 }

        // Temukan owner bisnis
        const ownerProf = profileList.find(
            (p) => p.business_id === b.id && p.role === 'owner'
        )
        const ownerAuth = ownerProf ? userListRaw.find((u) => u.id === ownerProf.id) : null

        const planCode = b.subscription_plans?.code ?? (subStatus === 'active' ? 'pro' : null)
        const planName = b.subscription_plans?.name || (subStatus === 'active' ? 'Pro' : 'Trial')

        return {
            id: b.id,
            name: b.name,
            ownerName: ownerProf?.full_name || ownerAuth?.email?.split('@')[0] || 'Belum ada owner',
            ownerEmail: ownerAuth?.email || 'Tanpa Email',
            subscriptionStatus: subStatus,
            planId: b.subscription_plan_id,
            planCode,
            planName,
            trialEndsAt: b.trial_ends_at,
            subscriptionExpiresAt: b.subscription_expires_at,
            effectiveExpiresAt: effectiveExpiry ?? null,
            createdAt: b.created_at,
            branchCount: bBranches.length,
            employeeCount: bEmployees.length,
            salesCount: bSales.count,
            salesVolume: bSales.total,
            daysRemaining,
            isExpired,
        }
    })

    // Mapping 30 transaksi terbaru
    const recentSalesFormatted: AdminSaleItem[] = salesList.slice(0, 30).map((s) => ({
        id: s.id,
        businessName: s.businesses?.name ?? 'Bisnis',
        branchName: s.branches?.name ?? 'Cabang',
        total: Number(s.total || 0),
        channel: s.channel ?? 'offline',
        paymentMethod: s.payment_method ?? 'cash',
        createdAt: s.created_at,
    }))

    // Platform metrics
    let trialActiveCount = 0
    let trialExpiredCount = 0
    let subscribedCount = 0
    let standardCount = 0
    let businessTierCount = 0
    let proCount = 0

    enrichedBusinesses.forEach((b) => {
        if (b.subscriptionStatus === 'active') {
            subscribedCount += 1
            if (b.planCode === 'standard') standardCount += 1
            else if (b.planCode === 'business') businessTierCount += 1
            else proCount += 1
        } else if (b.isExpired) {
            trialExpiredCount += 1
        } else {
            trialActiveCount += 1
        }
    })

    const totalRevenue = salesList.reduce((acc, s) => acc + Number(s.total || 0), 0)
    const totalBranches = businessList.reduce(
        (acc, b) => acc + (b.branches ? b.branches.length : 0),
        0
    )

    const metrics: PlatformMetrics = {
        totalUsers: userListRaw.length,
        totalOwners: enrichedUsers.filter((u) => u.role === 'owner').length,
        totalEmployees: enrichedUsers.filter((u) => u.role === 'pegawai').length,
        totalBusinesses: businessList.length,
        trialActiveCount,
        trialExpiredCount,
        subscribedCount,
        standardCount,
        businessTierCount,
        proCount,
        totalBranches,
        totalSalesCount: salesList.length,
        totalPlatformRevenue: totalRevenue,
    }

    return (
        <AdminClient
            users={enrichedUsers}
            businesses={enrichedBusinesses}
            recentSales={recentSalesFormatted}
            metrics={metrics}
            plans={planList}
        />
    )
}
