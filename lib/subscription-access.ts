// Subscription access control utilities — feature flags come from the DB, not hard-coded plan codes.

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'canceled' | 'pending'

export type PlanTier = 'trial' | 'standard' | 'business' | 'pro'

export type GatedModule =
    | 'raw_materials'     // /dashboard/bahan-baku (Min: business)
    | 'cash_accounts'     // /dashboard/keuangan/kas-rekening (Min: business)
    | 'debts_receivables' // /dashboard/keuangan/utang-piutang (Min: business)
    | 'capital_equity'    // /dashboard/keuangan/modal (Min: pro)
    | 'cash_flow_report'  // /dashboard/keuangan/arus-kas (Min: pro)
    | 'balance_sheet'     // /dashboard/keuangan/neraca (Min: pro)

export interface ModuleAccessResult {
    allowed: boolean
    requiredPlan: 'business' | 'pro'
    reason?: string
}

export interface CheckModuleAccessParams {
    status: SubscriptionStatus | string
    planCode?: string | null
    expiresAt?: string | null
    trialEndsAt?: string | null
}

export interface SubscriptionData {
    status: SubscriptionStatus
    planCode: string | null
    expiresAt: string | null
    trialEndsAt: string | null
    /** Feature flags sourced from subscription_plans in the DB */
    planFeatures?: {
        can_advanced_reports: boolean
        can_api_access: boolean
    } | null
}

/**
 * Resolusi tier langganan aktif:
 * - 'trial': Masa uji coba 7 hari masih aktif
 * - 'pro': Paket Pro aktif
 * - 'business': Paket Business aktif
 * - 'standard': Paket Standard aktif atau fallback default
 */
export function getSubscriptionPlanTier(sub: {
    status: string
    planCode?: string | null
    trialEndsAt?: string | null
    expiresAt?: string | null
}): PlanTier {
    if (sub.status === 'trial') {
        return 'trial'
    }
    const code = (sub.planCode || '').toLowerCase().trim()
    if (code === 'pro') return 'pro'
    if (code === 'business') return 'business'
    return 'standard'
}

/**
 * Pengecekan Value-Based Feature Gating per modul:
 * 1. Standard (Rp 49.000): Bahan baku, Kas rekening, Utang piutang terkunci (Min: Business).
 *    Modal prive, Arus kas, Neraca SAK EMKM terkunci (Min: Pro).
 * 2. Business (Rp 99.000): Bahan baku, Kas rekening, Utang piutang terbuka.
 *    Modal prive, Arus kas, Neraca SAK EMKM terkunci (Min: Pro).
 * 3. Pro (Rp 179.000) & Trial Aktif: Seluruh 6 modul terbuka penuh.
 */
export function checkModuleAccess(
    sub: CheckModuleAccessParams,
    module: GatedModule
): ModuleAccessResult {
    const isProRequired =
        module === 'capital_equity' ||
        module === 'cash_flow_report' ||
        module === 'balance_sheet'

    const requiredPlan: 'business' | 'pro' = isProRequired ? 'pro' : 'business'

    // Pastikan masa aktif langganan / trial masih valid
    const active = hasActiveAccess({
        status: (sub.status as SubscriptionStatus) || 'expired',
        planCode: sub.planCode || null,
        expiresAt: sub.expiresAt || null,
        trialEndsAt: sub.trialEndsAt || null,
    })

    if (!active) {
        return {
            allowed: false,
            requiredPlan,
            reason:
                sub.status === 'trial'
                    ? 'Masa trial 7 hari telah berakhir. Silakan pilih paket langganan untuk mengakses fitur ini.'
                    : 'Masa aktif langganan telah berakhir. Silakan perpanjang paket untuk mengakses fitur ini.',
        }
    }

    // Selama masa trial 7 hari masih aktif, berikan akses penuh setara Pro
    if (sub.status === 'trial') {
        return { allowed: true, requiredPlan }
    }

    const tier = getSubscriptionPlanTier(sub)

    if (tier === 'pro') {
        return { allowed: true, requiredPlan }
    }

    if (tier === 'business') {
        if (isProRequired) {
            return {
                allowed: false,
                requiredPlan: 'pro',
                reason: 'Modul ini eksklusif untuk paket Pro. Tingkatkan paket bisnis Anda untuk membuka akses.',
            }
        }
        return { allowed: true, requiredPlan }
    }

    // tier === 'standard'
    return {
        allowed: false,
        requiredPlan,
        reason: isProRequired
            ? 'Modul ini eksklusif untuk paket Pro. Tingkatkan paket bisnis Anda untuk membuka akses.'
            : 'Modul ini tersedia mulai dari paket Business. Tingkatkan paket bisnis Anda untuk membuka akses.',
    }
}

/**
 * Check if the business has active access (trial or paid subscription)
 */
export function hasActiveAccess(subscription: SubscriptionData): boolean {
    const now = new Date()

    // Check trial access
    if (subscription.status === 'trial' && subscription.trialEndsAt) {
        const trialEnd = new Date(subscription.trialEndsAt)
        if (now <= trialEnd) {
            return true
        }
    }

    // Check paid subscription access
    if (subscription.status === 'active' && subscription.expiresAt) {
        const subscriptionEnd = new Date(subscription.expiresAt)
        if (now <= subscriptionEnd) {
            return true
        }
    }

    return false
}

/**
 * Check if user can access advanced reports.
 * Reads the `can_advanced_reports` flag from the DB plan row when available;
 * falls back to checking plan code only if the DB flag is not provided.
 */
