import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
    calculateMerchandiseInventoryValue,
    resolveEffectiveBranchFilter,
} from '../lib/inventory-valuation.ts'

/**
 * P0: Neraca Finished Goods (Merchandise) Inventory Calculation Test Suite
 * Menguji langsung helper produksi dari `lib/inventory-valuation.ts` (tanpa duplikasi kode):
 * 1. Perhitungan satu cabang.
 * 2. Konsolidasi semua cabang.
 * 3. Produk lama yang belum memiliki baris stok cabang.
 * 4. Pencegahan penghitungan ganda.
 * 5. HPP kosong atau nol.
 * 6. Stok negatif.
 * 7. Query stok gagal tidak menyebabkan fallback ke `products.stock`.
 * 8. ID cabang tidak valid tidak menyebabkan label dan query berbeda.
 */

describe('P0: Neraca Finished Goods Inventory Calculation (Actual Helper)', () => {
    const mockBranches = [
        { id: 'b1', name: 'Senopati' },
        { id: 'b2', name: 'Kemang' },
    ]

    const mockProducts = [
        { id: 'p1', name: 'Dimsum Original', cost_price: 15_000, stock: 0, status: 'aktif' },
        { id: 'p2', name: 'Dimsum Mentai', cost_price: 25_000, stock: 0, status: 'aktif' },
        { id: 'p3', name: 'Es Teh Manis', cost_price: 2_000, stock: 0, status: 'aktif' },
        { id: 'p4', name: 'Menu Musiman (Nonaktif)', cost_price: 10_000, stock: 0, status: 'nonaktif' },
        { id: 'p5', name: 'Air Mineral (HPP 0/Belum Set)', cost_price: 0, stock: 0, status: 'aktif' },
    ]

    const mockBranchStocks = [
        // Cabang Senopati (b1)
        { product_id: 'p1', branch_id: 'b1', stock: 20 },  // 20 * 15k = 300k
        { product_id: 'p2', branch_id: 'b1', stock: 10 },  // 10 * 25k = 250k
        { product_id: 'p3', branch_id: 'b1', stock: 50 },  // 50 * 2k  = 100k
        { product_id: 'p4', branch_id: 'b1', stock: 5 },   // 5 * 10k  = 50k (nonaktif tapi ada fisik)
        { product_id: 'p5', branch_id: 'b1', stock: 30 },  // 30 * 0   = 0k

        // Cabang Kemang (b2)
        { product_id: 'p1', branch_id: 'b2', stock: 10 },  // 10 * 15k = 150k
        { product_id: 'p2', branch_id: 'b2', stock: 40 },  // 40 * 25k = 1.000k
        { product_id: 'p3', branch_id: 'b2', stock: -5 },  // -5 (stok minus di-clamp ke 0) = 0k
        { product_id: 'p4', branch_id: 'b2', stock: 0 },   // 0
        { product_id: 'p5', branch_id: 'b2', stock: 10 },  // 10 * 0 = 0k
    ]

    test('1. Perhitungan satu cabang: Menghitung persediaan hanya untuk cabang yang dipilih', () => {
        const senopatiRes = calculateMerchandiseInventoryValue({
            products: mockProducts,
            branchStocks: mockBranchStocks,
            selectedBranchId: 'b1',
        })
        assert.equal(senopatiRes.hasError, false)
        assert.equal(senopatiRes.value, 700_000, 'Persediaan Cabang Senopati harus tepat Rp 700.000')

        const kemangRes = calculateMerchandiseInventoryValue({
            products: mockProducts,
            branchStocks: mockBranchStocks,
            selectedBranchId: 'b2',
        })
        assert.equal(kemangRes.hasError, false)
        assert.equal(kemangRes.value, 1_150_000, 'Persediaan Cabang Kemang harus tepat Rp 1.150.000')
    })

    test('2. Konsolidasi semua cabang: Menjumlahkan seluruh stok cabang pada bisnis', () => {
        const consolidatedRes = calculateMerchandiseInventoryValue({
            products: mockProducts,
            branchStocks: mockBranchStocks,
            selectedBranchId: 'all',
        })
        assert.equal(consolidatedRes.hasError, false)
        assert.equal(consolidatedRes.value, 1_850_000, 'Persediaan Konsolidasi harus Rp 1.850.000')
    })

    test('3. Produk lama yang belum memiliki baris stok cabang: Tetap terhitung saat konsolidasi, tidak bocor ke cabang spesifik', () => {
        const productsWithLegacy = [
            ...mockProducts,
            { id: 'p-legacy', name: 'Produk Lama Pra-0014', cost_price: 20_000, stock: 5, status: 'aktif' }, // 5 * 20k = 100k
        ]

        const resAll = calculateMerchandiseInventoryValue({
            products: productsWithLegacy,
            branchStocks: mockBranchStocks,
            selectedBranchId: 'all',
        })
        assert.equal(resAll.hasError, false)
        assert.equal(resAll.value, 1_950_000, 'Konsolidasi harus mencakup 1.850.000 + 100.000 produk lama')

        const resBranch = calculateMerchandiseInventoryValue({
            products: productsWithLegacy,
            branchStocks: mockBranchStocks,
            selectedBranchId: 'b1',
        })
        assert.equal(resBranch.hasError, false)
        assert.equal(resBranch.value, 700_000, 'Cabang spesifik tidak boleh menghitung produk tanpa baris cabang')
    })

    test('4. Pencegahan penghitungan ganda: products.stock diabaikan jika produk sudah memiliki baris di product_branch_stocks', () => {
        const prodsWithLegacyColumn = mockProducts.map((p) => ({ ...p, stock: 999 }))

        const res = calculateMerchandiseInventoryValue({
            products: prodsWithLegacyColumn,
            branchStocks: mockBranchStocks,
            selectedBranchId: 'all',
        })
        assert.equal(res.hasError, false)
        assert.equal(res.value, 1_850_000, 'Stok tidak boleh dihitung dua kali dari products.stock')
    })

    test('5. HPP kosong atau nol: cost_price null/undefined/0 menghasilkan nilai 0 tanpa NaN', () => {
        const prodsNoHPP = [
            { id: 'p-null', cost_price: null, stock: 10 },
            { id: 'p-undef', cost_price: undefined, stock: 10 },
            { id: 'p-zero', cost_price: 0, stock: 10 },
        ]
        const branchStocks = [
            { product_id: 'p-null', branch_id: 'b1', stock: 100 },
            { product_id: 'p-undef', branch_id: 'b1', stock: 50 },
            { product_id: 'p-zero', branch_id: 'b1', stock: 25 },
        ]

        const res = calculateMerchandiseInventoryValue({
            products: prodsNoHPP,
            branchStocks,
            selectedBranchId: 'b1',
        })
        assert.equal(res.hasError, false)
        assert.equal(res.value, 0)
        assert.ok(!Number.isNaN(res.value))
    })

    test('6. Stok negatif: Di-clamp ke 0 agar nilai aset persediaan tidak negatif', () => {
        const negativeStocks = [
            { product_id: 'p1', branch_id: 'b1', stock: -10 },
        ]
        const res = calculateMerchandiseInventoryValue({
            products: mockProducts,
            branchStocks: negativeStocks,
            selectedBranchId: 'b1',
        })
        assert.equal(res.hasError, false)
        assert.equal(res.value, 0, 'Stok negatif harus di-clamp ke 0')
    })

    test('7. Query stok gagal TIDAK menyebabkan fallback ke products.stock dan tidak menyembunyikan error sebagai Rp0 valid', () => {
        const prodsWithStock = [
            { id: 'p1', cost_price: 15_000, stock: 100 }, // 1.500.000 di products.stock
        ]

        // Simulasi: query product_branch_stocks gagal (data: null, error: PostgrestError)
        const failedBranchStocksRes = calculateMerchandiseInventoryValue({
            products: prodsWithStock,
            branchStocks: null,
            selectedBranchId: 'all',
            productsError: null,
            branchStocksError: { code: '57014', message: 'statement timeout' },
        })

        assert.equal(failedBranchStocksRes.hasError, true, 'Harus menandai hasError = true saat query stok cabang gagal')
        assert.equal(failedBranchStocksRes.value, null, 'Tidak boleh fallback ke products.stock (1.500.000) atau mengklaim 0 valid')
        assert.match(failedBranchStocksRes.errorMessage, /Gagal memuat data stok produk per cabang/)

        // Simulasi: query produk/HPP gagal
        const failedProdsRes = calculateMerchandiseInventoryValue({
            products: null,
            branchStocks: mockBranchStocks,
            selectedBranchId: 'all',
            productsError: { code: '42501', message: 'permission denied' },
            branchStocksError: null,
        })

        assert.equal(failedProdsRes.hasError, true, 'Harus menandai hasError = true saat query produk gagal')
        assert.equal(failedProdsRes.value, null)
        assert.match(failedProdsRes.errorMessage, /Gagal memuat data harga modal \(HPP\) produk/)
    })

    test('8. Validasi cabang: ID cabang tidak valid atau milik bisnis lain dinormalisasi ke Konsolidasi (all) agar label dan query sinkron', () => {
        // Cabang valid milik bisnis
        const validFilter = resolveEffectiveBranchFilter('b1', mockBranches)
        assert.equal(validFilter.selectedBranchId, 'b1')
        assert.equal(validFilter.branchLabel, 'Cabang Senopati')

        // ID cabang tidak valid / sudah dihapus / milik tenant lain
        const invalidFilter = resolveEffectiveBranchFilter('branch-tenant-lain-999', mockBranches)
        assert.equal(invalidFilter.selectedBranchId, 'all', 'selectedBranchId harus fallback ke all, bukan mempertahankan ID tidak valid')
        assert.equal(invalidFilter.branchLabel, 'Semua Cabang (Konsolidasi)')
        assert.equal(invalidFilter.selectedBranch, undefined)

        // Jika hasil selectedBranchId yang sudah dinormalisasi dipakai menghitung persediaan, hasilnya konsisten dengan label Konsolidasi
        const calcWithNormalizedBranch = calculateMerchandiseInventoryValue({
            products: mockProducts,
            branchStocks: mockBranchStocks,
            selectedBranchId: invalidFilter.selectedBranchId,
        })
        assert.equal(calcWithNormalizedBranch.value, 1_850_000, 'Nilai persediaan harus konsisten dengan label Semua Cabang (Konsolidasi)')
    })
})
