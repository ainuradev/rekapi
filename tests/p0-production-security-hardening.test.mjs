import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATION_PATH = path.resolve('supabase/migrations/0035_production_security_hardening.sql')
const EMPLOYEE_ACTIONS_PATH = path.resolve('app/dashboard/pegawai/actions.ts')
const ADMIN_PAGE_PATH = path.resolve('app/admin/page.tsx')
const MIDDLEWARE_PATH = path.resolve('middleware.ts')
const LAYOUT_PATH = path.resolve('app/dashboard/layout.tsx')
const PACKAGE_JSON_PATH = path.resolve('package.json')

test('P0-1: Anti Cross-Tenant Takeover in handle_new_user() and addEmployee()', () => {
    const migrationContent = fs.readFileSync(MIGRATION_PATH, 'utf-8')
    const employeeActionsContent = fs.readFileSync(EMPLOYEE_ACTIONS_PATH, 'utf-8')

    // 1. Migration must read strictly from raw_app_meta_data
    assert.match(
        migrationContent,
        /\(new\.raw_app_meta_data->>'invited_business_id'\)::uuid/,
        'Migration 0035 must read invited_business_id strictly from raw_app_meta_data'
    )
    assert.match(
        migrationContent,
        /\(new\.raw_app_meta_data->>'invited_branch_id'\)::uuid/,
        'Migration 0035 must read invited_branch_id strictly from raw_app_meta_data'
    )
    assert.doesNotMatch(
        migrationContent,
        /new\.raw_user_meta_data->>'invited_business_id'/,
        'Migration 0035 must NEVER trust raw_user_meta_data for invited_business_id'
    )
    assert.match(
        migrationContent,
        /'pegawai'::user_role/,
        'Migration 0035 must force invited users to pegawai role'
    )

    // 2. addEmployee server action must supply app_metadata via admin client
    assert.match(
        employeeActionsContent,
        /app_metadata:\s*\{[^}]*invited_business_id:\s*profile\.business_id/s,
        'addEmployee must pass invited_business_id via app_metadata'
    )
    assert.match(
        employeeActionsContent,
        /invited_role:\s*'pegawai'/,
        'addEmployee must pass invited_role as pegawai via app_metadata'
    )
})

test('P0-2: Security Invoker and Strict Tenant Isolation on Reporting Views', () => {
    const migrationContent = fs.readFileSync(MIGRATION_PATH, 'utf-8')

    // Views must specify security_invoker = true
    assert.match(
        migrationContent,
        /create view public\.v_sale_profit\s+with\s*\(\s*security_invoker\s*=\s*true\s*\)/i,
        'v_sale_profit must have security_invoker = true'
    )
    assert.match(
        migrationContent,
        /create view public\.v_daily_recap\s+with\s*\(\s*security_invoker\s*=\s*true\s*\)/i,
        'v_daily_recap must have security_invoker = true'
    )

    // Must filter by auth_business_id()
    assert.match(
        migrationContent,
        /where s\.business_id\s*=\s*auth_business_id\(\)/,
        'v_sale_profit must enforce where business_id = auth_business_id()'
    )
    assert.match(
        migrationContent,
        /where business_id\s*=\s*auth_business_id\(\)/,
        'v_daily_recap must enforce where business_id = auth_business_id()'
    )

    // Revoke from public and anon
    assert.match(
        migrationContent,
        /revoke all on public\.v_sale_profit from anon,\s*public;/i,
        'v_sale_profit must revoke privileges from anon and public'
    )
})

test('P0-3: Caller Authentication and Scoping on record_sale_payment_atomic', () => {
    const migrationContent = fs.readFileSync(MIGRATION_PATH, 'utf-8')

    // Caller auth check
    assert.match(
        migrationContent,
        /auth\.uid\(\)\s+is\s+null\s+and\s+auth\.role\(\)\s*<>\s*'service_role'/i,
        'record_sale_payment_atomic must reject unauthenticated non-service-role callers'
    )

    // Profile business match check
    assert.match(
        migrationContent,
        /v_caller_biz_id\s+is\s+null\s+or\s+v_caller_biz_id\s*<>\s*p_business_id/i,
        'record_sale_payment_atomic must verify caller business equals p_business_id'
    )

    // Pegawai branch check
    assert.match(
        migrationContent,
        /v_caller_role\s*=\s*'pegawai'\s+and\s+v_caller_branch_id\s+is\s+not\s+null\s+and\s+v_caller_branch_id\s*<>\s*v_sale\.branch_id/i,
        'record_sale_payment_atomic must restrict pegawai to their assigned branch'
    )

    // Account ID ownership check
    assert.match(
        migrationContent,
        /select 1 from financial_accounts where id = p_account_id and business_id = p_business_id/i,
        'record_sale_payment_atomic must verify account_id belongs to p_business_id'
    )
})

