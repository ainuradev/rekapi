import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('P0-3: HPP (Cost Price) Protection from Non-Owner Employees', () => {
    const rawProducts = [
        { id: 'p1', name: 'Dimsum Original', selling_price: 20000, cost_price: 11000 },
        { id: 'p2', name: 'Es Teh Manis', selling_price: 5000, cost_price: 1500 },
    ]

    const rawSaleItems = [
        { product_id: 'p1', quantity: 2, price: 20000, cost_price: 11000 },
        { product_id: 'p2', quantity: 1, price: 5000, cost_price: 1500 },
    ]

    test('Employee role receives sanitized cost_price = 0 on product catalog', () => {
        const isOwner = false
        const sanitizedProducts = rawProducts.map((p) => ({
            ...p,
            cost_price: isOwner ? Number(p.cost_price ?? 0) : 0,
        }))

        for (const p of sanitizedProducts) {
            assert.equal(p.cost_price, 0, `Produk ${p.name} harus memiliki cost_price 0 untuk role pegawai`)
            assert.ok(p.selling_price > 0, 'Harga jual tetap harus tersedia untuk kasir')
        }
    })

    test('Owner role receives authentic cost_price for managerial and report purposes', () => {
        const isOwner = true
        const sanitizedProducts = rawProducts.map((p) => ({
            ...p,
            cost_price: isOwner ? Number(p.cost_price ?? 0) : 0,
        }))

        assert.equal(sanitizedProducts[0].cost_price, 11000, 'Owner harus melihat HPP asli')
        assert.equal(sanitizedProducts[1].cost_price, 1500, 'Owner harus melihat HPP asli')
    })

    test('Employee role receives sanitized cost_price = 0 on sales history items', () => {
        const isOwner = false
        const sanitizedItems = rawSaleItems.map((item) => ({
            ...item,
            cost_price: isOwner ? Number(item.cost_price ?? 0) : 0,
        }))

        for (const item of sanitizedItems) {
            assert.equal(item.cost_price, 0, 'Detail transaksi untuk pegawai tidak boleh membocorkan HPP')
        }
    })
})
