// Subscription limits enforcement — all limits come from the DB (subscription_plans row).
// Nothing is hard-coded here so the owner can adjust limits in Supabase without code changes.

/**
 * The slice of subscription_plans that this module needs.
 * Pass these values from whichever DB query already has the plan row.
 */
export interface PlanLimits {
    max_branches: number | null      // null = unlimited
    max_employees: number | null     // null = unlimited
    can_advanced_reports: boolean
    can_api_access: boolean
    duration_days: number
}

/**
 * Trial defaults: used when no active plan is present.
 * These are purposely very conservative and are the only place
 * "magic numbers" live — change them here if you change the trial offer.
 */
export const TRIAL_LIMITS: PlanLimits = {
    max_branches: 1,
    max_employees: null, // unlimited during trial
    can_advanced_reports: false,
    can_api_access: false,
    duration_days: 7,
}

/**
 * Resolve the effective plan limits given the subscription context.
 * - `planLimits` is the DB row from `subscription_plans`; pass null when there
 *   is no active paid plan (trial, expired, or canceled).
 * - `subscriptionStatus` guards gated features for non-active states.
 */
export function getEffectiveLimits(
    planLimits: PlanLimits | null,
    subscriptionStatus: string
): PlanLimits {
    if (subscriptionStatus === 'active' && planLimits) {
        return planLimits
    }
    // trial / expired / canceled → fall back to trial limits
    return TRIAL_LIMITS
}

/**
 * Check whether a new branch can be added.
 */
export function canAddBranch(
    currentBranchCount: number,
    planLimits: PlanLimits | null,
    subscriptionStatus: string
): { allowed: boolean; reason?: string } {
    const limits = getEffectiveLimits(planLimits, subscriptionStatus)

    if (limits.max_branches === null) {
        return { allowed: true }
    }

    if (currentBranchCount >= limits.max_branches) {
        return {
            allowed: false,
            reason: `Paket Anda hanya mendukung maksimal ${limits.max_branches} cabang. Upgrade paket untuk menambah cabang.`,
        }
    }

    return { allowed: true }
}

/**
 * Check whether a new employee can be added.
 */
export function canAddEmployee(
    currentEmployeeCount: number,
    planLimits: PlanLimits | null,
    subscriptionStatus: string
): { allowed: boolean; reason?: string } {
    const limits = getEffectiveLimits(planLimits, subscriptionStatus)

    if (limits.max_employees === null) {
        return { allowed: true }
    }

    if (currentEmployeeCount >= limits.max_employees) {
        return {
            allowed: false,
            reason: `Paket Anda hanya mendukung maksimal ${limits.max_employees} pegawai. Upgrade paket untuk menambah pegawai.`,
        }
    }

    return { allowed: true }
}
