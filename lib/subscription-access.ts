// Subscription access control utilities — feature flags come from the DB, not hard-coded plan codes.

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'canceled' | 'pending'

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

    // During trial, no advanced features
    if (subscription.status === 'trial') {
        return {
            allowed: false,
            reason: 'Fitur analisis lanjutan hanya tersedia untuk paket berbayar. Upgrade sekarang!',
        }
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
