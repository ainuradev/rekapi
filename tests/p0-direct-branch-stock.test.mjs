import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
    initializeNewProductBranchStocks,
    authorizeBranchStockMutation,
    applyDirectBranchStockUpdate,
    computeAggregateProductStock,
} from '../lib/product-stock.ts'
import { calculateMerchandiseInventoryValue } from '../lib/inventory-valuation.ts'
import {
    computeExactStockDeduction,
    computeExactStockRestoration,
} from '../lib/sale-stock-integrity.ts'

describe('P0: Direct Branch Stock Architecture & Employee Branch Stock Authorization', () => {
    const threeBranches = [
        { id: 'branch-1', name: 'Cabang Utama' },
        { id: 'branch-2', name: 'Cabang Kedua' },
        { id: 'branch-3', name: 'Cabang Ketiga' },
    ]

    test('1. Produk baru dengan stok awal 50 pada bisnis 3 cabang menghasilkan total konsolidasi 50 (bukan 150)', () => {
        // Default (tanpa filter cabang aktif): masuk ke cabang pertama/utama saja
        const initDefault = initializeNewProductBranchStocks(50, threeBranches, null)

        assert.equal(initDefault.targetBranchId, 'branch-1')
        assert.deepEqual(initDefault.branchStocks, [
            { branch_id: 'branch-1', stock: 50 },
            { branch_id: 'branch-2', stock: 0 },
            { branch_id: 'branch-3', stock: 0 },
        ])
        assert.equal(initDefault.aggregateStock, 50, 'Total stok konsolidasi wajib 50, bukan 150')

        // Jika ditambahkan saat aktif di Cabang Kedua: masuk ke Cabang Kedua, lainnya 0
        const initPreferred = initializeNewProductBranchStocks(50, threeBranches, 'branch-2')
        assert.equal(initPreferred.targetBranchId, 'branch-2')
        assert.deepEqual(initPreferred.branchStocks, [
            { branch_id: 'branch-1', stock: 0 },
            { branch_id: 'branch-2', stock: 50 },
            { branch_id: 'branch-3', stock: 0 },
        ])
        assert.equal(initPreferred.aggregateStock, 50)
    })

    test('2. updateBranchStock mengubah stok cabang langsung & menyinkronkan products.stock = SUM seluruh cabang (konsisten dengan Neraca)', () => {
        const init = initializeNewProductBranchStocks(50, threeBranches, null)

        // Tambah stok Cabang 2 menjadi 30 -> tidak mengurangi Cabang 1 dan tidak butuh "stok gudang induk"
        const afterBranch2 = applyDirectBranchStockUpdate(init.branchStocks, 'branch-2', 30)
        assert.deepEqual(afterBranch2.branchStocks, [
            { branch_id: 'branch-1', stock: 50 },
            { branch_id: 'branch-2', stock: 30 },
            { branch_id: 'branch-3', stock: 0 },
        ])
        assert.equal(afterBranch2.aggregateStock, 80, 'products.stock otomatis menjadi 50 + 30 + 0 = 80')

        // Kurangi stok Cabang 1 dari 50 menjadi 20 -> tidak memindahkan selisih 30 ke stok induk fiktif
        const afterBranch1 = applyDirectBranchStockUpdate(afterBranch2.branchStocks, 'branch-1', 20)
        assert.deepEqual(afterBranch1.branchStocks, [
            { branch_id: 'branch-1', stock: 20 },
            { branch_id: 'branch-2', stock: 30 },
            { branch_id: 'branch-3', stock: 0 },
        ])
        assert.equal(afterBranch1.aggregateStock, 50, 'products.stock otomatis menjadi 20 + 30 + 0 = 50')

        // Verifikasi konsistensi penuh dengan perhitungan Neraca (HPP Rp10.000/unit)
        const neracaResult = calculateMerchandiseInventoryValue({
            products: [{ id: 'prod-1', cost_price: 10000, stock: afterBranch1.aggregateStock }],
            branchStocks: afterBranch1.branchStocks.map((bs) => ({
                product_id: 'prod-1',
                branch_id: bs.branch_id,
                stock: bs.stock,
            })),
            selectedBranchId: 'all',
        })
        assert.equal(neracaResult.hasError, false)
        assert.equal(neracaResult.value, 50 * 10000, 'Nilai persediaan Neraca = 50 unit * Rp10.000 = Rp500.000')
    })

    test('3. Otorisasi Pegawai vs Owner: Pegawai hanya boleh mengubah stok cabangnya sendiri dan ditolak pada cabang lain', () => {
        const employeeBranch1 = {
            business_id: 'biz-alpha',
            branch_id: 'branch-1',
            role: 'pegawai',
        }

        // Pegawai mengubah cabangnya sendiri -> DIIZINKAN
        const ownBranchRes = authorizeBranchStockMutation(employeeBranch1, 'biz-alpha', 'branch-1')
        assert.equal(ownBranchRes.ok, true)

        // Pegawai mencoba mengubah cabang lain -> DITOLAK
        const otherBranchRes = authorizeBranchStockMutation(employeeBranch1, 'biz-alpha', 'branch-2')
        assert.equal(otherBranchRes.ok, false)
        assert.match(otherBranchRes.error, /hanya dapat mengatur stok di cabang tempat Anda ditugaskan/i)

        // Pegawai tanpa branch_id -> DITOLAK
        const unassignedEmpRes = authorizeBranchStockMutation(
            { business_id: 'biz-alpha', branch_id: null, role: 'pegawai' },
            'biz-alpha',
            'branch-1'
        )
        assert.equal(unassignedEmpRes.ok, false)

        // Owner mengubah cabang mana pun dalam bisnisnya -> DIIZINKAN
        const ownerBranch1 = authorizeBranchStockMutation(
            { business_id: 'biz-alpha', branch_id: null, role: 'owner' },
            'biz-alpha',
            'branch-1'
        )
        const ownerBranch3 = authorizeBranchStockMutation(
            { business_id: 'biz-alpha', branch_id: null, role: 'owner' },
            'biz-alpha',
            'branch-3'
        )
        assert.equal(ownerBranch1.ok, true)
        assert.equal(ownerBranch3.ok, true)

        // Lintas bisnis -> DITOLAK bahkan untuk owner
        const crossTenantRes = authorizeBranchStockMutation(
            { business_id: 'biz-alpha', branch_id: null, role: 'owner' },
            'biz-beta',
            'branch-1'
        )
        assert.equal(crossTenantRes.ok, false)
    })

    test('4. Sinkronisasi Penjualan, Oversell & Void antar cabang menjaga products.stock = SUM(product_branch_stocks.stock)', () => {
        let branchStocks = [
            { branch_id: 'branch-1', stock: 2 },
            { branch_id: 'branch-2', stock: 10 },
        ]
        let productAggregateStock = computeAggregateProductStock(branchStocks)
        assert.equal(productAggregateStock, 12)

        // Oversell 5 unit di Cabang 1 (stok fisik di Cabang 1 hanya 2)
        const ded = computeExactStockDeduction(branchStocks[0].stock, 5)
        branchStocks = applyDirectBranchStockUpdate(branchStocks, 'branch-1', ded.newStock).branchStocks
        productAggregateStock = computeAggregateProductStock(branchStocks)

        assert.equal(ded.deducted, 2)
        assert.equal(branchStocks[0].stock, 0, 'Cabang 1 menjadi 0')
        assert.equal(branchStocks[1].stock, 10, 'Stok Cabang 2 tidak boleh ikut terpotong')
        assert.equal(productAggregateStock, 10, 'products.stock sinkron dengan 0 + 10 = 10')

        // Void transaksi tersebut -> Cabang 1 pulih 2, agregat kembali ke 12
        const restored = computeExactStockRestoration(ded.deducted, 5, 'completed')
        branchStocks = applyDirectBranchStockUpdate(
            branchStocks,
            'branch-1',
            branchStocks[0].stock + restored
        ).branchStocks
        productAggregateStock = computeAggregateProductStock(branchStocks)

        assert.equal(branchStocks[0].stock, 2)
        assert.equal(branchStocks[1].stock, 10)
        assert.equal(productAggregateStock, 12)
    })

    test('5. Verifikasi kontrak SQL migrasi 0033 dan Server Action produk/actions.ts', () => {
        const sqlPath = path.resolve('supabase/migrations/0033_direct_branch_stock_and_employee_rls.sql')
        const actionsPath = path.resolve('app/dashboard/produk/actions.ts')

        const sql = fs.readFileSync(sqlPath, 'utf8')
        const actionsCode = fs.readFileSync(actionsPath, 'utf8')

        // Trigger sinkronisasi agregat otomatis pada product_branch_stocks
        assert.match(sql, /create\s+trigger\s+trg_sync_product_aggregate_stock/i)
        assert.match(sql, /sum\(greatest\(pbs\.stock,\s*0\)\)/i)

        // Inisialisasi produk baru hanya mengisi 1 cabang utama (row_number() = 1)
        assert.match(sql, /row_number\(\)\s+over/i)

        // RPC atomik & policy RLS pegawai khusus cabangnya sendiri
        assert.match(sql, /create\s+or\s+replace\s+function\s+set_product_branch_stock_atomic/i)
        assert.match(sql, /create\s+policy\s+"employee insert own branch stocks"/i)
        assert.match(sql, /create\s+policy\s+"employee update own branch stocks"/i)
        assert.match(sql, /branch_id\s*=\s*auth_branch_id\(\)/i)

        // Server Action tidak lagi memiliki logika gudang induk terpisah
        assert.doesNotMatch(actionsCode, /Stok global \(induk\) tidak mencukupi/i)
        assert.match(actionsCode, /set_product_branch_stock_atomic/)
        assert.match(actionsCode, /authorizeBranchStockMutation/)
    })
})

