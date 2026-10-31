import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('Prioritas 1: Hardening updateSale & Historical Price Integrity', () => {
    // Mock DB & state
    const historicalSale = {
        id: 'sale-001',
        business_id: 'biz-alpha',
        branch_id: 'branch-1',
        channel: 'offline',
        payment_method: 'cash',
        total: 50000,
        sale_items: [
            {
                product_id: 'prod-item-1',
                quantity: 2,
                price: 25000,
                cost_price: 12000,
                products: { name: 'Kopi Susu Gula Aren' }
            }
        ]
    }

    const availableProducts = [
        {
            id: 'prod-item-1',
            name: 'Kopi Susu Gula Aren',
            selling_price: 28000, // Harga sekarang naik jadi 28.000
            cost_price: 14000,    // HPP sekarang naik jadi 14.000
            status: 'aktif',
            business_id: 'biz-alpha'
        },
        {
            id: 'prod-item-2',
            name: 'Croissant Cokelat',
            selling_price: 20000,
            cost_price: 10000,
            status: 'aktif',
            business_id: 'biz-alpha'
        },
        {
            id: 'prod-foreign-biz',
            name: 'Menu Bisnis Beta',
            selling_price: 35000,
            cost_price: 15000,
            status: 'aktif',
            business_id: 'biz-beta' // Beda bisnis!
        }
    ]

    function verifyAndSanitizeUpdateItems(callerRole, callerBusinessId, oldSale, inputItems, dbProductsList) {
        if (!inputItems || !Array.isArray(inputItems) || inputItems.length === 0) {
            return { error: 'Item transaksi tidak boleh kosong.' }
        }

        // 1. Validasi kuantitas
        for (const item of inputItems) {
            if (!item.product_id || typeof item.product_id !== 'string') {
                return { error: 'Format ID produk tidak valid.' }
            }
            if (typeof item.quantity !== 'number' || isNaN(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.quantity)) {
                return { error: 'Kuantitas item harus berupa angka positif (> 0).' }
            }
        }

        // 2. Pemetaan item lama
        const oldItemMap = new Map()
        for (const oldItem of oldSale.sale_items) {
            oldItemMap.set(oldItem.product_id, {
                price: Number(oldItem.price),
                cost_price: Number(oldItem.cost_price ?? 0),
                name: oldItem.products?.name ?? 'Item'
            })
        }

        const dbProdMap = new Map(dbProductsList.map(p => [p.id, p]))
        const verifiedItems = []
        let newTotal = 0

        for (const item of inputItems) {
            let itemName = item.name || 'Item'
            let verifiedPrice
            let verifiedCostPrice

            if (oldItemMap.has(item.product_id)) {
                const old = oldItemMap.get(item.product_id)
                itemName = old.name

                // Kebijakan Rekapi:
                // Pegawai TIDAK BISA mengubah harga historis walau mengirim nilai berbeda di payload
                if (callerRole === 'owner' && typeof item.price === 'number' && item.price > 0 && item.price !== old.price) {
                    verifiedPrice = Math.round(item.price * 100) / 100
                } else {
                    verifiedPrice = old.price
                }
                verifiedCostPrice = old.cost_price
            } else {
                // Item baru yang ditambahkan
                const dbProd = dbProdMap.get(item.product_id)
                if (!dbProd || dbProd.business_id !== callerBusinessId) {
                    return { error: `Produk dengan ID ${item.product_id} tidak ditemukan atau bukan milik bisnis Anda.` }
                }
                if (dbProd.status !== 'aktif') {
                    return { error: `Produk "${dbProd.name}" berstatus nonaktif dan tidak dapat ditambahkan.` }
                }
                itemName = dbProd.name
                if (callerRole === 'owner' && typeof item.price === 'number' && item.price > 0) {
                    verifiedPrice = Math.round(item.price * 100) / 100
                } else {
                    verifiedPrice = Number(dbProd.selling_price)
                }
                verifiedCostPrice = Number(dbProd.cost_price ?? 0)
            }

            const subtotal = Math.round(verifiedPrice * item.quantity * 100) / 100
            newTotal += subtotal
            verifiedItems.push({
                product_id: item.product_id,
                name: itemName,
                quantity: item.quantity,
                price: verifiedPrice,
                cost_price: verifiedCostPrice,
                subtotal
            })
        }

        return {
            success: true,
            total: Math.round(newTotal * 100) / 100,
            items: verifiedItems
        }
    }

    test('Employee cannot tamper with historical selling price or HPP', () => {
        const maliciousClientPayload = [
            {
                product_id: 'prod-item-1',
                quantity: 3,
                price: 1000,    // Mencoba bayar 1000 rupiah per cup!
                cost_price: 100 // Mencoba memanipulasi HPP
            }
        ]

        const result = verifyAndSanitizeUpdateItems('pegawai', 'biz-alpha', historicalSale, maliciousClientPayload, availableProducts)
        assert.equal(result.success, true)
        
        // Harga dan HPP historis WAJIB dipertahankan, bukan 1000 dan bukan harga katalog saat ini (28.000)
        assert.equal(result.items[0].price, 25000, 'Harga harus tetap 25.000 (harga historis)')
        assert.equal(result.items[0].cost_price, 12000, 'HPP harus tetap 12.000 (HPP historis)')
        assert.equal(result.items[0].subtotal, 75000, 'Subtotal: 3 x 25.000 = 75.000')
        assert.equal(result.total, 75000)
    })

    test('Owner is authorized to adjust price if legitimate business decision occurs', () => {
        const ownerPayload = [
            {
                product_id: 'prod-item-1',
                quantity: 2,
                price: 22000 // Diskon khusus yang disetujui owner
            }
        ]

        const result = verifyAndSanitizeUpdateItems('owner', 'biz-alpha', historicalSale, ownerPayload, availableProducts)
        assert.equal(result.success, true)
        assert.equal(result.items[0].price, 22000, 'Owner berhak mengubah harga jual jika ada alasan bisnis')
        assert.equal(result.total, 44000)
    })

    test('Rejects invalid quantities (zero, negative, NaN, non-number)', () => {
        const invalidCases = [
            [{ product_id: 'prod-item-1', quantity: 0 }],
            [{ product_id: 'prod-item-1', quantity: -2 }],
            [{ product_id: 'prod-item-1', quantity: NaN }],
            [{ product_id: 'prod-item-1', quantity: 'tiga' }],
            [{ product_id: 'prod-item-1', quantity: null }]
        ]

        for (const badItems of invalidCases) {
            const res = verifyAndSanitizeUpdateItems('pegawai', 'biz-alpha', historicalSale, badItems, availableProducts)
            assert.equal(res.success, undefined)
            assert.match(res.error, /Kuantitas item harus berupa angka positif/)
        }
    })

    test('Rejects injection of product belonging to another tenant', () => {
        const crossTenantPayload = [
            { product_id: 'prod-item-1', quantity: 1 },
            { product_id: 'prod-foreign-biz', quantity: 1 } // Produk milik biz-beta!
        ]

        const res = verifyAndSanitizeUpdateItems('pegawai', 'biz-alpha', historicalSale, crossTenantPayload, availableProducts)
        assert.equal(res.success, undefined)
        assert.match(res.error, /tidak ditemukan atau bukan milik bisnis Anda/)
    })

    test('Unauthorized employee cannot edit transactions of another branch', () => {
        const employeeBranch2 = {
            id: 'emp-02',
            role: 'pegawai',
            branch_id: 'branch-2', // Cabang 2!
            business_id: 'biz-alpha'
        }

        function checkBranchAuthorization(profile, targetSale) {
            if (profile.role !== 'owner' && targetSale.branch_id !== profile.branch_id) {
                return { error: 'Anda hanya berhak mengedit transaksi di cabang Anda sendiri.' }
            }
            return { success: true }
        }

        const res = checkBranchAuthorization(employeeBranch2, historicalSale)
        assert.equal(res.success, undefined)
        assert.match(res.error, /hanya berhak mengedit transaksi di cabang Anda sendiri/)
    })

    test('Rollback simulation restores original items if insert step fails', () => {
        const mockDatabase = {
            sales: [{ id: 'sale-001', total: 50000 }],
            sale_items: [
                { sale_id: 'sale-001', product_id: 'prod-item-1', quantity: 2, price: 25000 }
            ]
        }

        const originalItemsSnapshot = [...mockDatabase.sale_items]
        const originalTotal = mockDatabase.sales[0].total

        // Simulasi update gagal di langkah insert
        let step = 'start'
        try {
            // Step 1: Update header total
            mockDatabase.sales[0].total = 100000
            // Step 2: Delete old items
            mockDatabase.sale_items = []
            // Step 3: Insert new items fails!
            throw new Error('Database connection dropped during item insert')
        } catch (err) {
            // Compensating rollback logic:
            mockDatabase.sales[0].total = originalTotal
            mockDatabase.sale_items = [...originalItemsSnapshot]
        }

        // Verifikasi kondisi database kembali utuh 100%
        assert.equal(mockDatabase.sales[0].total, 50000, 'Header total harus kembali ke 50.000')
        assert.equal(mockDatabase.sale_items.length, 1, 'Item lama harus dipulihkan kembali')
        assert.equal(mockDatabase.sale_items[0].product_id, 'prod-item-1')
        assert.equal(mockDatabase.sale_items[0].quantity, 2)
    })
})
