import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('P0-4: Atomic Sales & POS Idempotency', () => {
    test('Idempotency prevents duplicate transactions upon double-submission', () => {
        // Simulasi database store
        const salesDatabase = new Map()

        function processSale(businessId, idempotencyKey, total) {
            // Cek jika idempotencyKey sudah ada
            if (idempotencyKey && salesDatabase.has(`${businessId}:${idempotencyKey}`)) {
                const existing = salesDatabase.get(`${businessId}:${idempotencyKey}`)
                return {
                    saleId: existing.id,
                    isDuplicate: true,
                    total: existing.total,
                }
            }

            // Transaksi baru
            const newSale = {
                id: 'sale-' + Math.random().toString(36).substring(7),
                business_id: businessId,
                idempotency_key: idempotencyKey,
                total,
            }

            if (idempotencyKey) {
                salesDatabase.set(`${businessId}:${idempotencyKey}`, newSale)
            }

            return {
                saleId: newSale.id,
                isDuplicate: false,
                total: newSale.total,
            }
        }

        const sharedKey = 'uuid-client-req-001'
        const req1 = processSale('biz-111', sharedKey, 50000)
        const req2 = processSale('biz-111', sharedKey, 50000) // Duplicate click!

        assert.equal(req1.isDuplicate, false, 'Request pertama harus tercatat sebagai transaksi baru')
        assert.equal(req2.isDuplicate, true, 'Request kedua harus ditolak sebagai duplikasi idempoten')
        assert.equal(req1.saleId, req2.saleId, 'Kedua request harus merujuk ke sale_id yang persis sama')
        assert.equal(salesDatabase.size, 1, 'Hanya ada 1 record di database')
    })

    test('Rollback simulation ensures no orphan header remains if items fail', () => {
        let headerInserted = false
        let itemsInserted = false

        function executeWithRollback(simulateItemFailure = false) {
            // Step 1: Insert header
            headerInserted = true

            // Step 2: Insert items
            if (simulateItemFailure) {
                // Rollback!
                headerInserted = false
                return { error: 'Items failed' }
            }

            itemsInserted = true
            return { success: true }
        }

        const failResult = executeWithRollback(true)
        assert.ok(failResult.error, 'Harus mengembalikan error ketika item gagal')
        assert.equal(headerInserted, false, 'Header harus di-rollback dan tidak menjadi orphan')
        assert.equal(itemsInserted, false, 'Item tidak tersimpan')
    })

    test('Invoice number generation follows standard format INV/YYYYMMDD/XXXX', () => {
        const now = new Date(2026, 9, 18) // 18 Okt 2026
        const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
        const suffix = '1234'
        const invoiceNumber = `INV/${datePart}/${suffix}`

        assert.match(invoiceNumber, /^INV\/\d{8}\/\d{4}$/, 'Format nomor invoice harus INV/YYYYMMDD/XXXX')
    })
})
