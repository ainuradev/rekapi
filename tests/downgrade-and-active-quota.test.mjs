import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { isQuotaDowngrade } from '../lib/subscription-downgrade.ts'

describe('Subscription Downgrade Auto-Deactivation & Active Quota Protection Verification', () => {
    it('1. Migration 0040 must define is_active on profiles, downgrade trigger, and active-only limit triggers', () => {
        const migrationPath = path.resolve('supabase/migrations/0040_downgrade_auto_deactivate_branches_and_employees.sql')
        assert.ok(fs.existsSync(migrationPath), 'Migration 0040 must exist')
        const sql = fs.readFileSync(migrationPath, 'utf8')

        assert.match(sql, /add column if not exists is_active boolean not null default true/i, 'Must add is_active to profiles')
        assert.match(sql, /create or replace function public\.auto_deactivate_on_downgrade/i, 'Must define auto_deactivate_on_downgrade function')
        assert.match(sql, /status\s*=\s*'inactive'/i, 'Must set other branches to inactive')
        assert.match(sql, /is_active\s*=\s*false/i, 'Must set non-main cashier employees to is_active = false')
        assert.match(sql, /create trigger trg_check_business_downgrade/i, 'Must attach downgrade trigger to businesses')
        assert.match(sql, /status\s*=\s*'active'/i, 'enforce_branch_limit must only check active branches')
        assert.match(sql, /is_active\s*=\s*true/i, 'enforce_employee_limit must only check active employees')
    })

    it('2. Downgrade helper (lib/subscription-downgrade.ts) must detect quota downgrades and expose executor', () => {
        assert.equal(isQuotaDowngrade(5, 3), true, 'Pro (5) -> Business (3) is a downgrade')
        assert.equal(isQuotaDowngrade(5, 1), true, 'Pro (5) -> Standard (1) is a downgrade')
        assert.equal(isQuotaDowngrade(3, 1), true, 'Business (3) -> Standard (1) is a downgrade')
        assert.equal(isQuotaDowngrade(1, 1), false, 'Standard (1) -> Standard (1) is not a downgrade')
        assert.equal(isQuotaDowngrade(1, 3), false, 'Standard (1) -> Business (3) is an upgrade')

        const helperPath = path.resolve('lib/subscription-downgrade.ts')
        const code = fs.readFileSync(helperPath, 'utf8')
        assert.match(code, /executeAutoDeactivateOnDowngrade/, 'Must export executeAutoDeactivateOnDowngrade')
        assert.match(code, /auto_deactivate_on_downgrade/, 'Must attempt database RPC')
        assert.match(code, /mainBranch/, 'Must preserve Cabang Utama (PUSAT)')
    })

    it('3. Admin Override (app/admin/actions.ts) must hook auto-deactivation on downgrade', () => {
        const adminActionsPath = path.resolve('app/admin/actions.ts')
        const code = fs.readFileSync(adminActionsPath, 'utf8')

        assert.match(code, /executeAutoDeactivateOnDowngrade/, 'Must import and use executeAutoDeactivateOnDowngrade')
        assert.match(code, /isDowngrade\s*=\s*newMaxBranches\s*<\s*oldMaxBranches/, 'Must detect downgrade in adminOverrideSubscription')
    })

    it('4. Midtrans Sync (lib/midtrans/sync.ts) must hook auto-deactivation on downgrade settlement', () => {
        const syncPath = path.resolve('lib/midtrans/sync.ts')
        const code = fs.readFileSync(syncPath, 'utf8')

        assert.match(code, /executeAutoDeactivateOnDowngrade/, 'Must import and use executeAutoDeactivateOnDowngrade')
        assert.match(code, /isDowngrade\s*=\s*newMaxBranches\s*<\s*oldMaxBranches/, 'Must detect downgrade in syncPaymentStatus')
    })

    it('5. Dashboard layout (app/dashboard/layout.tsx) must lock out inactive cashiers & inactive branch employees', () => {
        const layoutPath = path.resolve('app/dashboard/layout.tsx')
        const code = fs.readFileSync(layoutPath, 'utf8')

        assert.match(code, /is_active/, 'Must query is_active from profiles')
        assert.match(code, /profile\.is_active === false/, 'Must detect inactive cashier')
        assert.match(code, /Akun Kasir atau Cabang Anda Sedang Dinonaktifkan/, 'Must render clear lockout notification')
        assert.match(code, /\/api\/auth\/signout/, 'Must provide logout button')
    })

    it('6. POS Kasir (app/dashboard/penjualan/actions.ts) must reject sales from inactive branches or cashiers', () => {
        const posActionsPath = path.resolve('app/dashboard/penjualan/actions.ts')
        const code = fs.readFileSync(posActionsPath, 'utf8')

        assert.match(code, /profile\.role === 'pegawai' && profile\.is_active === false/, 'Must check cashier active status')
        assert.match(code, /Akun kasir Anda sedang dinonaktifkan oleh Pemilik Bisnis/, 'Must return polite rejection message')
        assert.match(code, /branchCheck\.status !== 'active'/, 'Must verify branch is active')
        assert.match(code, /sedang nonaktif\. Transaksi kasir tidak dapat dilakukan di cabang nonaktif/, 'Must return polite branch inactive message')
    })

    it('7. DashboardNav (app/dashboard/dashboard-nav.tsx) must label inactive branches in switcher', () => {
        const navPath = path.resolve('app/dashboard/dashboard-nav.tsx')
        const code = fs.readFileSync(navPath, 'utf8')

        assert.match(code, /b\.status !== 'active'/, 'Must check branch status')
        assert.match(code, /Nonaktif/, 'Must display Nonaktif badge')
    })

    it('8. Cabang actions (app/dashboard/cabang/actions.ts) must support toggleBranchStatus with active quota checks', () => {
        const cabangActionsPath = path.resolve('app/dashboard/cabang/actions.ts')
        const code = fs.readFileSync(cabangActionsPath, 'utf8')

        assert.match(code, /toggleBranchStatus/, 'Must export toggleBranchStatus')
        assert.match(code, /Cabang Utama \(Pusat\) tidak dapat dinonaktifkan/, 'Must protect Cabang Utama from deactivation')
        assert.match(code, /Batas kuota cabang aktif paket Anda/, 'Must guard active branch quota')
    })

    it('9. Pegawai actions (app/dashboard/pegawai/actions.ts) must support toggleEmployeeStatus with active quota checks', () => {
        const pegawaiActionsPath = path.resolve('app/dashboard/pegawai/actions.ts')
        const code = fs.readFileSync(pegawaiActionsPath, 'utf8')

        assert.match(code, /toggleEmployeeStatus/, 'Must export toggleEmployeeStatus')
        assert.match(code, /Batas kuota pegawai aktif paket Anda/, 'Must guard active employee quota')
        assert.match(code, /sedang nonaktif\. Aktifkan cabang terlebih dahulu/, 'Must require active branch before activating employee')
    })
})

