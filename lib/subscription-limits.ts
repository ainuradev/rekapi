// Subscription limits and rules enforcement

export interface SubscriptionLimits {
    maxBranches: number | null // null = unlimited
    canAccessAdvancedReports: boolean
    prioritySupport: boolean
}

export function getSubscriptionLimits(
    planCode: string | null,
    subscriptionStatus: string
): SubscriptionLimits {
    // If no active subscription or trial, use trial limits
    if (subscriptionStatus === 'trial' || subscriptionStatus === 'expired' || !planCode) {
        return {
            maxBranches: 1, // Trial: 1 branch only
            canAccessAdvancedReports: false,
            prioritySupport: false,
        }
    }

    // Active subscription - apply plan limits
    switch (planCode) {
        case 'standard':
            return {
                maxBranches: 3,
                canAccessAdvancedReports: false,
                prioritySupport: false,
            }
        case 'business':
            return {
                maxBranches: 5,
                canAccessAdvancedReports: true,
                prioritySupport: true,
            }
        case 'pro':
            return {
                maxBranches: null, // unlimited
                canAccessAdvancedReports: true,
                prioritySupport: true,
            }
        default:
            // Default to trial limits for unknown plans
            return {
                maxBranches: 1,
                canAccessAdvancedReports: false,
                prioritySupport: false,
            }
    }
}

export function canAddBranch(
    currentBranchCount: number,
    planCode: string | null,
    subscriptionStatus: string
): { allowed: boolean; reason?: string } {
    const limits = getSubscriptionLimits(planCode, subscriptionStatus)

    // Unlimited branches
    if (limits.maxBranches === null) {
        return { allowed: true }
    }

    // Check if limit reached
    if (currentBranchCount >= limits.maxBranches) {
        return {
            allowed: false,
            reason: `Paket Anda hanya mendukung maksimal ${limits.maxBranches} cabang. Upgrade paket untuk menambah cabang.`,
        }
    }

    return { allowed: true }
}
