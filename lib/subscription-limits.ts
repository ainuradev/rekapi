// Subscription limits enforcement — all limits come from the DB (subscription_plans row).
// Official DB defaults (Migrations 0010, 0011, 0022, 0027) are exported as read-only constants
// for fallback consistency and automated verification.

export const DEFAULT_PLAN_DURATION_DAYS = 28
export const TRIAL_DURATION_DAYS = 7
export const MAX_EMPLOYEES_PER_BRANCH = 1

/**
 * The slice of subscription_plans that this module needs.
 * Pass these values from whichever DB query already has the plan row.
 */
export interface PlanLimits {
    max_branches: number | null      // null = unlimited
    max_employees?: number | null    // null = unlimited
    can_advanced_reports?: boolean
    can_api_access?: boolean
    duration_days?: number
}

export interface OfficialPlanSpec extends PlanLimits {
    code: 'standard' | 'business' | 'pro'
    name: string
    price: number
    max_branches: number
    max_employees: number
    can_advanced_reports: boolean
    can_api_access: boolean
    duration_days: number
}

/**
 * Reference catalog matching Supabase `subscription_plans` (Migration 0027).
 * Runtime enforcement still reads the live DB row passed into `getEffectiveLimits`.
 */
export const OFFICIAL_PLAN_CATALOG: Record<'standard' | 'business' | 'pro', OfficialPlanSpec> = {
    standard: {
        code: 'standard',
        name: 'Standard',
        price: 149_000,
        max_branches: 1,
        max_employees: 1,
        can_advanced_reports: false,
        can_api_access: false,
        duration_days: DEFAULT_PLAN_DURATION_DAYS,
    },
    business: {
        code: 'business',
        name: 'Business',
        price: 299_000,
        max_branches: 3,
        max_employees: 3,
        can_advanced_reports: true,
        can_api_access: false,
        duration_days: DEFAULT_PLAN_DURATION_DAYS,
    },
    pro: {
        code: 'pro',
        name: 'Pro',
        price: 499_000,
        max_branches: 5,
        max_employees: 5,
        can_advanced_reports: true,
        can_api_access: true,
        duration_days: DEFAULT_PLAN_DURATION_DAYS,
    },
}

/**
 * Trial defaults: used when no active plan is present (trial, expired, pending, or canceled).
 */
export const TRIAL_LIMITS: PlanLimits = {
    max_branches: 1,
    max_employees: 1, // 1 cabang = 1 pegawai kasir selama masa trial
    can_advanced_reports: false,
    can_api_access: false,
    duration_days: TRIAL_DURATION_DAYS,
}

/**
 * Resolve the effective plan limits given the subscription context.
 * - `planLimits` is the DB row from `subscription_plans`; pass null when there
 *   is no active paid plan (trial, expired, pending, or canceled).
 * - `subscriptionStatus` guards gated features for non-active states.
 */
export function getEffectiveLimits(
    planLimits: PlanLimits | null,
    subscriptionStatus: string
): PlanLimits {
    if (subscriptionStatus === 'active' && planLimits) {
        return {
            max_branches: planLimits.max_branches,
            max_employees:
                planLimits.max_employees !== undefined
                    ? planLimits.max_employees
                    : planLimits.max_branches,
            can_advanced_reports: planLimits.can_advanced_reports ?? false,
            can_api_access: planLimits.can_api_access ?? false,
            duration_days: planLimits.duration_days ?? DEFAULT_PLAN_DURATION_DAYS,
        }
    }
    // trial / expired / pending / canceled → fall back to conservative trial limits (1 branch, 1 employee)
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
 * Check whether a new employee can be added under the business quota.
 */
export function canAddEmployee(
    currentEmployeeCount: number,
    planLimits: PlanLimits | null,
    subscriptionStatus: string
): { allowed: boolean; reason?: string } {
    const limits = getEffectiveLimits(planLimits, subscriptionStatus)

    if (limits.max_employees === null || limits.max_employees === undefined) {
        return { allowed: true }
    }

    if (currentEmployeeCount >= limits.max_employees) {
        return {
            allowed: false,
            reason: `Paket Anda hanya mendukung maksimal ${limits.max_employees} akun pegawai (1 pegawai per cabang). Upgrade paket untuk menambah cabang & pegawai.`,
        }
    }

    return { allowed: true }
}

/**
 * Check whether a specific branch can accept a new employee assignment (1 branch = max 1 employee).
 */
export function canAssignEmployeeToBranch(
    branchEmployeeCount: number,
    branchName?: string
): { allowed: boolean; reason?: string } {
    if (branchEmployeeCount >= MAX_EMPLOYEES_PER_BRANCH) {
        const label = branchName ? `"${branchName}"` : 'ini'
        return {
            allowed: false,
            reason: `Cabang ${label} sudah memiliki akun pegawai. Setiap cabang hanya dapat memiliki ${MAX_EMPLOYEES_PER_BRANCH} akun pegawai.`,
        }
    }

    return { allowed: true }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface CalculateRenewalExpiryParams {
    currentBusinessStatus: string | null | undefined
    currentBusinessExpiresAt: string | null | undefined
    durationDays: number | null | undefined
    now?: Date
}

/**
 * Hitung tanggal kedaluwarsa baru saat pembayaran paket berstatus `settlement`.
 * - Jika bisnis saat ini berstatus `active` dan `subscription_expires_at` masih di masa depan (`> now`),
 *   sisa masa aktif diakumulasikan dengan `durationDays` paket baru (contoh: sisa 10 hari + 28 hari = 38 hari).
 * - Jika bisnis berstatus `trial`, `expired`, `canceled`, `pending`, atau masa aktif sudah lewat (`<= now`),
 *   masa aktif baru dihitung tepat `durationDays` dimulai dari `now`.
 */
export function calculateSubscriptionRenewalExpiry({
    currentBusinessStatus,
    currentBusinessExpiresAt,
    durationDays,
    now = new Date(),
}: CalculateRenewalExpiryParams): Date {
    const effectiveDurationDays =
        typeof durationDays === 'number' && Number.isFinite(durationDays) && durationDays > 0
            ? durationDays
            : DEFAULT_PLAN_DURATION_DAYS

    const nowMs = now.getTime()
    const existingExpiryMs = currentBusinessExpiresAt
        ? new Date(currentBusinessExpiresAt).getTime()
        : 0

    const shouldAccumulate =
        currentBusinessStatus === 'active' &&
        Number.isFinite(existingExpiryMs) &&
        existingExpiryMs > nowMs

    const baseMs = shouldAccumulate ? existingExpiryMs : nowMs
    return new Date(baseMs + effectiveDurationDays * MS_PER_DAY)
}
