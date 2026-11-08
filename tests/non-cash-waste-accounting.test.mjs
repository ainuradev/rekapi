import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('Non-Cash Waste & Inventory Loss Accounting Logic Verification', () => {
    it('1. Migration 0042 must add is_non_cash to public.expenses and expand mutation_type constraint', () => {
        const migrationPath = path.resolve('supabase/migrations/0042_non_cash_waste_and_inventory_loss.sql')
        assert.ok(fs.existsSync(migrationPath), 'Migration 0042 must exist')
        const sql = fs.readFileSync(migrationPath, 'utf8')

        assert.match(sql, /alter table public\.expenses\s+add column if not exists is_non_cash boolean/i, 'Must add is_non_cash to expenses')
        assert.match(sql, /'waste_expired'/, 'Must include waste_expired in mutation_type constraint')
        assert.match(sql, /'lost_shrinkage'/, 'Must include lost_shrinkage in mutation_type constraint')
        assert.match(sql, /'production_usage'/, 'Must include production_usage in mutation_type constraint')
        assert.match(sql, /'input_correction'/, 'Must include input_correction in mutation_type constraint')
    })

    it('2. Raw Material actions must standardize reasons and record non-cash loss without touching cash accounts', () => {
        const actionsPath = path.resolve('app/dashboard/bahan-baku/raw-material-actions.ts')
        const code = fs.readFileSync(actionsPath, 'utf8')

        assert.match(code, /export type StockReductionReason = 'waste_expired' \| 'lost_shrinkage' \| 'production_usage' \| 'input_correction'/, 'Must define reduction reasons')
        assert.match(code, /isLossAccountingType/, 'Must check loss accounting condition')
        assert.match(code, /Math\.round\(qty \* costPerUnit/, 'Must calculate lossAmount as qty * costPerUnit')
        assert.match(code, /category:\s*'lainnya'/, 'Must insert expense with category lainnya')
        assert.match(code, /is_non_cash:\s*true/, 'Must mark expense as is_non_cash true')
        assert.doesNotMatch(code, /financial_accounts.*update.*current_balance/s, 'Must NOT update financial_accounts balance on waste')
        assert.doesNotMatch(code, /financial_transactions.*insert/s, 'Must NOT insert cash transaction on waste')
    })

    it('3. Raw Material client UI must render 4 reduction reasons and live non-cash loss estimate', () => {
        const clientPath = path.resolve('app/dashboard/bahan-baku/bahan-baku-client.tsx')
        const code = fs.readFileSync(clientPath, 'utf8')

        assert.match(code, /setAdjustType\('waste_expired'\)/, 'Must allow choosing waste_expired')
        assert.match(code, /setAdjustType\('lost_shrinkage'\)/, 'Must allow choosing lost_shrinkage')
        assert.match(code, /setAdjustType\('production_usage'\)/, 'Must allow choosing production_usage')
        assert.match(code, /setAdjustType\('input_correction'\)/, 'Must allow choosing input_correction')
        assert.match(code, /Beban Non-Kas/, 'Must mention Beban Non-Kas in UI')
        assert.match(code, /Estimasi Beban Kerugian/, 'Must calculate live loss estimate')
        assert.match(code, /Catat juga sebagai Beban Operasional Non-Kas/, 'Must provide toggle for production usage')
    })

    it('4. Product actions must record non-cash loss on waste_expired and lost_shrinkage without touching cash accounts', () => {
        const actionsPath = path.resolve('app/dashboard/produk/actions.ts')
        const code = fs.readFileSync(actionsPath, 'utf8')

        assert.match(code, /export type ProductStockReductionReason/, 'Must define ProductStockReductionReason')
        assert.match(code, /options\?\:\s*UpdateStockOptions/, 'Must accept UpdateStockOptions in updateStock and updateBranchStock')
        assert.match(code, /options\?\.reason === 'waste_expired' \|\| options\?\.reason === 'lost_shrinkage'/, 'Must check waste reason')
        assert.match(code, /Math\.round\(qtyReduced \* costPrice/, 'Must calculate lossAmount as qtyReduced * costPrice')
        assert.match(code, /is_non_cash:\s*true/, 'Must mark expense as is_non_cash true')
        assert.doesNotMatch(code, /financial_accounts.*update/s, 'Must NOT touch financial_accounts in product actions')
    })

    it('5. Product catalog client must detect stock reduction and show reason selector with loss estimate', () => {
        const clientPath = path.resolve('app/dashboard/produk/product-catalog-client.tsx')
        const code = fs.readFileSync(clientPath, 'utf8')

        assert.match(code, /isReduction/, 'Must track isReduction')
        assert.match(code, /value="waste_expired"/, 'Must render waste_expired option')
        assert.match(code, /value="lost_shrinkage"/, 'Must render lost_shrinkage option')
        assert.match(code, /value="production_usage"/, 'Must render production_usage option')
        assert.match(code, /value="input_correction"/, 'Must render input_correction option')
        assert.match(code, /Estimasi Beban Kerugian/, 'Must show live loss estimate')
        assert.match(code, /Beban Non-Kas/, 'Must educate user on non-cash expense')
    })

    it('6. Beban Operasional page must display Beban Non-Kas (Waste Stok) badge', () => {
        const pagePath = path.resolve('app/dashboard/keuangan/beban/page.tsx')
        const code = fs.readFileSync(pagePath, 'utf8')

        assert.match(code, /Beban Non-Kas \(Waste Stok\)/, 'Must render badge Beban Non-Kas (Waste Stok)')
        assert.match(code, /nonCashWasteTotal/, 'Must track nonCashWasteTotal')
    })

    it('7. Laba Rugi page must show dedicated Kerugian Persediaan & Waste line item and reduce Net Profit', () => {
        const pagePath = path.resolve('app/dashboard/keuangan/laba-rugi/page.tsx')
        const code = fs.readFileSync(pagePath, 'utf8')

        assert.match(code, /wasteLossExpenses/, 'Must aggregate wasteLossExpenses')
        assert.match(code, /Kerugian Persediaan & Waste/, 'Must render Kerugian Persediaan & Waste section')
        assert.match(code, /totalExpenses \+= amt/, 'Must include waste in totalExpenses to reduce Net Profit')
    })

    it('8. Arus Kas page must exclude non-cash waste expenses from cash outflow', () => {
        const pagePath = path.resolve('app/dashboard/keuangan/arus-kas/page.tsx')
        const code = fs.readFileSync(pagePath, 'utf8')

        assert.match(code, /totalNonCashWaste/, 'Must track totalNonCashWaste')
        assert.match(code, /if\s*\(isNonCash\)\s*\{\s*totalNonCashWaste \+= amt/s, 'Must filter out non-cash waste from cash outflow')
        assert.match(code, /Beban Non-Kas Waste Stok \(Dikecualikan dari Kas Keluar\)/, 'Must inform user that non-cash waste is excluded from cash outflow')
    })

    it('9. Neraca page must not deduct non-cash waste from cash balance while keeping balance sheet balanced', () => {
        const pagePath = path.resolve('app/dashboard/keuangan/neraca/page.tsx')
        const code = fs.readFileSync(pagePath, 'utf8')

        assert.match(code, /nonCashWasteExpenses/, 'Must track nonCashWasteExpenses')
        assert.match(code, /cashOperatingExpenses = operatingExpenses - nonCashWasteExpenses/, 'Must exclude non-cash waste from cash calculation')
        assert.match(code, /netOperatingProfit = grossProfit - operatingExpenses/, 'Must retain full operating expenses in equity retained earnings')
    })
})