test('P0-4: Hardened Expire Automation and Subscription Lockout Logic', async () => {
    const migrationContent = fs.readFileSync(MIGRATION_PATH, 'utf-8')
    const layoutContent = fs.readFileSync(LAYOUT_PATH, 'utf-8')
    const subAccessModule = await import('../lib/subscription-access.ts')

    // 1. Migration expire_trials logic
    assert.match(
        migrationContent,
        /subscription_status\s*=\s*'trial'[\s\S]*?trial_ends_at\s*<\s*now\(\)/i,
        'expire_trials must update overdue trials to expired'
    )
    assert.match(
        migrationContent,
        /subscription_status\s*=\s*'active'[\s\S]*?subscription_expires_at\s*<\s*now\(\)/i,
        'expire_trials must update overdue active subscriptions to expired'
    )

    // 2. hasActiveAccess function logic from lib/subscription-access.ts
    const { hasActiveAccess } = subAccessModule

    // Trial active
    assert.equal(
        hasActiveAccess({
            status: 'trial',
            trialEndsAt: new Date(Date.now() + 86400000).toISOString(),
        }),
        true
    )

    // Trial overdue
    assert.equal(
        hasActiveAccess({
            status: 'trial',
            trialEndsAt: new Date(Date.now() - 86400000).toISOString(),
        }),
        false
    )

    // Active subscription valid
    assert.equal(
        hasActiveAccess({
            status: 'active',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
        }),
        true
    )

    // Active subscription past expiration date
    assert.equal(
        hasActiveAccess({
            status: 'active',
            expiresAt: new Date(Date.now() - 86400000).toISOString(),
        }),
        false
    )

    // Explicitly expired / canceled
    assert.equal(hasActiveAccess({ status: 'expired' }), false)
    assert.equal(hasActiveAccess({ status: 'canceled' }), false)

    // 3. Layout redirects expired accounts to /dashboard/expired
    assert.match(
        layoutContent,
        /redirect\('\/dashboard\/expired'\)/,
        'Layout must redirect expired subscriptions to /dashboard/expired'
    )
    assert.match(
        layoutContent,
        /'\/dashboard\/expired'/,
        'Layout must permit /dashboard/expired for expired accounts'
    )
    assert.match(
        layoutContent,
        /'\/dashboard\/subscription'/,
        'Layout must permit /dashboard/subscription for renewal/upgrade'
    )
})

test('P0-5: Fail-Closed Super Admin Authorization', async () => {
    const authAdminModule = await import('../lib/auth-admin.ts')
    const { isSuperAdmin } = authAdminModule
    const adminPageContent = fs.readFileSync(ADMIN_PAGE_PATH, 'utf-8')
    const middlewareContent = fs.readFileSync(MIDDLEWARE_PATH, 'utf-8')

    // Must fail closed when env var is unset
    const originalEnv = process.env.SUPER_ADMIN_EMAILS
    delete process.env.SUPER_ADMIN_EMAILS
    delete process.env.SUPERADMIN_EMAILS

    assert.equal(isSuperAdmin('owner@domain.com'), false, 'Must return false when no super admin env is configured')
    assert.equal(isSuperAdmin(''), false)
    assert.equal(isSuperAdmin(null), false)

    // Must recognize configured emails correctly
    process.env.SUPER_ADMIN_EMAILS = 'admin@rekapin.com, founder@rekapin.com '
    assert.equal(isSuperAdmin('admin@rekapin.com'), true)
    assert.equal(isSuperAdmin('FOUNDER@REKAPIN.COM'), true, 'Must be case-insensitive')
    assert.equal(isSuperAdmin('intruder@rekapin.com'), false)

    // Cleanup env
    if (originalEnv !== undefined) {
        process.env.SUPER_ADMIN_EMAILS = originalEnv
    } else {
        delete process.env.SUPER_ADMIN_EMAILS
    }

    // Admin page must enforce check at top
    assert.match(
        adminPageContent,
        /isSuperAdmin\(user\.email\)/,
        'Admin page must check isSuperAdmin'
    )
    assert.match(
        adminPageContent,
        /redirect\('\/dashboard'\)/,
        'Admin page must redirect non-superadmins'
    )

    // Middleware must protect /admin route
    assert.match(
        middlewareContent,
        /request\.nextUrl\.pathname\.startsWith\('\/admin'\)/,
        'Middleware must detect /admin route'
    )
})

test('P1-3: Financial Transactions DELETE RLS Policy', () => {
    const migrationContent = fs.readFileSync(MIGRATION_PATH, 'utf-8')

    assert.match(
        migrationContent,
        /create policy "owner delete financial_transactions"/i,
        'Migration 0035 must create owner delete policy on financial_transactions'
    )
    assert.match(
        migrationContent,
        /business_id = auth_business_id\(\)\s+and\s+auth_is_owner\(\)/i,
        'Policy must restrict deletion strictly to owner of same business'
    )
})

test('P0-7: Package Dependencies specify Next.js 16.4.3', () => {
    const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'))

    assert.equal(packageJson.dependencies.next, '16.4.3', 'Next.js dependency must be pinned to 16.4.3')
    assert.equal(packageJson.devDependencies['eslint-config-next'], '16.4.3', 'eslint-config-next must be pinned to 16.4.3')
})

