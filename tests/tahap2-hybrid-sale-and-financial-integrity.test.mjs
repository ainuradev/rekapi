import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATION_PATH = path.resolve('supabase/migrations/0036_hybrid_sale_edit_and_financial_integrity.sql')
const RIWAYAT_ACTIONS_PATH = path.resolve('app/dashboard/penjualan/riwayat/actions.ts')
const KASIR_CLIENT_PATH = path.resolve('app/dashboard/penjualan/kasir-client.tsx')
const ARUS_KAS_PATH = path.resolve('app/dashboard/keuangan/arus-kas/page.tsx')
const NERACA_PATH = path.resolve('app/dashboard/keuangan/neraca/page.tsx')
const KINERJA_PATH = path.resolve('app/dashboard/keuangan/kinerja/page.tsx')
const BAHAN_BAKU_ACTIONS_PATH = path.resolve('app/dashboard/bahan-baku/actions.ts')

test('Tahap 2.1: Database Migration 0036 Contracts', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf-8')

    // 1. Column sales.account_id
    assert.match(
        sql,
        /alter table public\.sales\s+add column if not exists account_id uuid references public\.financial_accounts\(id\)/i,
        'Migration 0036 must add account_id column to sales table'
    )

    // 2. fn_sync_sale_to_financial_account respects new.account_id
    assert.match(
        sql,
        /v_account_id := new\.account_id;/,
        'fn_sync_sale_to_financial_account must prioritize new.account_id'
    )

    // 3. create_sale_atomic sets sales.account_id and sale_payments.account_id
    assert.match(
        sql,
        /insert into sales\s*\([^)]*account_id[^)]*\)\s*values\s*\([\s\S]*?v_resolved_account_id/s,
        'create_sale_atomic must store resolved account_id in sales table'
    )
    assert.match(
        sql,
        /insert into sale_payments\s*\([^)]*account_id[^)]*\)\s*values\s*\([\s\S]*?v_resolved_account_id/s,
        'create_sale_atomic must store resolved account_id in sale_payments table'
    )

    // 4. update_sale_atomic rejects edit when multiple payments exist
    assert.match(
        sql,
        /if v_payment_count > 1 then\s+raise exception 'Transaksi ini telah memiliki % kali riwayat pembayaran cicilan bertahap/i,
        'update_sale_atomic must reject edit when multiple installment payments exist'
    )

    // 5. update_sale_atomic uses server-side price & cost_price from products
    assert.match(
        sql,
        /select name, coalesce\(selling_price, 0\), coalesce\(cost_price, 0\), stock\s+into v_product_name, v_db_selling_price, v_db_cost_price, v_global_stock\s+from products/i,
        'update_sale_atomic must fetch official selling_price and cost_price from products'
    )
    assert.match(
        sql,
        /insert into sale_items \([^)]*price,\s*cost_price,\s*subtotal[^)]*\)\s*values \([^)]*v_db_selling_price,\s*v_db_cost_price/s,
        'update_sale_atomic must insert official db selling_price and cost_price into sale_items'
    )

    // 6. update_sale_atomic reconciles cash balance, financial_transactions, and sale_payments for paid sales
    assert.match(
        sql,
        /update financial_accounts\s+set current_balance = current_balance \+ v_diff_total/i,
        'update_sale_atomic must adjust financial_accounts balance by v_diff_total'
    )
    assert.match(
        sql,
        /update financial_transactions\s+set amount = v_computed_total/i,
        'update_sale_atomic must update financial_transactions amount'
    )
    assert.match(
        sql,
        /update sale_payments\s+set amount = v_computed_total/i,
        'update_sale_atomic must update sale_payments amount'
    )

    // 7. update_sale_atomic audits edited_by = v_caller_id
    assert.match(
        sql,
        /v_caller_id := coalesce\(auth\.uid\(\), p_user_id\);/,
        'update_sale_atomic must bind caller id to auth.uid()'
    )

    // 8. void_sale_atomic reverses payments from sale_payments.account_id with fallback
    assert.match(
        sql,
        /update financial_accounts\s+set current_balance = current_balance - v_payment\.amount/i,
        'void_sale_atomic must deduct exact amount from payment account'
    )
})