export function canAccessAdvancedReports(
    subscription: SubscriptionData
): { allowed: boolean; reason?: string } {
    if (!hasActiveAccess(subscription)) {
        return {
            allowed: false,
            reason: 'Langganan Anda telah berakhir. Silakan perpanjang untuk mengakses fitur ini.',
        }
    }

    // Selama masa trial 7 hari masih aktif, berikan akses penuh setara Pro
    if (subscription.status === 'trial') {
        return { allowed: true }
    }

    // Prefer DB-sourced flag; fall back to plan code for backward compatibility
    const canAccess = subscription.planFeatures != null
        ? subscription.planFeatures.can_advanced_reports
        : subscription.planCode === 'business' || subscription.planCode === 'pro'

    if (!canAccess) {
        return {
            allowed: false,
            reason: 'Fitur ini hanya tersedia untuk paket Business dan Pro. Upgrade paket Anda!',
        }
    }

    return { allowed: true }
}

/**
 * Check if user can access API features.
 * Reads the `can_api_access` flag from the DB plan row when available.
 */
export function canAccessAPI(
    subscription: SubscriptionData
): { allowed: boolean; reason?: string } {
    if (!hasActiveAccess(subscription)) {
        return {
            allowed: false,
            reason: 'Langganan Anda telah berakhir. Silakan perpanjang untuk mengakses API.',
        }
    }

    if (subscription.status === 'trial') {
        return {
            allowed: false,
            reason: 'Akses API tidak tersedia selama masa trial. Upgrade ke paket Pro!',
        }
    }

    // Prefer DB-sourced flag; fall back to plan code for backward compatibility
    const canAccess = subscription.planFeatures != null
        ? subscription.planFeatures.can_api_access
        : subscription.planCode === 'pro'

    if (!canAccess) {
        return {
            allowed: false,
            reason: 'Akses API hanya tersedia untuk paket Pro. Upgrade sekarang!',
        }
    }

    return { allowed: true }
}

/**
 * Get user-friendly message for expired subscription
 */
export function getExpiredMessage(subscription: SubscriptionData): string {
    if (subscription.status === 'trial') {
        return 'Masa trial 7 hari Anda telah berakhir. Pilih paket langganan untuk melanjutkan.'
    }
    return 'Langganan Anda telah berakhir. Perpanjang langganan untuk melanjutkan menggunakan Rekapi.'
}

export class SubscriptionExpiredError extends Error {
    constructor(
        message = 'Masa aktif langganan atau trial Anda telah berakhir. Silakan perpanjang paket langganan Anda.'
    ) {
        super(message)
        this.name = 'SubscriptionExpiredError'
    }
}

/**
 * Guard untuk Server Actions mutasi bisnis.
 * Memastikan bisnis pengguna memiliki langganan yang masih aktif (trial atau berbayar).
 */
export async function checkActiveSubscription(
    businessId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabaseClient: any
): Promise<{ allowed: boolean; error?: string }> {
    if (!businessId) {
        return { allowed: false, error: 'Identitas bisnis tidak valid.' }
    }

    const { data: business, error } = await supabaseClient
        .from('businesses')
        .select('id, subscription_status, trial_ends_at, subscription_expires_at')
        .eq('id', businessId)
        .single()

    if (error || !business) {
        return { allowed: false, error: 'Data langganan bisnis tidak ditemukan.' }
    }

    const active = hasActiveAccess({
        status: (business.subscription_status as SubscriptionStatus) || 'expired',
        planCode: null,
        expiresAt: business.subscription_expires_at,
        trialEndsAt: business.trial_ends_at,
    })

    if (!active) {
        return {
            allowed: false,
            error:
                business.subscription_status === 'trial'
                    ? 'Masa trial 7 hari bisnis Anda telah berakhir. Silakan pilih paket langganan untuk melanjutkan.'
                    : 'Masa aktif langganan bisnis Anda telah berakhir. Silakan perpanjang paket langganan Anda.',
        }
    }

    return { allowed: true }
}

/**
 * Memastikan bisnis memiliki akses aktif, melempar SubscriptionExpiredError jika kedaluwarsa.
 */
export async function requireActiveSubscription(
    businessId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabaseClient: any
): Promise<void> {
    const res = await checkActiveSubscription(businessId, supabaseClient)
    if (!res.allowed) {
        throw new SubscriptionExpiredError(res.error)
    }
}

/**
 * Guard untuk Server Actions mutasi modul berjenjang (Business / Pro).
 * Memastikan masa aktif langganan masih valid DAN tier paket mencukupi untuk modul tersebut.
 */
export async function checkServerModuleAccess(
    businessId: string,
    module: GatedModule,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabaseClient: any
): Promise<{ allowed: boolean; error?: string }> {
    if (!businessId) {
        return { allowed: false, error: 'Identitas bisnis tidak valid.' }
    }

    const { data: business, error } = await supabaseClient
        .from('businesses')
        .select('id, subscription_status, trial_ends_at, subscription_expires_at, subscription_plans(code, name)')
        .eq('id', businessId)
        .single()

    if (error || !business) {
        return { allowed: false, error: 'Data langganan bisnis tidak ditemukan.' }
    }

    const plans = business.subscription_plans as { code?: string; name?: string } | { code?: string; name?: string }[] | null
    const planObj = Array.isArray(plans) ? plans[0] : plans
    const planCode = planObj?.code || null

    const access = checkModuleAccess(
        {
            status: (business.subscription_status as SubscriptionStatus) || 'expired',
            planCode,
            expiresAt: business.subscription_expires_at,
            trialEndsAt: business.trial_ends_at,
        },
        module
    )

    if (!access.allowed) {
        return {
            allowed: false,
            error: access.reason || `Fitur ini memerlukan paket ${access.requiredPlan === 'pro' ? 'Pro' : 'Business'}.`,
        }
    }

    return { allowed: true }
}
