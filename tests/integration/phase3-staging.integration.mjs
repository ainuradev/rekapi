/**
 * Phase 3 / Tahap 1 Rekapi — Live Supabase STAGING Integration Tests.
 * Menguji Master Data, Customers, Extended Suppliers, Supplier Items, dan Branch Hierarchy.
 *
 * Jalankan HANYA terhadap project staging terisolasi:
 *   $env:RUN_STAGING_INTEGRATION="1"; node --test tests/integration/phase3-staging.integration.mjs
 *
 * Aturan Keamanan:
 *  - Project target WAJIB 'ucvgszazrjnjaglaiswq' (staging).
 *  - Production 'dnqzjrnyptwadojycxvm' DIBLOKIR KERAS.
 *  - Memakai JWT user nyata (Owner A, Employee A, Owner B) via Supabase Auth.
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
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
process.env.STAGING_EMPLOYEE_A_EMAIL = process.env.STAGING_EMPLOYEE_A_EMAIL || 'pegawai-a@rekapi-staging.test'
process.env.STAGING_OWNER_B_EMAIL = process.env.STAGING_OWNER_B_EMAIL || 'owner-b@rekapi-staging.test'

if (!process.env.STAGING_PROJECT_REF && process.env.STAGING_SUPABASE_URL) {
    const m = process.env.STAGING_SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)
    if (m) process.env.STAGING_PROJECT_REF = m[1]
}

const E = process.env

describe('Phase 3 / Tahap 1 — Master Data & Pelanggan Staging Integration Test', () => {
    let clientOwnerA
    let clientEmployeeA
    let clientOwnerB
    let userOwnerA
    let userEmployeeA
    let userOwnerB
    let profileOwnerA
    let profileEmployeeA
    let profileOwnerB

    // Cleanup trackers
    const createdCustomerIds = []
    const createdSupplierItemIds = []
    const createdSupplierIds = []
    const createdBranchIds = []

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

        const makeClient = () =>
            createClient(E.STAGING_SUPABASE_URL, E.STAGING_SUPABASE_ANON_KEY, {
                auth: { persistSession: false, autoRefreshToken: false },
            })

        clientOwnerA = makeClient()
        clientEmployeeA = makeClient()
        clientOwnerB = makeClient()

        // Login user Owner A, Employee A, Owner B
        const authA = await clientOwnerA.auth.signInWithPassword({
            email: E.STAGING_OWNER_A_EMAIL,
            password: E.STAGING_OWNER_A_PASSWORD,
        })
        assert.ok(!authA.error, `Login Owner A gagal: ${authA.error?.message}`)
        userOwnerA = authA.data.user

        const authEmp = await clientEmployeeA.auth.signInWithPassword({
            email: E.STAGING_EMPLOYEE_A_EMAIL,
            password: E.STAGING_EMPLOYEE_A_PASSWORD,
        })
        assert.ok(!authEmp.error, `Login Employee A gagal: ${authEmp.error?.message}`)
        userEmployeeA = authEmp.data.user

        const authB = await clientOwnerB.auth.signInWithPassword({
            email: E.STAGING_OWNER_B_EMAIL,
            password: E.STAGING_OWNER_B_PASSWORD,
        })
        assert.ok(!authB.error, `Login Owner B gagal: ${authB.error?.message}`)
        userOwnerB = authB.data.user

        // Fetch profiles
        const { data: profA } = await clientOwnerA.from('profiles').select('*').eq('id', userOwnerA.id).single()
        profileOwnerA = profA

        const { data: profEmp } = await clientEmployeeA.from('profiles').select('*').eq('id', userEmployeeA.id).single()
        profileEmployeeA = profEmp

        const { data: profB } = await clientOwnerB.from('profiles').select('*').eq('id', userOwnerB.id).single()
        profileOwnerB = profB
    })

    after(async () => {
        if (!E.RUN_STAGING_INTEGRATION) return

        // Cleanup created test records
        for (const id of createdSupplierItemIds) {
            await clientOwnerA.from('supplier_items').delete().eq('id', id)
        }
        for (const id of createdCustomerIds) {
            await clientOwnerA.from('customers').delete().eq('id', id)
        }
        for (const id of createdSupplierIds) {
            await clientOwnerA.from('suppliers').delete().eq('id', id)
        }
        for (const id of createdBranchIds) {
            await clientOwnerA.from('branches').delete().eq('id', id)
        }
    })

    test('0. Validasi Target Database & Environment Safety', () => {
        if (!E.RUN_STAGING_INTEGRATION) return
        assert.equal(E.STAGING_PROJECT_REF, ALLOWED_STAGING_REF)
        assert.ok(!FORBIDDEN_PRODUCTION_REFS.has(E.STAGING_PROJECT_REF))
        assert.ok(profileOwnerA?.business_id)
        assert.ok(profileOwnerB?.business_id)
        assert.notEqual(profileOwnerA.business_id, profileOwnerB.business_id)
    })

    test('1. CRUD Pelanggan (Customers) & Tenant Isolation RLS', async () => {
        if (!E.RUN_STAGING_INTEGRATION) return

        const testCode = `CUST-T1-${Date.now()}`
        // 1. Insert Pelanggan oleh Owner A
        const { data: custA, error: insErr } = await clientOwnerA
            .from('customers')
            .insert({
                business_id: profileOwnerA.business_id,
                code: testCode,
                name: 'Pelanggan Uji Tahap 1',
                phone: '081234567890',
                email: 'uji.tahap1@example.com',
                address: 'Jl. Uji Staging No. 1',
                category: 'member',
                default_discount_pct: 10,
                receivable_limit: 1000000,
                notes: 'Pelanggan loyal uji integrasi',
                status: 'active',
            })
            .select()
            .single()

        assert.ok(!insErr, `Insert customer gagal: ${insErr?.message}`)
        assert.ok(custA?.id)
        assert.equal(custA.name, 'Pelanggan Uji Tahap 1')
        assert.equal(custA.category, 'member')
        assert.equal(Number(custA.default_discount_pct), 10)
        assert.equal(Number(custA.receivable_limit), 1000000)
        createdCustomerIds.push(custA.id)

        // 2. Verifikasi Owner B TIDAK BISA membaca data pelanggan milik Owner A (RLS Isolation)
        const { data: readB, error: readBErr } = await clientOwnerB
            .from('customers')
            .select('*')
            .eq('id', custA.id)

        assert.ok(!readBErr, `Query Owner B error: ${readBErr?.message}`)
        assert.equal(readB.length, 0, 'Owner B tidak boleh dapat melihat pelanggan Owner A!')

        // 3. Employee A dapat membaca pelanggan dalam bisnis yang sama
        const { data: readEmp, error: readEmpErr } = await clientEmployeeA
            .from('customers')
            .select('*')
            .eq('id', custA.id)
            .single()

        assert.ok(!readEmpErr, `Employee A gagal membaca pelanggan: ${readEmpErr?.message}`)
        assert.equal(readEmp.id, custA.id)

        // 4. Update data pelanggan oleh Owner A
        const { error: updErr } = await clientOwnerA
            .from('customers')
            .update({ category: 'vip', default_discount_pct: 15 })
            .eq('id', custA.id)

        assert.ok(!updErr, `Update customer gagal: ${updErr?.message}`)

        const { data: updatedCust } = await clientOwnerA
            .from('customers')
            .select('category, default_discount_pct')
            .eq('id', custA.id)
            .single()

        assert.equal(updatedCust.category, 'vip')
        assert.equal(Number(updatedCust.default_discount_pct), 15)

        // 5. Unique constraint check: insert kode yang sama dalam bisnis yang sama harus ditolak
        const { error: dupErr } = await clientOwnerA
            .from('customers')
            .insert({
                business_id: profileOwnerA.business_id,
                code: testCode,
                name: 'Pelanggan Duplikat',
            })

        assert.ok(dupErr, 'Insert kode pelanggan duplikat wajib ditolak (23505)!')
    })

    test('2. Perluasan Master Suppliers & Isolasi Tenant', async () => {
        if (!E.RUN_STAGING_INTEGRATION) return

        const supCode = `SUP-T1-${Date.now()}`
        const { data: supA, error: supErr } = await clientOwnerA
            .from('suppliers')
            .insert({
                business_id: profileOwnerA.business_id,
                code: supCode,
                name: 'Vendor Pasokan Tahap 1',
                category: 'Bahan Mentah',
                pic_name: 'Bpk. Hendra Sales',
                phone: '081198765432',
                npwp: '01.234.567.8-901.000',
                payment_terms_days: 14,
                credit_limit: 15000000,
                status: 'active',
            })
            .select()
            .single()

        assert.ok(!supErr, `Insert supplier gagal: ${supErr?.message}`)
        assert.ok(supA?.id)
        assert.equal(supA.code, supCode)
        assert.equal(supA.category, 'Bahan Mentah')
        assert.equal(supA.pic_name, 'Bpk. Hendra Sales')
        assert.equal(supA.payment_terms_days, 14)
        assert.equal(Number(supA.credit_limit), 15000000)
        createdSupplierIds.push(supA.id)

        // Verifikasi Owner B tidak bisa membaca supplier milik Owner A
        const { data: supReadB } = await clientOwnerB
            .from('suppliers')
            .select('*')
            .eq('id', supA.id)

        assert.equal(supReadB.length, 0, 'Supplier Owner A tidak boleh bocor ke Owner B')
    })

    test('3. Relasi supplier_items & Penolakan Lintas Bisnis (Cross-Tenant Rejection)', async () => {
        if (!E.RUN_STAGING_INTEGRATION) return

        // Ambil bahan baku milik Owner A
        let { data: rawMatsA } = await clientOwnerA
            .from('raw_materials')
            .select('id')
            .eq('business_id', profileOwnerA.business_id)
            .limit(1)

        let matAId
        if (!rawMatsA || rawMatsA.length === 0) {
            // Buat bahan baku uji jika belum ada
            const { data: newMat } = await clientOwnerA
                .from('raw_materials')
                .insert({
                    business_id: profileOwnerA.business_id,
                    name: 'Kopi Uji Tahap 1',
                    unit: 'gram',
                    cost_per_unit: 100,
                })
                .select('id')
                .single()
            matAId = newMat?.id
        } else {
            matAId = rawMatsA[0].id
        }
        assert.ok(matAId, 'Bahan baku Owner A harus tersedia')

        const supplierId = createdSupplierIds[createdSupplierIds.length - 1]
        assert.ok(supplierId, 'Supplier Owner A harus tersedia')

        // 1. Hubungkan bahan baku A ke supplier A (Bisnis Sama) -> HARUS SUKSES
        const { data: sItem, error: sItemErr } = await clientOwnerA
            .from('supplier_items')
            .insert({
                business_id: profileOwnerA.business_id,
                supplier_id: supplierId,
                raw_material_id: matAId,
                supplier_product_code: 'VEND-KOP-01',
                last_price: 95,
                min_order_qty: 1000,
                lead_time_days: 2,
                is_preferred: true,
            })
            .select()
            .single()

        assert.ok(!sItemErr, `Insert supplier_items gagal: ${sItemErr?.message}`)
        assert.ok(sItem?.id)
        assert.equal(Number(sItem.last_price), 95)
        assert.equal(sItem.lead_time_days, 2)
        createdSupplierItemIds.push(sItem.id)

        // 2. DUA KALI INSERT BAHAN YANG SAMA -> HARUS DITOLAK (Unique Constraint)
        const { error: dupItemErr } = await clientOwnerA
            .from('supplier_items')
            .insert({
                business_id: profileOwnerA.business_id,
                supplier_id: supplierId,
                raw_material_id: matAId,
            })

        assert.ok(dupItemErr, 'Duplikasi bahan pada supplier yang sama harus ditolak!')

        // 3. UJI PENOLAKAN LINTAS TENANT: Coba hubungkan bahan baku milik Bisnis B ke supplier Bisnis A
        // Cari bahan baku milik Bisnis B
        let { data: rawMatsB } = await clientOwnerB
            .from('raw_materials')
            .select('id')
            .eq('business_id', profileOwnerB.business_id)
            .limit(1)

        let matBId
        if (!rawMatsB || rawMatsB.length === 0) {
            const { data: newMatB } = await clientOwnerB
                .from('raw_materials')
                .insert({
                    business_id: profileOwnerB.business_id,
                    name: 'Bahan Baku Bisnis B',
                    unit: 'kg',
                    cost_per_unit: 50000,
                })
                .select('id')
                .single()
            matBId = newMatB?.id
        } else {
            matBId = rawMatsB[0].id
        }

        if (matBId) {
            // Owner A mencoba menghubungkan bahan baku milik Bisnis B
            const { error: crossTenantErr } = await clientOwnerA
                .from('supplier_items')
                .insert({
                    business_id: profileOwnerA.business_id,
                    supplier_id: supplierId,
                    raw_material_id: matBId, // Milik bisnis B!
                })

            assert.ok(
                crossTenantErr,
                'Menghubungkan supplier dengan bahan baku lintas bisnis WAJIB ditolak oleh database trigger!'
            )
        }
    })

    test('4. Perluasan Cabang & Pencegahan Siklus Hierarki (Cycle Prevention)', async () => {
        if (!E.RUN_STAGING_INTEGRATION) return

        // 1. Buat Cabang Induk (Dapur Pusat)
        const { data: branchP, error: errP } = await clientOwnerA
            .from('branches')
            .insert({
                business_id: profileOwnerA.business_id,
                name: 'Dapur Sentral Uji',
                code: `CK-${Date.now()}`,
                branch_type: 'central_kitchen',
                city: 'Jakarta',
                ownership_status: 'owned',
                status: 'active',
            })
            .select()
            .single()

        if (errP && errP.message?.toLowerCase().includes('limit')) {
            console.log('ℹ️ Kuota cabang tercapai pada subscription staging, melewati tes hierarki cabang baru.')
            return
        }

        assert.ok(!errP, `Insert cabang induk gagal: ${errP?.message}`)
        assert.ok(branchP?.id)
        assert.equal(branchP.branch_type, 'central_kitchen')
        createdBranchIds.push(branchP.id)

        // 2. Coba set parent_branch_id ke dirinya sendiri (Self-Parenting) -> WAJIB DITOLAK
        const { error: selfParentErr } = await clientOwnerA
            .from('branches')
            .update({ parent_branch_id: branchP.id })
            .eq('id', branchP.id)

        assert.ok(
            selfParentErr,
            'Cabang tidak boleh diizinkan menjadi induk bagi dirinya sendiri (chk_branch_parent_not_self / trigger)!'
        )

        // 3. Coba set parent_branch_id ke cabang milik Bisnis B -> WAJIB DITOLAK
        const { data: branchB } = await clientOwnerB
            .from('branches')
            .select('id')
            .eq('business_id', profileOwnerB.business_id)
            .limit(1)
            .single()

        if (branchB) {
            const { error: crossBizParentErr } = await clientOwnerA
                .from('branches')
                .update({ parent_branch_id: branchB.id })
                .eq('id', branchP.id)

            assert.ok(
                crossBizParentErr,
                'Cabang induk dari bisnis lain WAJIB ditolak oleh trigger fn_validate_branch_hierarchy!'
            )
        }
    })

    test('5. Backward Compatibility: Transaksi Penjualan Kasir POS Tanpa Pelanggan Tetap Berjalan', async () => {
        if (!E.RUN_STAGING_INTEGRATION) return

        // Ambil cabang dan produk milik Owner A
        const { data: branch } = await clientOwnerA
            .from('branches')
            .select('id')
            .eq('business_id', profileOwnerA.business_id)
            .limit(1)
            .single()

        const { data: product } = await clientOwnerA
            .from('products')
            .select('id, selling_price, status')
            .eq('business_id', profileOwnerA.business_id)
            .eq('status', 'aktif')
            .limit(1)
            .single()

        if (!branch || !product) {
            console.log('ℹ️ Produk aktif atau cabang tidak ditemukan untuk transaksi, skip transaksi RPC.')
            return
        }

        const testIdempotencyKey = '00000000-0000-0000-0000-' + String(Date.now()).slice(-12)
        const itemPrice = Number(product.selling_price)

        // Panggil create_sale_atomic persis seperti alur kasir POS (tanpa customer_id)
        const { data: rpcRes, error: rpcErr } = await clientOwnerA.rpc('create_sale_atomic', {
            p_business_id: profileOwnerA.business_id,
            p_branch_id: branch.id,
            p_user_id: userOwnerA.id,
            p_channel: 'offline',
            p_payment_method: 'cash',
            p_total: itemPrice,
            p_items: [
                {
                    product_id: product.id,
                    quantity: 1,
                    price: itemPrice,
                    cost_price: 0,
                    subtotal: itemPrice,
                },
            ],
            p_idempotency_key: testIdempotencyKey,
            p_invoice_number: `INV/TEST/${Date.now().toString().slice(-4)}`,
        })

        assert.ok(!rpcErr, `Eksekusi create_sale_atomic gagal: ${rpcErr?.message}`)
        assert.ok(rpcRes?.success, 'RPC create_sale_atomic harus sukses')
        assert.ok(rpcRes?.sale_id, 'sale_id harus terisi')

        // Verifikasi baris sales di database memiliki customer_id = null
        const { data: saleRow, error: saleErr } = await clientOwnerA
            .from('sales')
            .select('id, customer_id, total')
            .eq('id', rpcRes.sale_id)
            .single()

        assert.ok(!saleErr, `Query sales gagal: ${saleErr?.message}`)
        assert.equal(saleRow.customer_id, null, 'customer_id harus null untuk transaksi walk-in biasa')
        assert.equal(Number(saleRow.total), itemPrice)
    })
})