test('Tahap 2.2: updateSale Server Action Hybrid Validation', () => {
    const code = fs.readFileSync(RIWAYAT_ACTIONS_PATH, 'utf-8')

    // Reject edit on multiple payments
    assert.match(
        code,
        /if \(paymentCount && paymentCount > 1\) \{/,
        'updateSale must check if paymentCount > 1'
    )
    assert.match(
        code,
        /riwayat pembayaran cicilan bertahap dan tidak dapat diedit langsung/,
        'updateSale must return clear message directing user to Void + Recreate'
    )
})

test('Tahap 2.3: POS Cashier Account Synchronization', () => {
    const code = fs.readFileSync(KASIR_CLIENT_PATH, 'utf-8')

    // Synchronizes account with payment method
    assert.match(
        code,
        /handlePaymentMethodChange = \(newMethod: string\) =>/,
        'kasir-client must define handlePaymentMethodChange'
    )
    assert.match(
        code,
        /const matching = newMethod === 'cash' \? defaultCashAccount : defaultBankAccount/,
        'handlePaymentMethodChange must choose appropriate default account'
    )
})

test('Tahap 2.4: Cash Flow Statement Double Counting Prevention', () => {
    const code = fs.readFileSync(ARUS_KAS_PATH, 'utf-8')

    // Purchases query includes debts_payables
    assert.match(
        code,
        /debts_payables\(id, total_amount\)/,
        'arus-kas page must query linked debts_payables'
    )

    // Excludes debt amounts from totalPurchases to prevent double-counting with debt_payment
    assert.match(
        code,
        /const initialDownPayment = Math\.max\(0, Number\(p\.total \|\| 0\) - Number\(debtRow\.total_amount \|\| 0\)\)/,
        'arus-kas page must only count initial down payment when purchase has linked debt'
    )
})

test('Tahap 2.5: Balance Sheet Real Values, Negative Retained Earnings & Balance Check', () => {
    const code = fs.readFileSync(NERACA_PATH, 'utf-8')

    // No dummy 2500000 fallback
    assert.match(
        code,
        /const totalFixedAssets = equipmentAssets/,
        'neraca page must use real equipmentAssets without 2.5m fallback'
    )
    assert.doesNotMatch(
        code,
        /totalFixedAssets = equipmentAssets > 0 \? equipmentAssets : 2500000/,
        'neraca page must not have dummy 2500000 fallback'
    )

    // Supports negative retained earnings
    assert.match(
        code,
        /const retainedEarnings = netOperatingProfit/,
        'neraca page must allow negative retained earnings when netOperatingProfit < 0'
    )

    // Balance check
    assert.match(
        code,
        /const balanceDifference = Math\.abs\(totalAssets - totalLiabilitiesAndEquity\)/,
        'neraca page must compute real balance difference'
    )
    assert.match(
        code,
        /const isBalanced = balanceDifference < 1/,
        'neraca page must evaluate isBalanced'
    )
})

test('Tahap 2.6: CapEx Equipment Consistency in Kinerja', () => {
    const code = fs.readFileSync(KINERJA_PATH, 'utf-8')

    // Separates equipment CapEx from operating expenses
    assert.match(
        code,
        /if \(exp\.category === 'peralatan'\) \{/,
        'kinerja page must check category peralatan'
    )
    assert.match(
        code,
        /const netProfit = grossProfit - operatingExpenses/,
        'kinerja page must compute netProfit by subtracting operatingExpenses'
    )
})

test('Tahap 2.7: deletePurchase Debt and Journal Reversal', () => {
    const code = fs.readFileSync(BAHAN_BAKU_ACTIONS_PATH, 'utf-8')

    // checkActiveSubscription guard
    assert.match(
        code,
        /const subCheck = await checkActiveSubscription\(profile\.business_id, supabase\)/,
        'deletePurchase must guard with checkActiveSubscription'
    )

    // Reverses debt_payment transactions
    assert.match(
        code,
        /\.eq\('category', 'debt_payment'\)/,
        'deletePurchase must find debt_payment financial transactions'
    )
    assert.match(
        code,
        /current_balance:\s*Number\(curAcc\.current_balance \|\| 0\) \+ Number\(dTx\.amount\)/,
        'deletePurchase must restore cash paid via debt_payment back to account balance'
    )
    assert.match(
        code,
        /\.delete\(\)\s*\.eq\('reference_id',\s*linkedDebt\.id\)/,
        'deletePurchase must clean up linked debt transactions'
    )
})
