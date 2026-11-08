import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('Cabang Utama (Main Branch) Architecture & Induk Unification Verification', () => {
    it('1. Migration 0039 must define handle_new_user() creating Cabang Utama (code: PUSAT)', () => {
        const migrationPath = path.resolve('supabase/migrations/0039_ensure_main_branch_and_unify_induk.sql')
        assert.ok(fs.existsSync(migrationPath), 'Migration 0039 must exist')
        const sql = fs.readFileSync(migrationPath, 'utf8')

        assert.match(sql, /insert into public\.branches\s*\([^)]*name,\s*code/i, 'Must insert into branches with name and code')
        assert.match(sql, /'Cabang Utama'/i, 'Must set branch name to Cabang Utama')
        assert.match(sql, /'PUSAT'/i, 'Must set code to PUSAT')
        assert.match(sql, /update public\.sales/i, 'Must backfill orphaned sales')
        assert.match(sql, /update public\.expenses/i, 'Must backfill orphaned expenses')
        assert.match(sql, /update public\.purchases/i, 'Must backfill orphaned purchases')
        assert.match(sql, /update public\.debts_payables/i, 'Must backfill orphaned debts_payables')
        assert.match(sql, /update public\.receivables/i, 'Must backfill orphaned receivables')
    })

    it('2. Cabang actions.ts must protect Cabang Utama and reject deletion when only 1 branch exists', () => {
        const actionsPath = path.resolve('app/dashboard/cabang/actions.ts')
        const code = fs.readFileSync(actionsPath, 'utf8')

        assert.match(code, /count \?\? 0\) <= 1/i, 'Must check count <= 1 before deleting branch')
        assert.match(code, /Cabang Utama tidak dapat dihapus karena setiap bisnis wajib memiliki minimal satu cabang aktif/i, 'Must return clear error message')
        assert.match(code, /Cabang Utama \(Induk\) tidak dapat dihapus/i, 'Must prevent deleting oldest/primary branch')
    })

    it('3. Cabang client UI must badge Cabang Utama (Induk) and disable delete button', () => {
        const clientPath = path.resolve('app/dashboard/cabang/branch-list-client.tsx')
        const code = fs.readFileSync(clientPath, 'utf8')

        assert.match(code, /Cabang Utama \(Induk\)/, 'Must render badge Cabang Utama (Induk)')
        assert.match(code, /isPrimary \|\| branches\.length <= 1/, 'Must disable delete button for Cabang Utama or when count <= 1')
    })

    it('4. DashboardNav must label top option as Semua Cabang (Konsolidasi) and mark primary branch', () => {
        const navPath = path.resolve('app/dashboard/dashboard-nav.tsx')
        const code = fs.readFileSync(navPath, 'utf8')

        assert.match(code, /Semua Cabang \(Konsolidasi\)/, 'Must label top option Semua Cabang (Konsolidasi)')
        assert.match(code, /Utama \/ Pusat/, 'Must badge primary branch with Utama / Pusat')
    })

    it('5. Self-healing in app/dashboard/layout.tsx must provision Cabang Utama if business has 0 branches', () => {
        const layoutPath = path.resolve('app/dashboard/layout.tsx')
        const code = fs.readFileSync(layoutPath, 'utf8')

        assert.match(code, /createAdminClient/, 'Must use admin client for self-healing')
        assert.match(code, /Cabang Utama/, 'Must provision Cabang Utama if branchesList.length === 0')
        assert.match(code, /PUSAT/, 'Must set code PUSAT on self-healing branch')
        assert.match(code, /update\(\{\s*branch_id:\s*branchesList\[0\]\.id\s*\}\)/, 'Must sync profile.branch_id to primary branch')
    })

    it('6. Financial actions must default orphaned branch_id to primary branch (Cabang Utama)', () => {
        const finActionsPath = path.resolve('app/dashboard/keuangan/actions.ts')
        const code = fs.readFileSync(finActionsPath, 'utf8')

        assert.match(code, /order\('created_at',\s*\{\s*ascending:\s*true\s*\}\)/, 'Must resolve primary branch by created_at ascending in finance actions')
    })

    it('7. POS Kasir actions must default orphaned branch_id to primary branch', () => {
        const posActionsPath = path.resolve('app/dashboard/penjualan/actions.ts')
        const code = fs.readFileSync(posActionsPath, 'utf8')

        assert.match(code, /order\('created_at',\s*\{\s*ascending:\s*true\s*\}\)/, 'Must resolve primary branch by created_at ascending in sale actions')
    })

    it('8. Bahan baku client must remove split "Stok Induk vs Cabang" and show Total Stok (Konsolidasi)', () => {
        const bbClientPath = path.resolve('app/dashboard/bahan-baku/bahan-baku-client.tsx')
        const code = fs.readFileSync(bbClientPath, 'utf8')

        assert.match(code, /Total Stok \(Konsolidasi\)/, 'Header must say Total Stok (Konsolidasi)')
        assert.doesNotMatch(code, /Atur Stok Induk \(Global\)/, 'Must not have Atur Stok Induk modal')
        assert.doesNotMatch(code, /Tersedia di Induk/, 'Must not have Tersedia di Induk text')
    })
})

