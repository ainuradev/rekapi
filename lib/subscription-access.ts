// Subscription access control utilities

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'canceled'

export interface SubscriptionData {
    status: SubscriptionStatus
    planCode: string | null
    expiresAt: string | null
    trialEndsAt: string | null
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
 * Check if user can access advanced reports (Business & Pro only)
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
            reason: 'Fitur analisis lanjutan hanya tersedia untuk paket Business dan Pro. Upgrade sekarang!',
        }
    }

    // Check plan level
    if (subscription.planCode === 'standard') {
        return {
            allowed: false,
            reason: 'Fitur ini hanya tersedia untuk paket Business dan Pro. Upgrade paket Anda!',
        }
    }

    if (subscription.planCode === 'business' || subscription.planCode === 'pro') {
        return { allowed: true }
    }

    return {
        allowed: false,
        reason: 'Upgrade ke paket Business atau Pro untuk mengakses fitur ini.',
    }
}

/**
 * Check if user can access API features (Pro only)
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

    if (subscription.planCode !== 'pro') {
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
