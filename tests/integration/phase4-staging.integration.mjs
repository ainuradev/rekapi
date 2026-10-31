/**
 * Phase 4 / Tahap 2 Rekapi — Live Supabase STAGING Integration Tests.
 * Menguji Integritas Edit/Void Penjualan Hibrida, Sinkronisasi Akun Keuangan,
 * dan Rekonsiliasi Otomatis pada Supabase Staging.
 *
 * Jalankan HANYA terhadap project staging terisolasi:
 *   $env:RUN_STAGING_INTEGRATION="1"; node --test tests/integration/phase4-staging.integration.mjs
 *
 * Aturan Keamanan:
 *  - Target database WAJIB 'ucvgszazrjnjaglaiswq' (staging).
 *  - Database production 'dnqzjrnyptwadojycxvm' DIBLOKIR KERAS.
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const ALLOWED_STAGING_REF = 'ucvgszazrjnjaglaiswq'
const FORBIDDEN_PRODUCTION_REFS = new Set(['dnqzjrnyptwadojycxvm'])

// Load .env.staging.local
if (fs.existsSync('.env.staging.local')) {
    const raw = fs.readFileSync('.env.staging.local', 'utf8')
    for (const line of raw.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx === -1) continue
        const key = trimmed.slice(0, eqIdx).trim()
        const val = trimmed.slice(eqIdx + 1).trim()
        if (key === 'NEXT_PUBLIC_SUPABASE_URL' && (!process.env.STAGING_SUPABASE_URL || process.env.STAGING_SUPABASE_URL.includes('<'))) {
            process.env.STAGING_SUPABASE_URL = val
        }
        if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' && (!process.env.STAGING_SUPABASE_ANON_KEY || process.env.STAGING_SUPABASE_ANON_KEY.includes('<'))) {
            process.env.STAGING_SUPABASE_ANON_KEY = val
        }
        if (key.startsWith('STAGING_') && (!process.env[key] || process.env[key].includes('<'))) {
            process.env[key] = val
        }
    }
}

process.env.STAGING_OWNER_A_EMAIL = process.env.STAGING_OWNER_A_EMAIL || 'owner-a@rekapi-staging.test'
process.env.STAGING_OWNER_A_PASSWORD = process.env.STAGING_OWNER_A_PASSWORD || '12345678'

if (!process.env.STAGING_PROJECT_REF && process.env.STAGING_SUPABASE_URL) {
    const m = process.env.STAGING_SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)
    if (m) process.env.STAGING_PROJECT_REF = m[1]
}

const E = process.env

describe('Phase 4 / Tahap 2 — Hybrid Sale Edit & Financial Integrity Staging Integration Test', () => {
    let clientOwnerA
    let userOwnerA
    let profileOwnerA
    let defaultCashAccount
    let activeBranch
    let testProduct
    let testCustomer

    before(async () => {
        if (!E.RUN_STAGING_INTEGRATION) {
            console.log('⚠️ RUN_STAGING_INTEGRATION != 1. Menjalankan verifikasi offline/safety.')
            return
        }

        assert.ok(E.STAGING_SUPABASE_URL, 'STAGING_SUPABASE_URL wajib diisi')
        assert.ok(E.STAGING_SUPABASE_ANON_KEY, 'STAGING_SUPABASE_ANON_KEY wajib diisi')
        assert.ok(E.STAGING_PROJECT_REF, 'STAGING_PROJECT_REF wajib diisi')

        assert.equal(E.STAGING_PROJECT_REF, ALLOWED_STAGING_REF, `Target harus staging ${ALLOWED_STAGING_REF}`)
        assert.ok(!FORBIDDEN_PRODUCTION_REFS.has(E.STAGING_PROJECT_REF), 'Target tidak boleh production!')

        clientOwnerA = createClient(E.STAGING_SUPABASE_URL, E.STAGING_SUPABASE_ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        })

        const authA = await clientOwnerA.auth.signInWithPassword({
            email: E.STAGING_OWNER_A_EMAIL,
            password: E.STAGING_OWNER_A_PASSWORD,
        })
        assert.ok(!authA.error, `Login Owner A gagal: ${authA.error?.message}`)
        userOwnerA = authA.data.user

        const { data: prof, error: profErr } = await clientOwnerA
            .from('profiles')
            .select('*')
            .eq('id', userOwnerA.id)
            .single()
        assert.ok(!profErr, `Ambil profil gagal: ${profErr?.message}`)
        profileOwnerA = prof

        // Ambil cabang aktif
        const { data: branches } = await clientOwnerA
            .from('branches')
            .select('*')
            .eq('business_id', profileOwnerA.business_id)
            .limit(1)
        assert.ok(branches?.length, 'Cabang tidak ditemukan')
        activeBranch = branches[0]

        // Ambil akun kas default
        const { data: accounts } = await clientOwnerA
            .from('financial_accounts')
            .select('*')
            .eq('business_id', profileOwnerA.business_id)
            .eq('is_default_cash', true)
            .limit(1)
        assert.ok(accounts?.length, 'Akun kas default tidak ditemukan')
        defaultCashAccount = accounts[0]

        // Ambil produk dengan stok
        const { data: products } = await clientOwnerA
            .from('products')
            .select('id, name, selling_price, stock')
            .eq('business_id', profileOwnerA.business_id)
            .eq('status', 'aktif')
            .limit(1)
        assert.ok(products?.length, 'Produk aktif tidak ditemukan')
        testProduct = products[0]

        // Ambil atau buat pelanggan untuk tes kredit
        const { data: custs } = await clientOwnerA
            .from('customers')
            .select('id')
            .eq('business_id', profileOwnerA.business_id)
            .limit(1)

        if (custs?.length) {
            testCustomer = custs[0]
        } else {
            const { data: newCust } = await clientOwnerA
                .from('customers')
                .insert({
                    business_id: profileOwnerA.business_id,
                    name: 'Pelanggan Uji Kredit',
                    phone: '081299998888',
                    receivable_limit: 10000000,
                })
                .select('id')
                .single()
            testCustomer = newCust
        }

        // Pastikan stok cabang minimal 10
        await clientOwnerA.rpc('set_product_branch_stock_atomic', {
            p_product_id: testProduct.id,
            p_branch_id: activeBranch.id,
            p_stock: 50,
        })
    })

    test('0. Validasi Target Database & Environment Safety', () => {
        if (!E.RUN_STAGING_INTEGRATION) return
        assert.equal(E.STAGING_PROJECT_REF, ALLOWED_STAGING_REF)
        assert.ok(!FORBIDDEN_PRODUCTION_REFS.has(E.STAGING_PROJECT_REF))
    })

    test('1. Kolom sales.account_id tersimpan dan tersinkronisasi saat create_sale_atomic', async () => {
        if (!E.RUN_STAGING_INTEGRATION) return

        const qty = 2
        const sellingPrice = Number(testProduct.selling_price)
        const total = sellingPrice * qty
        const idempotencyKey = crypto.randomUUID()

        const { data: res, error: err } = await clientOwnerA.rpc('create_sale_atomic', {
            p_business_id: profileOwnerA.business_id,
            p_branch_id: activeBranch.id,
            p_user_id: userOwnerA.id,
            p_channel: 'offline',
            p_payment_method: 'cash',
            p_total: total,
            p_items: [
                {
                    product_id: testProduct.id,
                    quantity: qty,
                    price: sellingPrice,
                    cost_price: 0,
                    subtotal: total,
                },
            ],
            p_idempotency_key: idempotencyKey,
            p_invoice_number: `INV-TEST-${Date.now()}`,
            p_account_id: defaultCashAccount.id,
        })

        assert.ok(!err, `create_sale_atomic gagal: ${err?.message}`)
        assert.ok(res?.sale_id, 'sale_id harus ada')
        const saleId = res.sale_id

        // Verifikasi sales.account_id tersimpan
        const { data: saleData } = await clientOwnerA
            .from('sales')
            .select('id, account_id, paid_amount, payment_status')
            .eq('id', saleId)
            .single()

        assert.equal(saleData.account_id, defaultCashAccount.id, 'sales.account_id harus cocok dengan defaultCashAccount')
        assert.equal(Number(saleData.paid_amount), total)
        assert.equal(saleData.payment_status, 'paid')

        // Verifikasi sale_payments mencatat account_id yang sama
        const { data: payments } = await clientOwnerA
            .from('sale_payments')
            .select('*')
            .eq('sale_id', saleId)

        assert.equal(payments.length, 1)
        assert.equal(payments[0].account_id, defaultCashAccount.id)
        assert.equal(Number(payments[0].amount), total)

        // Bersihkan via void
        await clientOwnerA.rpc('void_sale_atomic', {
            p_business_id: profileOwnerA.business_id,
            p_sale_id: saleId,
            p_user_id: userOwnerA.id,
            p_reason: 'Cleanup test 1',
        })
    })

    test('2. Hybrid Edit Policy: Edit transaksi lunas tunggal otomatis merekonsiliasi saldo kas & sale_payments', async () => {
        if (!E.RUN_STAGING_INTEGRATION) return

        const initialQty = 2
        const sellingPrice = Number(testProduct.selling_price)
        const initialTotal = sellingPrice * initialQty
        const idempotencyKey = crypto.randomUUID()

        const { data: createRes, error: createErr } = await clientOwnerA.rpc('create_sale_atomic', {
            p_business_id: profileOwnerA.business_id,
            p_branch_id: activeBranch.id,
            p_user_id: userOwnerA.id,
            p_channel: 'offline',
            p_payment_method: 'cash',
            p_total: initialTotal,
            p_items: [
                {
                    product_id: testProduct.id,
                    quantity: initialQty,
                    price: sellingPrice,
                    cost_price: 0,
                    subtotal: initialTotal,
                },
            ],
            p_idempotency_key: idempotencyKey,
            p_invoice_number: `INV-EDIT-${Date.now()}`,
            p_account_id: defaultCashAccount.id,
        })

        assert.ok(!createErr, `create_sale_atomic gagal: ${createErr?.message}`)
        const saleId = createRes.sale_id

        // Ambil saldo sebelum edit
        const { data: accBefore } = await clientOwnerA
            .from('financial_accounts')
            .select('current_balance')
            .eq('id', defaultCashAccount.id)
            .single()
        const balanceBefore = Number(accBefore.current_balance)

        // Edit transaksi: naikkan qty dari 2 ke 3 (+1 pcs)
        const newQty = 3
        const newTotal = sellingPrice * newQty
        const diff = newTotal - initialTotal

        const { data: updateRes, error: updateErr } = await clientOwnerA.rpc('update_sale_atomic', {
            p_sale_id: saleId,
            p_business_id: profileOwnerA.business_id,
            p_user_id: userOwnerA.id,
            p_channel: 'offline',
            p_payment_method: 'cash',
            p_total: newTotal,
            p_items: [
                {
                    product_id: testProduct.id,
                    quantity: newQty,
                    price: sellingPrice,
                    subtotal: newTotal,
                },
            ],
            p_old_data: {},
            p_new_data: {},
            p_reason: 'Penambahan jumlah barang',
        })

        assert.ok(!updateErr, `update_sale_atomic gagal: ${updateErr?.message}`)
        assert.equal(updateRes.success, true)

        // Verifikasi saldo kas bertambah sebesar selisihnya
        const { data: accAfter } = await clientOwnerA
            .from('financial_accounts')
            .select('current_balance')
            .eq('id', defaultCashAccount.id)
            .single()
        const balanceAfter = Number(accAfter.current_balance)
        assert.equal(balanceAfter - balanceBefore, diff, 'Saldo kas harus bertambah sesuai selisih edit')

        // Verifikasi sale_payments disesuaikan ke newTotal
        const { data: payments } = await clientOwnerA
            .from('sale_payments')
            .select('amount')
            .eq('sale_id', saleId)
        assert.equal(payments.length, 1)
        assert.equal(Number(payments[0].amount), newTotal)

        // Verifikasi sales.paid_amount & total diperbarui
        const { data: saleAfter } = await clientOwnerA
            .from('sales')
            .select('total, paid_amount')
            .eq('id', saleId)
            .single()
        assert.equal(Number(saleAfter.total), newTotal)
        assert.equal(Number(saleAfter.paid_amount), newTotal)

        // Cleanup
        await clientOwnerA.rpc('void_sale_atomic', {
            p_business_id: profileOwnerA.business_id,
            p_sale_id: saleId,
            p_user_id: userOwnerA.id,
            p_reason: 'Cleanup test 2',
        })
    })

    test('3. Hybrid Edit Policy: Transaksi dengan cicilan bertahap (>1 pembayaran) ditolak edit', async () => {
        if (!E.RUN_STAGING_INTEGRATION) return

        const sellingPrice = Number(testProduct.selling_price)
        const total = sellingPrice * 4
        const downPayment = sellingPrice * 2
        const idempotencyKey = crypto.randomUUID()

        // Buat transaksi tempo dengan DP
        const { data: createRes, error: createErr } = await clientOwnerA.rpc('create_sale_atomic', {
            p_business_id: profileOwnerA.business_id,
            p_branch_id: activeBranch.id,
            p_user_id: userOwnerA.id,
            p_customer_id: testCustomer.id,
            p_channel: 'offline',
            p_payment_method: 'cash',
            p_total: total,
            p_items: [
                {
                    product_id: testProduct.id,
                    quantity: 4,
                    price: sellingPrice,
                    cost_price: 0,
                    subtotal: total,
                },
            ],
            p_idempotency_key: idempotencyKey,
            p_invoice_number: `INV-TEMPO-${Date.now()}`,
            p_payment_status: 'partial',
            p_paid_amount: downPayment,
            p_account_id: defaultCashAccount.id,
        })

        assert.ok(!createErr, `create_sale_atomic tempo gagal: ${createErr?.message}`)
        const saleId = createRes.sale_id

        // Catat pembayaran cicilan ke-2 via record_sale_payment_atomic
        const installmentAmount = sellingPrice * 1
        const { error: payErr } = await clientOwnerA.rpc('record_sale_payment_atomic', {
            p_business_id: profileOwnerA.business_id,
            p_sale_id: saleId,
            p_amount: installmentAmount,
            p_payment_method: 'cash',
            p_account_id: defaultCashAccount.id,
            p_recorded_by: userOwnerA.id,
            p_payment_date: new Date().toISOString().split('T')[0],
            p_notes: 'Cicilan ke-2',
            p_idempotency_key: crypto.randomUUID(),
            p_user_id: userOwnerA.id,
        })
        assert.ok(!payErr, `record_sale_payment_atomic gagal: ${payErr?.message}`)

        // Coba edit transaksi yang sudah memiliki 2 kali pembayaran
        const { data: editRes, error: editErr } = await clientOwnerA.rpc('update_sale_atomic', {
            p_sale_id: saleId,
            p_business_id: profileOwnerA.business_id,
            p_user_id: userOwnerA.id,
            p_channel: 'offline',
            p_payment_method: 'cash',
            p_total: total,
            p_items: [
                {
                    product_id: testProduct.id,
                    quantity: 4,
                    price: sellingPrice,
                    subtotal: total,
                },
            ],
            p_old_data: {},
            p_new_data: {},
            p_reason: 'Coba edit',
        })

        // Wajib ditolak dengan pesan jelas
        assert.ok(editErr, 'Edit transaksi multi-cicilan wajib ditolak database')
        assert.match(editErr.message, /riwayat pembayaran cicilan bertahap dan tidak dapat diedit langsung/i)

        // Cleanup via void
        await clientOwnerA.rpc('void_sale_atomic', {
            p_business_id: profileOwnerA.business_id,
            p_sale_id: saleId,
            p_user_id: userOwnerA.id,
            p_reason: 'Cleanup test 3',
        })
    })

    test('4. Void Transaksi: Mengembalikan saldo kas dari akun asal dan memulihkan stok cabang secara presisi', async () => {
        if (!E.RUN_STAGING_INTEGRATION) return

        const qty = 3
        const sellingPrice = Number(testProduct.selling_price)
        const total = sellingPrice * qty
        const idempotencyKey = crypto.randomUUID()

        // Catat stok awal cabang
        const { data: stockBefore } = await clientOwnerA
            .from('product_branch_stocks')
            .select('stock')
            .eq('product_id', testProduct.id)
            .eq('branch_id', activeBranch.id)
            .single()
        const initialStock = Number(stockBefore.stock)

        // Catat saldo kas sebelum transaksi
        const { data: accBefore } = await clientOwnerA
            .from('financial_accounts')
            .select('current_balance')
            .eq('id', defaultCashAccount.id)
            .single()
        const balanceBefore = Number(accBefore.current_balance)

        // Buat transaksi kasir
        const { data: createRes } = await clientOwnerA.rpc('create_sale_atomic', {
            p_business_id: profileOwnerA.business_id,
            p_branch_id: activeBranch.id,
            p_user_id: userOwnerA.id,
            p_channel: 'offline',
            p_payment_method: 'cash',
            p_total: total,
            p_items: [
                {
                    product_id: testProduct.id,
                    quantity: qty,
                    price: sellingPrice,
                    cost_price: 0,
                    subtotal: total,
                },
            ],
            p_idempotency_key: idempotencyKey,
            p_invoice_number: `INV-VOID-${Date.now()}`,
            p_account_id: defaultCashAccount.id,
        })
        const saleId = createRes.sale_id

        // Stok cabang berkurang 3, saldo kas bertambah
        const { data: stockMid } = await clientOwnerA
            .from('product_branch_stocks')
            .select('stock')
            .eq('product_id', testProduct.id)
            .eq('branch_id', activeBranch.id)
            .single()
        assert.equal(Number(stockMid.stock), initialStock - qty)

        // Batalkan (void) transaksi
        const { data: voidRes, error: voidErr } = await clientOwnerA.rpc('void_sale_atomic', {
            p_business_id: profileOwnerA.business_id,
            p_sale_id: saleId,
            p_user_id: userOwnerA.id,
            p_reason: 'Uji void presisi',
        })
        assert.ok(!voidErr, `void_sale_atomic gagal: ${voidErr?.message}`)
        assert.equal(voidRes.success, true)

        // Verifikasi saldo kas kembali persis ke balanceBefore
        const { data: accAfter } = await clientOwnerA
            .from('financial_accounts')
            .select('current_balance')
            .eq('id', defaultCashAccount.id)
            .single()
        assert.equal(Number(accAfter.current_balance), balanceBefore, 'Saldo kas harus kembali utuh setelah void')

        // Verifikasi stok cabang pulih persis ke initialStock
        const { data: stockAfter } = await clientOwnerA
            .from('product_branch_stocks')
            .select('stock')
            .eq('product_id', testProduct.id)
            .eq('branch_id', activeBranch.id)
            .single()
        assert.equal(Number(stockAfter.stock), initialStock, 'Stok cabang harus pulih sempurna')

        // Verifikasi transaksi berstatus void tidak bisa diedit
        const { error: editVoidErr } = await clientOwnerA.rpc('update_sale_atomic', {
            p_sale_id: saleId,
            p_business_id: profileOwnerA.business_id,
            p_user_id: userOwnerA.id,
            p_channel: 'offline',
            p_payment_method: 'cash',
            p_total: total,
            p_items: [
                {
                    product_id: testProduct.id,
                    quantity: 1,
                    price: sellingPrice,
                    subtotal: sellingPrice,
                },
            ],
            p_old_data: {},
            p_new_data: {},
            p_reason: 'Coba edit',
        })
        assert.ok(editVoidErr, 'Transaksi voided harus ditolak edit')
        assert.match(editVoidErr.message, /telah dibatalkan \(voided\)/i)
    })
})
