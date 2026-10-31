import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
    computeEffectiveEditAvailableStock,
    computeExactStockDeduction,
    computeExactStockRestoration,
    formatInsufficientStockError,
    resolveBranchProductStock,
    validateSaleStockAvailability,
} from '../lib/sale-stock-integrity.ts'

describe('P0: Strict Stock Validation (No Oversell) pada Edit Riwayat Transaksi & Transaksi Baru', () => {
    test('1. Skenario 1: Stok awal 8 -> Jual 2 (sisa 6) -> Edit transaksi jadi 8 (BERHASIL, sisa stok 0)', () => {
        let branchStock = 8

        // Transaksi awal: jual 2 unit -> stok cabang tersisa 6
        const initialSale = computeExactStockDeduction(branchStock, 2)
        branchStock = initialSale.newStock
        assert.equal(initialSale.deducted, 2)
        assert.equal(branchStock, 6, 'Sisa stok cabang setelah jual 2 adalah 6')

        const oldItems = [
            {
                product_id: 'prod-kopi',
                quantity: 2,
                branch_stock_deducted: initialSale.deducted,
            },
        ]

        const stockByProductId = new Map([
            ['prod-kopi', { currentStock: branchStock, name: 'Kopi Susu Aren' }],
        ])

        // Edit kuantitas menjadi 8 -> Stok efektif tersedia = 6 + 2 = 8 -> BERHASIL
        const check = validateSaleStockAvailability({
            requestedItems: [{ product_id: 'prod-kopi', name: 'Kopi Susu Aren', quantity: 8 }],
            oldItems,
            stockByProductId,
        })

        assert.equal(check.ok, true, 'Edit menjadi 8 wajib berhasil karena stok efektif 6 + 2 = 8')
        assert.equal(check.availableByProduct.get('prod-kopi'), 8)

        // Simulasi mutasi atomik DB: pulihkan stok lama (6 + 2 = 8), lalu potong baru (8 - 8 = 0)
        const restored = computeExactStockRestoration(initialSale.deducted, 2, 'completed')
        branchStock += restored
        assert.equal(branchStock, 8)

        const newDeduction = computeExactStockDeduction(branchStock, 8)
        branchStock = newDeduction.newStock
        assert.equal(newDeduction.deducted, 8)
        assert.equal(branchStock, 0, 'Sisa stok cabang akhir tepat 0')
    })

    test('2. Skenario 2: Stok awal 8 -> Jual 2 (sisa 6) -> Edit transaksi jadi 10 (DITOLAK karena tersedia maksimal 8)', () => {
        let branchStock = 8

        // Transaksi awal: jual 2 unit -> stok cabang tersisa 6
        const initialSale = computeExactStockDeduction(branchStock, 2)
        branchStock = initialSale.newStock
        assert.equal(branchStock, 6)

        const oldItems = [
            {
                product_id: 'prod-kopi',
                quantity: 2,
                branch_stock_deducted: initialSale.deducted,
            },
        ]

        const stockByProductId = new Map([
            ['prod-kopi', { currentStock: branchStock, name: 'Kopi Susu Aren' }],
        ])

        // Coba edit kuantitas menjadi 10 -> DITOLAK karena total tersedia hanya 6 + 2 = 8
        const check = validateSaleStockAvailability({
            requestedItems: [{ product_id: 'prod-kopi', name: 'Kopi Susu Aren', quantity: 10 }],
            oldItems,
            stockByProductId,
        })

        assert.equal(check.ok, false, 'Edit menjadi 10 wajib ditolak keras')
        assert.equal(check.availableStock, 8)
        assert.equal(check.requestedQty, 10)
        assert.equal(
            check.error,
            'Stok produk Kopi Susu Aren tidak mencukupi. Stok tersedia maksimal: 8'
        )
    })

    test('3. Skenario 3: Stok sisa 8 -> Edit transaksi tambah item baru (old_qty = 0) jadi 10 (DITOLAK)', () => {
        // Struk lama hanya berisi produk lain (prod-roti), sedangkan prod-matcha adalah item baru (old_qty = 0)
        const oldItems = [
            {
                product_id: 'prod-roti',
                quantity: 1,
                branch_stock_deducted: 1,
            },
        ]

        const stockByProductId = new Map([
            ['prod-roti', { currentStock: 5, name: 'Roti Bakar' }],
            ['prod-matcha', { currentStock: 8, name: 'Matcha Latte' }],
        ])

        const check = validateSaleStockAvailability({
            requestedItems: [
                { product_id: 'prod-roti', name: 'Roti Bakar', quantity: 1 },
                { product_id: 'prod-matcha', name: 'Matcha Latte', quantity: 10 },
            ],
            oldItems,
            stockByProductId,
        })

        assert.equal(check.ok, false, 'Item baru dengan qty 10 saat stok sisa 8 wajib ditolak')
        assert.equal(check.productId, 'prod-matcha')
        assert.equal(check.availableStock, 8)
        assert.equal(
            check.error,
            'Stok produk Matcha Latte tidak mencukupi. Stok tersedia maksimal: 8'
        )
    })

    test('4. Transaksi Baru POS (createSale) & Proteksi Duplikasi Baris Produk dalam Payload', () => {
        const stockByProductId = new Map([
            ['prod-dimsum', { currentStock: 8, name: 'Dimsum Mentai' }],
        ])

        // Transaksi baru beli 8 -> BERHASIL
        const okSale = validateSaleStockAvailability({
            requestedItems: [{ product_id: 'prod-dimsum', name: 'Dimsum Mentai', quantity: 8 }],
            oldItems: [],
            stockByProductId,
        })
        assert.equal(okSale.ok, true)

        // Transaksi baru beli 10 -> DITOLAK
        const overSale = validateSaleStockAvailability({
            requestedItems: [{ product_id: 'prod-dimsum', name: 'Dimsum Mentai', quantity: 10 }],
            oldItems: [],
            stockByProductId,
        })
        assert.equal(overSale.ok, false)
        assert.equal(
            overSale.error,
            formatInsufficientStockError('Dimsum Mentai', 8)
        )

        // Upaya bypass dengan memecah 5 + 5 menjadi 2 elemen array untuk product_id yang sama -> DITOLAK
        const splitBypass = validateSaleStockAvailability({
            requestedItems: [
                { product_id: 'prod-dimsum', name: 'Dimsum Mentai', quantity: 5 },
                { product_id: 'prod-dimsum', name: 'Dimsum Mentai', quantity: 5 },
            ],
            oldItems: [],
            stockByProductId,
        })
        assert.equal(splitBypass.ok, false)
        assert.equal(splitBypass.requestedQty, 10)
        assert.equal(splitBypass.availableStock, 8)
    })

    test('5. Isolasi Stok Antar Cabang & Kompatibilitas Transaksi Oversell Historis', () => {
        const branchStocks = [
            { product_id: 'prod-1', branch_id: 'branch-a', stock: 8 },
        ]

        // Cabang A memiliki stok 8
        assert.equal(
            resolveBranchProductStock({
                productId: 'prod-1',
                branchId: 'branch-a',
                branchStocks,
                fallbackProductStock: 8,
            }),
            8
        )

        // Cabang B belum memiliki baris di product_branch_stocks padahal prod-1 sudah multi-cabang -> wajib 0 (tidak bocor 8)
        assert.equal(
            resolveBranchProductStock({
                productId: 'prod-1',
                branchId: 'branch-b',
                branchStocks,
                fallbackProductStock: 8,
            }),
            0
        )

        // Jika transaksi lama sebelum perbaikan sempat oversell (old_qty = 10, tapi stok fisik yang benar-benar terpotong = 8, sisa = 0),
        // maka stok efektif tersedia saat diedit tetap 8 (bukan 10 fiktif).
        assert.equal(computeEffectiveEditAvailableStock(0, 10, 8), 8)
        // Untuk transaksi normal (old_qty = 2, deducted = 2, sisa = 6), stok efektif = 8
        assert.equal(computeEffectiveEditAvailableStock(6, 2, 2), 8)
        assert.equal(computeEffectiveEditAvailableStock(6, 2, null), 8)
    })

    test('6. Verifikasi kontrak kode berlapis (UI Modal Edit + Server Actions + SQL Migration 0034)', () => {
        const sql = fs.readFileSync(
            path.resolve('supabase/migrations/0034_strict_stock_validation_no_oversell.sql'),
            'utf8'
        )
        const riwayatAction = fs.readFileSync(
            path.resolve('app/dashboard/penjualan/riwayat/actions.ts'),
            'utf8'
        )
        const posAction = fs.readFileSync(
            path.resolve('app/dashboard/penjualan/actions.ts'),
            'utf8'
        )
        const editModal = fs.readFileSync(
            path.resolve('app/dashboard/penjualan/riwayat/edit-sale-modal.tsx'),
            'utf8'
        )

        // Database RPC & Trigger: validasi stok ketat + RAISE EXCEPTION P0001
        assert.match(sql, /create\s+or\s+replace\s+function\s+update_sale_atomic/i)
        assert.match(sql, /create\s+or\s+replace\s+function\s+create_sale_atomic/i)
        assert.match(sql, /create\s+or\s+replace\s+function\s+fn_deduct_stock_on_sale/i)
        assert.match(sql, /Stok produk % tidak mencukupi\. Stok tersedia maksimal: %/)
        assert.match(sql, /using\s+errcode\s*=\s*'P0001'/i)

        // Server Actions menggunakan validateSaleStockAvailability
        assert.match(riwayatAction, /validateSaleStockAvailability/)
        assert.match(posAction, /validateSaleStockAvailability/)

        // Client UI Modal Edit menggunakan validateSaleStockAvailability & formatInsufficientStockError
        assert.match(editModal, /validateSaleStockAvailability/)
        assert.match(editModal, /formatInsufficientStockError/)
    })
})

