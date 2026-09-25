import { createAdminClient } from '@/lib/supabase/admin'
import AdminClient, {
    AdminUserItem,
    AdminBusinessItem,
    AdminSaleItem,
    PlatformMetrics,
} from './admin-client'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
    const admin = createAdminClient()

    // 1. Ambil semua user dari Auth
    const {
        data: { users },
    } = await admin.auth.admin.listUsers()

    // 2. Ambil profil beserta relasi
    const { data: profiles } = await admin
        .from('profiles')
        .select(
            'id, full_name, role, business_id, branch_id, created_at, branches(id, name), businesses(id, name, subscription_status, trial_ends_at, created_at)'
        )

    // 3. Ambil semua bisnis dan cabangnya
    const { data: businesses } = await admin
        .from('businesses')
        .select('id, name, subscription_status, trial_ends_at, created_at, branches(id, name)')

    // 4. Ambil ringkasan penjualan (sales)
    const { data: allSales } = await admin
        .from('sales')
        .select(
            'id, business_id, branch_id, user_id, total, channel, payment_method, created_at, businesses(name), branches(name)'
        )
        .order('created_at', { ascending: false })

    const salesList = allSales ?? []
    const userListRaw = users ?? []
    const profileList = profiles ?? []
    const businessList = businesses ?? []

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
        const b = (prof as any)?.businesses
        const br = (prof as any)?.branches

        const subStatus = b?.subscription_status ?? 'trial'
        const trialEnd = b?.trial_ends_at ?? null

        let daysRemaining = 0
        let isExpired = false

        if (trialEnd) {
            const ms = new Date(trialEnd).getTime() - Date.now()
            daysRemaining = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
            isExpired = subStatus === 'expired' || ms <= 0
        }

        // Cek cabang bisnis
        const bizItem = businessList.find((item) => item.id === prof?.business_id)
        const branchCount = bizItem?.branches ? (bizItem.branches as any[]).length : 0

        // Provider: google atau email
        const isGoogle =
            u.app_metadata?.provider === 'google' ||
            u.identities?.some((i: any) => i.provider === 'google')

        const uSales = salesByUser[u.id] ?? { count: 0, total: 0 }

        return {
            id: u.id,
            email: u.email ?? 'Tanpa Email',
            fullName: prof?.full_name || 'Tanpa Nama',
            role: prof?.role || 'owner',
            provider: isGoogle ? 'google' : 'email',
            createdAt: u.created_at,
            lastSignInAt: u.last_sign_in_at ?? null,
            businessId: prof?.business_id ?? null,
            businessName: b?.name ?? 'Belum ada bisnis',
            branchId: prof?.branch_id ?? null,
            branchName: br?.name ?? null,
            subscriptionStatus: subStatus,
            trialEndsAt: trialEnd,
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
        const trialEnd = b.trial_ends_at ?? null

        let daysRemaining = 0
        let isExpired = false

        if (trialEnd) {
            const ms = new Date(trialEnd).getTime() - Date.now()
            daysRemaining = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
            isExpired = subStatus === 'expired' || ms <= 0
        }

        const bBranches = (b.branches as any[]) ?? []
        const bEmployees = profileList.filter(
            (p) => p.business_id === b.id && p.role === 'pegawai'
        )
        const bSales = salesByBusiness[b.id] ?? { count: 0, total: 0 }

        return {
            id: b.id,
            name: b.name,
            subscriptionStatus: subStatus,
            trialEndsAt: trialEnd,
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
        businessName: (s as any).businesses?.name ?? 'Bisnis',
        branchName: (s as any).branches?.name ?? 'Cabang',
        total: Number(s.total || 0),
        channel: s.channel ?? 'offline',
        paymentMethod: s.payment_method ?? 'cash',
        createdAt: s.created_at,
    }))

    // Platform metrics
    let trialActiveCount = 0
    let trialExpiredCount = 0
    let subscribedCount = 0

    enrichedBusinesses.forEach((b) => {
        if (b.subscriptionStatus === 'active') {
            subscribedCount += 1
        } else if (b.isExpired) {
            trialExpiredCount += 1
        } else {
            trialActiveCount += 1
        }
    })

    const totalRevenue = salesList.reduce((acc, s) => acc + Number(s.total || 0), 0)
    const totalBranches = businessList.reduce(
        (acc, b) => acc + (b.branches ? (b.branches as any[]).length : 0),
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
        />
    )
}
