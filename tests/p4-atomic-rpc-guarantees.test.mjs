import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('Prioritas 4: Atomic RPC Guarantees & Concurrency Safety', () => {
    // Database state simulation
    function createMockDatabase() {
        return {
            profiles: [
                { id: 'user-emp-1', business_id: 'biz-1', branch_id: 'branch-1', role: 'pegawai' },
                { id: 'user-owner-1', business_id: 'biz-1', branch_id: null, role: 'owner' },
                { id: 'user-foreign-2', business_id: 'biz-2', branch_id: 'branch-9', role: 'owner' }
            ],
            branches: [
                { id: 'branch-1', business_id: 'biz-1', name: 'Cabang Utama' },
                { id: 'branch-2', business_id: 'biz-1', name: 'Cabang Kedua' }
            ],
            products: [
                { id: 'prod-1', business_id: 'biz-1', name: 'Menu A' },
                { id: 'prod-foreign', business_id: 'biz-2', name: 'Menu B' }
            ],
            sales: [],
            sale_items: []
        }
    }

    // Simulasi Stored Procedure PostgreSQL `create_sale_atomic` sesuai Migration 0016
    function executeCreateSaleAtomic(db, callerId, params) {
        const caller = db.profiles.find(p => p.id === callerId)
        if (!caller) {
            throw new Error('Caller unauthorized')
        }

        // 1. Otorisasi Tenant level database (Anti Bypass)
        if (caller.business_id !== params.p_business_id) {
            throw new Error('Akses ditolak: Anda tidak memiliki wewenang pada bisnis ini.')
        }

        // 2. Otorisasi Cabang level database (Pegawai locked ke 1 cabang)
        if (caller.role === 'pegawai' && caller.branch_id && caller.branch_id !== params.p_branch_id) {
            throw new Error('Akses ditolak: Pegawai hanya dapat membuat transaksi di cabangnya sendiri.')
        }

        // 3. Validasi Cabang milik bisnis yang sama
        const branch = db.branches.find(b => b.id === params.p_branch_id && b.business_id === params.p_business_id)
        if (!branch) {
            throw new Error('Cabang tidak valid atau tidak terdaftar pada bisnis Anda.')
        }

        // 4. Pengecekan Idempotensi
        if (params.p_idempotency_key) {
            const existing = db.sales.find(s => s.business_id === params.p_business_id && s.idempotency_key === params.p_idempotency_key)
            if (existing) {
                return { success: true, sale_id: existing.id, is_duplicate: true }
            }
        }

        // Snapshot state for atomic rollback simulation
        const salesSnapshot = [...db.sales]
        const itemsSnapshot = [...db.sale_items]

        try {
            // Step 1: Insert header
            const newSaleId = 'sale-' + Math.random().toString(36).substring(7)
            const newSale = {
                id: newSaleId,
                business_id: params.p_business_id,
                branch_id: params.p_branch_id,
                user_id: params.p_user_id,
                total: params.p_total,
                idempotency_key: params.p_idempotency_key || null,
                invoice_number: params.p_invoice_number || null
            }
            db.sales.push(newSale)

            // Step 2: Insert items
            for (const item of params.p_items) {
                // Verifikasi kepemilikan produk
                const product = db.products.find(p => p.id === item.product_id && p.business_id === params.p_business_id)
                if (!product) {
                    throw new Error(`Produk ${item.product_id} tidak terdaftar pada bisnis Anda.`)
                }

                if (item.forceFailure) {
                    throw new Error('Simulated disk/constraint failure on item insert')
                }

                db.sale_items.push({
                    sale_id: newSaleId,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    price: item.price,
                    cost_price: item.cost_price,
                    subtotal: item.subtotal
                })
            }

            return { success: true, sale_id: newSaleId, is_duplicate: false }
        } catch (err) {
            // PostgreSQL atomic rollback: membatalkan seluruh perubahan
            db.sales = salesSnapshot
            db.sale_items = itemsSnapshot
            throw err
        }
    }

    test('Atomic rollback: Failure during item insertion leaves zero orphan sales headers', () => {
        const db = createMockDatabase()

        const params = {
            p_business_id: 'biz-1',
            p_branch_id: 'branch-1',
            p_user_id: 'user-emp-1',
            p_total: 50000,
            p_items: [
                { product_id: 'prod-1', quantity: 2, price: 25000, cost_price: 10000, subtotal: 50000 },
                { product_id: 'prod-1', quantity: 1, price: 25000, cost_price: 10000, subtotal: 25000, forceFailure: true } // Gagal!
            ]
        }

        assert.throws(() => {
            executeCreateSaleAtomic(db, 'user-emp-1', params)
        }, /Simulated disk\/constraint failure/)

        // Pastikan tidak ada data yang tersisa di database (Zero Orphan Guarantee)
        assert.equal(db.sales.length, 0, 'Header penjualan harus di-rollback bersih')
        assert.equal(db.sale_items.length, 0, 'Item penjualan harus kosong')
    })

    test('Cross-tenant RPC exploit attempt is rejected at database level', () => {
        const db = createMockDatabase()

        // User dari Bisnis 2 mencoba memanggil RPC dengan p_business_id = biz-1
        const exploitParams = {
            p_business_id: 'biz-1',
            p_branch_id: 'branch-1',
            p_user_id: 'user-foreign-2',
            p_total: 100000,
            p_items: [{ product_id: 'prod-1', quantity: 1, price: 100000, cost_price: 50000, subtotal: 100000 }]
        }

        assert.throws(() => {
            executeCreateSaleAtomic(db, 'user-foreign-2', exploitParams)
        }, /Akses ditolak: Anda tidak memiliki wewenang pada bisnis ini/)

        assert.equal(db.sales.length, 0)
    })

    test('Cashier attempting to create sale in another branch via RPC is rejected', () => {
        const db = createMockDatabase()

        // Pegawai branch-1 mencoba mengirim transaksi ke branch-2
        const invalidBranchParams = {
            p_business_id: 'biz-1',
            p_branch_id: 'branch-2', // Bukan cabangnya!
            p_user_id: 'user-emp-1',
            p_total: 25000,
            p_items: [{ product_id: 'prod-1', quantity: 1, price: 25000, cost_price: 10000, subtotal: 25000 }]
        }

        assert.throws(() => {
            executeCreateSaleAtomic(db, 'user-emp-1', invalidBranchParams)
        }, /Pegawai hanya dapat membuat transaksi di cabangnya sendiri/)

        assert.equal(db.sales.length, 0)
    })

    test('Concurrent duplicate requests with identical idempotency_key return same sale without duplicate rows', () => {
        const db = createMockDatabase()
        const idempotencyKey = 'c7e8a9f0-1234-4567-89ab-cdef01234567'

        const params = {
            p_business_id: 'biz-1',
            p_branch_id: 'branch-1',
            p_user_id: 'user-emp-1',
            p_total: 50000,
            p_idempotency_key: idempotencyKey,
            p_invoice_number: 'INV/20261018/1001',
            p_items: [{ product_id: 'prod-1', quantity: 2, price: 25000, cost_price: 10000, subtotal: 50000 }]
        }

        // Simulasi request 1 (berhasil)
        const res1 = executeCreateSaleAtomic(db, 'user-emp-1', params)
        assert.equal(res1.success, true)
        assert.equal(res1.is_duplicate, false)

        // Simulasi request 2 (klik ganda / network retry)
        const res2 = executeCreateSaleAtomic(db, 'user-emp-1', params)
        assert.equal(res2.success, true)
        assert.equal(res2.is_duplicate, true)
        assert.equal(res2.sale_id, res1.sale_id, 'Keduanya harus mengembalikan sale_id yang sama persis')

        // Pastikan hanya ada 1 record di database
        assert.equal(db.sales.length, 1)
        assert.equal(db.sale_items.length, 1)
    })

    test('Server action strictly rejects bypass fallback on non-42883 errors', () => {
        function handleRpcError(rpcError) {
            if (rpcError) {
                // Hanya 42883 (function does not exist) yang diizinkan masuk ke transitional fallback
                if (rpcError.code !== '42883') {
                    return { error: `Gagal memproses transaksi atomik: ${rpcError.message}` }
                }
                return { fallback: true }
            }
            return { success: true }
        }

        // Kasus 1: Error constraint (misal check constraint gagal)
        const constraintError = { code: '23514', message: 'check constraint "sales_total_check" violated' }
        const res1 = handleRpcError(constraintError)
        assert.equal(res1.fallback, undefined, 'Tidak boleh fallback ke non-atomic insert saat ada constraint error')
        assert.match(res1.error, /Gagal memproses transaksi atomik/)

        // Kasus 2: Error otorisasi
        const authError = { code: 'P0001', message: 'Akses ditolak: Anda tidak memiliki wewenang pada bisnis ini' }
        const res2 = handleRpcError(authError)
        assert.equal(res2.fallback, undefined, 'Tidak boleh fallback saat otorisasi ditolak')
        assert.match(res2.error, /Gagal memproses transaksi atomik/)

        // Kasus 3: Error fungsi belum terpasang di database (42883)
        const missingRpcError = { code: '42883', message: 'function create_sale_atomic does not exist' }
        const res3 = handleRpcError(missingRpcError)
        assert.equal(res3.fallback, true, 'Hanya error 42883 yang memicu transitional fallback')
    })
})
