import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
    DEFAULT_PLAN_DURATION_DAYS,
    TRIAL_DURATION_DAYS,
    MAX_EMPLOYEES_PER_BRANCH,
    OFFICIAL_PLAN_CATALOG,
    TRIAL_LIMITS,
    getEffectiveLimits,
    canAddBranch,
    canAddEmployee,
    canAssignEmployeeToBranch,
} from '../lib/subscription-limits.ts'
import {
    hasActiveAccess,
    canAccessAdvancedReports,
    canAccessAPI,
    checkModuleAccess,
    getSubscriptionPlanTier,
} from '../lib/subscription-access.ts'

const ROOT = process.cwd()

describe('Subscription Limits, Official Plan Quotas & Midtrans Sync Consistency', () => {
    test('1. Spesifikasi resmi paket (Standard Rp49k, Business Rp99k, Pro Rp179k / 28 hari) konsisten dengan kuota cabang & kasir', () => {
        assert.equal(DEFAULT_PLAN_DURATION_DAYS, 28)
        assert.equal(TRIAL_DURATION_DAYS, 7)
        assert.equal(MAX_EMPLOYEES_PER_BRANCH, 1)

        // Trial: 7 hari, 1 cabang, 1 pegawai
        assert.equal(TRIAL_LIMITS.max_branches, 1)
        assert.equal(TRIAL_LIMITS.max_employees, 1)
        assert.equal(TRIAL_LIMITS.duration_days, 7)
        assert.equal(TRIAL_LIMITS.can_advanced_reports, false)
        assert.equal(TRIAL_LIMITS.can_api_access, false)

        // Standard: Rp49.000 (coret Rp149.000) / 28 hari, 1 cabang, 1 pegawai
        assert.equal(OFFICIAL_PLAN_CATALOG.standard.price, 49_000)
        assert.equal(OFFICIAL_PLAN_CATALOG.standard.original_price, 149_000)
        assert.equal(OFFICIAL_PLAN_CATALOG.standard.duration_days, 28)
        assert.equal(OFFICIAL_PLAN_CATALOG.standard.max_branches, 1)
        assert.equal(OFFICIAL_PLAN_CATALOG.standard.max_employees, 1)
        assert.equal(OFFICIAL_PLAN_CATALOG.standard.can_advanced_reports, false)
        assert.equal(OFFICIAL_PLAN_CATALOG.standard.can_api_access, false)

        // Business: Rp99.000 (coret Rp299.000) / 28 hari, 3 cabang, 3 pegawai
        assert.equal(OFFICIAL_PLAN_CATALOG.business.price, 99_000)
        assert.equal(OFFICIAL_PLAN_CATALOG.business.original_price, 299_000)
        assert.equal(OFFICIAL_PLAN_CATALOG.business.duration_days, 28)
        assert.equal(OFFICIAL_PLAN_CATALOG.business.max_branches, 3)
        assert.equal(OFFICIAL_PLAN_CATALOG.business.max_employees, 3)
        assert.equal(OFFICIAL_PLAN_CATALOG.business.can_advanced_reports, true)
        assert.equal(OFFICIAL_PLAN_CATALOG.business.can_api_access, false)

        // Pro: Rp179.000 (coret Rp499.000) / 28 hari, 5 cabang, 5 pegawai
        assert.equal(OFFICIAL_PLAN_CATALOG.pro.price, 179_000)
        assert.equal(OFFICIAL_PLAN_CATALOG.pro.original_price, 499_000)
        assert.equal(OFFICIAL_PLAN_CATALOG.pro.duration_days, 28)
        assert.equal(OFFICIAL_PLAN_CATALOG.pro.max_branches, 5)
        assert.equal(OFFICIAL_PLAN_CATALOG.pro.max_employees, 5)
        assert.equal(OFFICIAL_PLAN_CATALOG.pro.can_advanced_reports, true)
        assert.equal(OFFICIAL_PLAN_CATALOG.pro.can_api_access, true)
    })

    test('2. getEffectiveLimits menerapkan default 28 hari untuk paket aktif dan fallback ke TRIAL_LIMITS saat non-aktif', () => {
        // Active plan tanpa duration_days eksplisit tetap default ke 28 hari (bukan 30)
        const activePartial = getEffectiveLimits({ max_branches: 3 }, 'active')
        assert.equal(activePartial.duration_days, 28)
        assert.equal(activePartial.max_branches, 3)
        assert.equal(activePartial.max_employees, 3)

        // Status non-aktif (trial, expired, pending, canceled) dikunci konservatif ke TRIAL_LIMITS
        for (const nonActiveStatus of ['trial', 'expired', 'pending', 'canceled']) {
            const resolved = getEffectiveLimits(OFFICIAL_PLAN_CATALOG.pro, nonActiveStatus)
            assert.deepEqual(resolved, TRIAL_LIMITS, `Status ${nonActiveStatus} wajib fallback ke TRIAL_LIMITS`)
        }
    })

    test('3. canAddBranch menegakkan batas cabang per paket (1 / 3 / 5) dan menolak saat penuh', () => {
        // Trial: maks 1 cabang
        assert.equal(canAddBranch(0, null, 'trial').allowed, true)
        const trialBlocked = canAddBranch(1, null, 'trial')
        assert.equal(trialBlocked.allowed, false)
        assert.match(trialBlocked.reason || '', /maksimal 1 cabang/)

        // Standard: maks 1 cabang
        assert.equal(canAddBranch(0, OFFICIAL_PLAN_CATALOG.standard, 'active').allowed, true)
        assert.equal(canAddBranch(1, OFFICIAL_PLAN_CATALOG.standard, 'active').allowed, false)

        // Business: maks 3 cabang
        assert.equal(canAddBranch(2, OFFICIAL_PLAN_CATALOG.business, 'active').allowed, true)
        const bizBlocked = canAddBranch(3, OFFICIAL_PLAN_CATALOG.business, 'active')
        assert.equal(bizBlocked.allowed, false)
        assert.match(bizBlocked.reason || '', /maksimal 3 cabang/)

        // Pro: maks 5 cabang
        assert.equal(canAddBranch(4, OFFICIAL_PLAN_CATALOG.pro, 'active').allowed, true)
        const proBlocked = canAddBranch(5, OFFICIAL_PLAN_CATALOG.pro, 'active')
        assert.equal(proBlocked.allowed, false)
        assert.match(proBlocked.reason || '', /maksimal 5 cabang/)
    })

    test('4. canAddEmployee & canAssignEmployeeToBranch menegakkan kuota kasir (1 / 3 / 5) dan aturan 1 pegawai per cabang', () => {
        // Trial & Standard: maks 1 pegawai
        assert.equal(canAddEmployee(0, null, 'trial').allowed, true)
        assert.equal(canAddEmployee(1, null, 'trial').allowed, false)
        assert.equal(canAddEmployee(1, OFFICIAL_PLAN_CATALOG.standard, 'active').allowed, false)

        // Business: maks 3 pegawai
        assert.equal(canAddEmployee(2, OFFICIAL_PLAN_CATALOG.business, 'active').allowed, true)
        assert.equal(canAddEmployee(3, OFFICIAL_PLAN_CATALOG.business, 'active').allowed, false)

        // Pro: maks 5 pegawai
        assert.equal(canAddEmployee(4, OFFICIAL_PLAN_CATALOG.pro, 'active').allowed, true)
        const proEmpBlocked = canAddEmployee(5, OFFICIAL_PLAN_CATALOG.pro, 'active')
        assert.equal(proEmpBlocked.allowed, false)
        assert.match(proEmpBlocked.reason || '', /maksimal 5 akun pegawai/)

        // Aturan 1 cabang = 1 akun pegawai
        assert.equal(canAssignEmployeeToBranch(0, 'Cabang Utama').allowed, true)
        const branchOccupied = canAssignEmployeeToBranch(1, 'Cabang Utama')
        assert.equal(branchOccupied.allowed, false)
        assert.match(branchOccupied.reason || '', /Cabang "Cabang Utama" sudah memiliki akun pegawai/)
    })

    test('5. Gating fitur laporan lanjutan dan API sesuai paket aktif', () => {
        const futureIso = new Date(Date.now() + 7 * 86_400_000).toISOString()
        const pastIso = new Date(Date.now() - 86_400_000).toISOString()

        // Trial aktif: akses dasar & laporan lanjutan boleh (setara Pro selama trial), API ditolak
        const trialSub = {
            status: 'trial',
            planCode: null,
            expiresAt: null,
            trialEndsAt: futureIso,
            planFeatures: null,
        }
        assert.equal(hasActiveAccess(trialSub), true)
        assert.equal(canAccessAdvancedReports(trialSub).allowed, true)
        assert.equal(canAccessAPI(trialSub).allowed, false)

        // Standard aktif: laporan lanjutan & API ditolak
        const standardSub = {
            status: 'active',
            planCode: 'standard',
            expiresAt: futureIso,
            trialEndsAt: null,
            planFeatures: { can_advanced_reports: false, can_api_access: false },
        }
        assert.equal(hasActiveAccess(standardSub), true)
        assert.equal(canAccessAdvancedReports(standardSub).allowed, false)
        assert.equal(canAccessAPI(standardSub).allowed, false)

        // Business aktif: laporan lanjutan boleh, API ditolak
        const businessSub = {
            status: 'active',
            planCode: 'business',
            expiresAt: futureIso,
            trialEndsAt: null,
            planFeatures: { can_advanced_reports: true, can_api_access: false },
        }
        assert.equal(canAccessAdvancedReports(businessSub).allowed, true)
        assert.equal(canAccessAPI(businessSub).allowed, false)

        // Pro aktif: laporan lanjutan & API boleh
        const proSub = {
            status: 'active',
            planCode: 'pro',
            expiresAt: futureIso,
            trialEndsAt: null,
            planFeatures: { can_advanced_reports: true, can_api_access: true },
        }
        assert.equal(canAccessAdvancedReports(proSub).allowed, true)
        assert.equal(canAccessAPI(proSub).allowed, true)

        // Expired: semua akses ditolak
        const expiredSub = { ...proSub, expiresAt: pastIso }
        assert.equal(hasActiveAccess(expiredSub), false)
        assert.equal(canAccessAdvancedReports(expiredSub).allowed, false)
    })

    test('6. Sinkronisasi lintas file: Migrasi 0027, API Midtrans, Sync 28 hari, dan INTEGRATION_SUMMARY.md konsisten', () => {
        const mig0027 = fs.readFileSync(
            path.join(ROOT, 'supabase', 'migrations', '0027_update_plan_limits_and_one_employee_per_branch.sql'),
            'utf8'
        )
        const createTxRoute = fs.readFileSync(
            path.join(ROOT, 'app', 'api', 'midtrans', 'create-transaction', 'route.ts'),
            'utf8'
        )
        const syncFile = fs.readFileSync(
            path.join(ROOT, 'lib', 'midtrans', 'sync.ts'),
            'utf8'
        )
        const integrationSummary = fs.readFileSync(
            path.join(ROOT, 'INTEGRATION_SUMMARY.md'),
            'utf8'
        )

        // Verifikasi harga & kuota di migrasi 0027
        assert.match(mig0027, /price\s*=\s*149000[\s\S]*?max_branches\s*=\s*1[\s\S]*?max_employees\s*=\s*1[\s\S]*?where code = 'standard'/i)
        assert.match(mig0027, /price\s*=\s*299000[\s\S]*?max_branches\s*=\s*3[\s\S]*?max_employees\s*=\s*3[\s\S]*?where code = 'business'/i)
        assert.match(mig0027, /price\s*=\s*499000[\s\S]*?max_branches\s*=\s*5[\s\S]*?max_employees\s*=\s*5[\s\S]*?where code = 'pro'/i)

        // Verifikasi siklus 28 hari di create-transaction & sync.ts
        assert.match(createTxRoute, /plan\.duration_days\s*\?\?\s*28/)
        assert.match(syncFile, /duration_days\s*\?\?\s*(28|DEFAULT_PLAN_DURATION_DAYS)/)

        // Verifikasi INTEGRATION_SUMMARY.md tidak lagi memuat harga lama (100k / 300k / 500k / Unlimited)
        assert.doesNotMatch(integrationSummary, /Rp\s*100\.000|Rp\s*300\.000|Rp\s*500\.000/i)
        assert.match(integrationSummary, /149\.000/)
        assert.match(integrationSummary, /299\.000/)
        assert.match(integrationSummary, /499\.000/)
        assert.match(integrationSummary, /28 hari/i)
        assert.match(integrationSummary, /5 cabang/i)
        assert.match(integrationSummary, /cancel-transaction/)
    })

    test('7. Audit statis migrasi 0023-0034: bebas CREATE TRIGGER/POLICY tanpa DROP IF EXISTS & overload RPC bersih', () => {
        const migrationsDir = path.join(ROOT, 'supabase', 'migrations')
        const files = fs
            .readdirSync(migrationsDir)
            .filter((f) => /^00(2[3-9]|3[0-4])_.*\.sql$/.test(f))
            .sort()

        assert.equal(files.length, 12, 'Harus terdapat tepat 12 file migrasi dari 0023 s/d 0034')

        for (const file of files) {
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')

            // Setiap CREATE TRIGGER wajib didahului DROP TRIGGER IF EXISTS untuk nama trigger yang sama
            const triggerMatches = [...sql.matchAll(/create\s+trigger\s+([a-zA-Z0-9_]+)/gi)]
            for (const m of triggerMatches) {
                const trgName = m[1]
                const dropRegex = new RegExp(`drop\\s+trigger\\s+if\\s+exists\\s+${trgName}\\b`, 'i')
                assert.match(sql, dropRegex, `${file}: trigger ${trgName} wajib memiliki DROP TRIGGER IF EXISTS`)
            }

            // Setiap CREATE POLICY wajib didahului DROP POLICY IF EXISTS untuk nama policy yang sama
            const policyMatches = [...sql.matchAll(/create\s+policy\s+"([^"]+)"/gi)]
            for (const m of policyMatches) {
                const polName = m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const dropPolRegex = new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+"${polName}"`, 'i')
                assert.match(sql, dropPolRegex, `${file}: policy "${m[1]}" wajib memiliki DROP POLICY IF EXISTS`)
            }
        }

        // Pastikan overload 7-arg record_purchase_with_stock_atomic dihapus di 0031 & 0034
        const mig0031 = fs.readFileSync(path.join(migrationsDir, '0031_integrate_purchases_finance.sql'), 'utf8')
        const mig0034 = fs.readFileSync(path.join(migrationsDir, '0034_strict_stock_validation_no_oversell.sql'), 'utf8')
        assert.match(mig0031, /drop\s+function\s+if\s+exists\s+record_purchase_with_stock_atomic\(uuid,\s*uuid,\s*uuid,\s*text,\s*date,\s*jsonb,\s*text\)/i)
        assert.match(mig0034, /drop\s+function\s+if\s+exists\s+record_purchase_with_stock_atomic\(uuid,\s*uuid,\s*uuid,\s*text,\s*date,\s*jsonb,\s*text\)/i)
    })

    test('7. Value-Based Feature Gating per modul (Standard vs Business vs Pro vs Trial)', () => {
        const futureIso = new Date(Date.now() + 7 * 86_400_000).toISOString()
        const pastIso = new Date(Date.now() - 86_400_000).toISOString()

        const businessModules = ['raw_materials', 'cash_accounts', 'debts_receivables']
        const proModules = ['capital_equity', 'cash_flow_report', 'balance_sheet']

        const trialSub = { status: 'trial', planCode: null, trialEndsAt: futureIso }
        const standardSub = { status: 'active', planCode: 'standard', expiresAt: futureIso }
        const businessSub = { status: 'active', planCode: 'business', expiresAt: futureIso }
        const proSub = { status: 'active', planCode: 'pro', expiresAt: futureIso }
        const expiredSub = { status: 'expired', planCode: 'pro', expiresAt: pastIso }

        // Verifikasi resolusi tier paket
        assert.equal(getSubscriptionPlanTier(trialSub), 'trial')
        assert.equal(getSubscriptionPlanTier(standardSub), 'standard')
        assert.equal(getSubscriptionPlanTier(businessSub), 'business')
        assert.equal(getSubscriptionPlanTier(proSub), 'pro')

        // 1. Trial Aktif: Semua 6 modul terbuka penuh
        for (const mod of [...businessModules, ...proModules]) {
            const res = checkModuleAccess(trialSub, mod)
            assert.equal(res.allowed, true, `Trial aktif harus membuka modul ${mod}`)
        }

        // 2. Standard Aktif: 3 modul min-business terkunci, 3 modul min-pro terkunci
        for (const mod of businessModules) {
            const res = checkModuleAccess(standardSub, mod)
            assert.equal(res.allowed, false, `Standard tidak boleh mengakses ${mod}`)
            assert.equal(res.requiredPlan, 'business')
        }
        for (const mod of proModules) {
            const res = checkModuleAccess(standardSub, mod)
            assert.equal(res.allowed, false, `Standard tidak boleh mengakses ${mod}`)
            assert.equal(res.requiredPlan, 'pro')
        }

        // 3. Business Aktif: 3 modul min-business terbuka, 3 modul min-pro terkunci
        for (const mod of businessModules) {
            const res = checkModuleAccess(businessSub, mod)
            assert.equal(res.allowed, true, `Business harus membuka ${mod}`)
        }
        for (const mod of proModules) {
            const res = checkModuleAccess(businessSub, mod)
            assert.equal(res.allowed, false, `Business tidak boleh mengakses ${mod}`)
            assert.equal(res.requiredPlan, 'pro')
        }

        // 4. Pro Aktif: Semua 6 modul terbuka penuh
        for (const mod of [...businessModules, ...proModules]) {
            const res = checkModuleAccess(proSub, mod)
            assert.equal(res.allowed, true, `Pro harus membuka ${mod}`)
        }

        // 5. Expired: Semua modul ditolak
        for (const mod of [...businessModules, ...proModules]) {
            const res = checkModuleAccess(expiredSub, mod)
            assert.equal(res.allowed, false, `Expired tidak boleh membuka ${mod}`)
        }
    })
})

