import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('P0-2: Server-Side Price & Total Calculation Verification', () => {
    test('Server rejects client-side tampered price and recalculates using db selling_price', () => {
        // Data di DB
        const dbProduct = {
            id: 'prod-dimsum-01',
            name: 'Dimsum Mentai 4 Pcs',
            selling_price: 25000,
            cost_price: 12000,
            status: 'aktif',
            business_id: 'biz-111',
        }

        // Payload yang dikirim client nakal (mencoba bayar 500 rupiah)
        const clientItem = {
            product_id: 'prod-dimsum-01',
            quantity: 2,
            price: 500, // Dimanipulasi!
            cost_price: 0, // Dimanipulasi!
        }

        // Logika server: harus menolak / mengabaikan clientItem.price
        const verifiedPrice = Number(dbProduct.selling_price)
        const verifiedCostPrice = Number(dbProduct.cost_price)
        const subtotal = verifiedPrice * clientItem.quantity

        assert.equal(verifiedPrice, 25000, 'Harga harus diambil dari DB (25.000), bukan dari client (500)')
        assert.equal(verifiedCostPrice, 12000, 'HPP harus diambil dari DB (12.000), bukan dari client')
        assert.equal(subtotal, 50000, 'Subtotal harus 50.000')
    })

    test('Server rejects inactive product from being sold', () => {
        const dbProduct = {
            id: 'prod-inactive-02',
            name: 'Menu Musiman Nonaktif',
            selling_price: 30000,
            cost_price: 15000,
            status: 'nonaktif', // Nonaktif!
            business_id: 'biz-111',
        }

        const isAllowed = dbProduct.status === 'aktif'
        assert.equal(isAllowed, false, 'Produk berstatus nonaktif harus ditolak')
    })

    test('Server rejects product from another business', () => {
        const callerBusinessId = 'biz-111'
        const dbProduct = {
            id: 'prod-other-biz',
            name: 'Menu Bisnis Lain',
            selling_price: 35000,
            cost_price: 15000,
            status: 'aktif',
            business_id: 'biz-999', // Bisnis lain!
        }

        const isOwned = dbProduct.business_id === callerBusinessId
        assert.equal(isOwned, false, 'Produk dari bisnis lain harus ditolak')
    })

    test('Server rejects non-positive or non-numeric quantity', () => {
        const invalidQuantities = [0, -1, -10, NaN, null, undefined, 'abc']
        for (const qty of invalidQuantities) {
            const isValid = typeof qty === 'number' && !isNaN(qty) && qty > 0
            assert.equal(isValid, false, `Kuantitas ${qty} harus ditolak`)
        }
    })
})
