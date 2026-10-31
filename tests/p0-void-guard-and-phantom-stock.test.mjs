import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
    validateSaleEditable,
    shouldFallbackFromUpdateSaleRpc,
    computeExactStockDeduction,
    computeExactStockRestoration,
} from '../lib/sale-stock-integrity.ts'

describe('P0: Guard Transaksi Voided & Pencegahan Phantom Stock (Actual Helper + SQL Invariants)', () => {
    test('1. Penolakan edit pada transaksi voided: Owner maupun Pegawai ditolak agar stok tidak pulih 2x', () => {
        const voidedSale = {
            id: 'sale-void-1',
            business_id: 'biz-1',
            branch_id: 'branch-a',
            status: 'voided',
        }

        const ownerCheck = validateSaleEditable(voidedSale, {
            business_id: 'biz-1',
            branch_id: null,
            role: 'owner',
        })
        assert.equal(ownerCheck.ok, false)
        assert.match(ownerCheck.error, /voided.*tidak dapat diedit/i)

        const employeeCheck = validateSaleEditable(voidedSale, {
            business_id: 'biz-1',
            branch_id: 'branch-a',
            role: 'pegawai',
        })
        assert.equal(employeeCheck.ok, false)
        assert.match(employeeCheck.error, /voided.*tidak dapat diedit/i)

        // Transaksi completed normal tetap diizinkan
        const activeCheck = validateSaleEditable(
            { ...voidedSale, status: 'completed' },
            { business_id: 'biz-1', branch_id: 'branch-a', role: 'pegawai' }
        )
        assert.equal(activeCheck.ok, true)
    })

    test('2. Anti-Bypass RPC Fallback: Error validasi/voided dari update_sale_atomic tidak boleh jatuh ke admin client', () => {
        // Error bisnis dari PostgreSQL RAISE EXCEPTION (misal transaksi sudah voided karena race condition)
        assert.equal(
            shouldFallbackFromUpdateSaleRpc({
                code: 'P0001',
                message: 'Transaksi ini telah dibatalkan (voided) dan tidak dapat diedit.',
            }),
            false
        )
        assert.equal(
            shouldFallbackFromUpdateSaleRpc({
                code: '42501',
                message: 'Akses ditolak.',
            }),
            false
        )

        // Hanya boleh fallback jika fungsi RPC memang belum terpasang di skema database
        assert.equal(
            shouldFallbackFromUpdateSaleRpc({
                code: '42883',
                message: 'function update_sale_atomic does not exist',
            }),
            true
        )
        assert.equal(
            shouldFallbackFromUpdateSaleRpc({
                code: 'PGRST202',
                message: 'Could not find the function public.update_sale_atomic in the schema cache',
            }),
            true
        )
    })

    test('3. Oversell lalu Void: Stok yang dikembalikan tidak pernah melebihi stok yang benar-benar terpotong', () => {
        let branchStock = 2
        let globalStock = 10
        const soldQty = 5 // Oversell di cabang (stok cabang cuma 2, dijual 5)

        // Saat INSERT sale_items (trigger fn_deduct_stock_on_sale)
        const branchDed = computeExactStockDeduction(branchStock, soldQty)
        const globalDed = computeExactStockDeduction(globalStock, soldQty)

        branchStock = branchDed.newStock
        globalStock = globalDed.newStock

        assert.equal(branchDed.deducted, 2, 'Cabang hanya benar-benar terpotong 2 unit')
        assert.equal(branchStock, 0, 'Stok cabang tertahan di 0')
        assert.equal(globalDed.deducted, 5, 'Global terpotong 5 unit karena tersedia 10')
        assert.equal(globalStock, 5, 'Stok global tersisa 5')

        const saleItem = {
            quantity: soldQty,
            branch_stock_deducted: branchDed.deducted,
            global_stock_deducted: globalDed.deducted,
        }
        let saleStatus = 'completed'

        // Saat VOID transaksi (void_sale_atomic)
        const branchRestore = computeExactStockRestoration(saleItem.branch_stock_deducted, saleItem.quantity, 'completed')
        const globalRestore = computeExactStockRestoration(saleItem.global_stock_deducted, saleItem.quantity, 'completed')

        branchStock += branchRestore
        globalStock += globalRestore
        saleStatus = 'voided'
        saleItem.branch_stock_deducted = 0
        saleItem.global_stock_deducted = 0

        assert.equal(branchStock, 2, 'Stok cabang kembali tepat ke 2 (BUKAN menggelembung jadi 5!)')
        assert.equal(globalStock, 10, 'Stok global kembali tepat ke 10')

        // Jika setelah void ada upaya delete item / edit ulang, pemulihan = 0
        assert.equal(
            computeExactStockRestoration(saleItem.branch_stock_deducted, saleItem.quantity, saleStatus),
            0,
            'Transaksi voided tidak pernah mengembalikan stok untuk kedua kalinya'
        )
        // Bahkan jika parent sales terhapus (status tidak terbaca), kolom deducted = 0 tetap mencegah pemulihan ganda
        assert.equal(
            computeExactStockRestoration(saleItem.branch_stock_deducted, saleItem.quantity, 'completed'),
            0,
            'Zeroed branch_stock_deducted mencegah pemulihan ganda pada skenario apa pun'
        )
    })

    test('4. Oversell lalu Edit Kuantitas (qty 5 -> 1): Stok akhir konsisten secara fisik tanpa phantom stock', () => {
        let branchStock = 2

        // 1. Kasir oversell 5 unit saat stok fisik di cabang ada 2
        const initialDed = computeExactStockDeduction(branchStock, 5)
        branchStock = initialDed.newStock
        assert.equal(branchStock, 0)
        assert.equal(initialDed.deducted, 2)

        // 2. Transaksi diedit menjadi 1 unit (koreksi salah ketik kasir dari 5 menjadi 1):
        //    a) Delete sale_items lama -> pulihkan hanya sebesar yang terpotong (2)
        const restored = computeExactStockRestoration(initialDed.deducted, 5, 'completed')
        branchStock += restored
        assert.equal(branchStock, 2, 'Stok kembali ke 2 sebelum item baru dipotong')

        //    b) Insert sale_items baru (qty = 1) -> potong 1
        const editedDed = computeExactStockDeduction(branchStock, 1)
        branchStock = editedDed.newStock

        assert.equal(editedDed.deducted, 1)
        assert.equal(branchStock, 1, 'Stok akhir cabang = 1 (awal 2 - terjual 1 = 1, bukan 4!)')
    })

    test('5. Stok 0, stok negatif legacy, dan kompatibilitas baris sale_items historis (deducted = null)', () => {
        // Stok 0 lalu oversell 4 unit -> deducted = 0, saat void kembali 0
        const zeroDed = computeExactStockDeduction(0, 4)
        assert.equal(zeroDed.deducted, 0)
        assert.equal(zeroDed.newStock, 0)
        assert.equal(computeExactStockRestoration(zeroDed.deducted, 4, 'completed'), 0)

        // Stok negatif legacy (-3) lalu terjual 2 -> deducted = 0, stok tidak naik fiktif ke 0
        const negDed = computeExactStockDeduction(-3, 2)
        assert.equal(negDed.deducted, 0)
        assert.equal(negDed.newStock, -3)

        // Data historis sebelum migrasi 0032 (branch_stock_deducted = null) tetap fallback ke quantity
        assert.equal(computeExactStockRestoration(null, 3, 'completed'), 3)
        assert.equal(computeExactStockRestoration(undefined, 3, 'completed'), 3)
    })

    test('6. Dua transaksi berurutan pada stok terbatas (stock=3, Tx A beli 2, Tx B beli 2) lalu di-void', () => {
        let branchStock = 3

        // Tx A beli 2 -> terpotong 2, sisa 1
        const txA = computeExactStockDeduction(branchStock, 2)
        branchStock = txA.newStock
        assert.equal(txA.deducted, 2)
        assert.equal(branchStock, 1)

        // Tx B beli 2 -> hanya tersisa 1, terpotong 1, sisa 0
        const txB = computeExactStockDeduction(branchStock, 2)
        branchStock = txB.newStock
        assert.equal(txB.deducted, 1)
        assert.equal(branchStock, 0)

        // Void Tx B terlebih dahulu -> hanya kembali 1 (stok jadi 1)
        branchStock += computeExactStockRestoration(txB.deducted, 2, 'completed')
        assert.equal(branchStock, 1)

        // Void Tx A -> kembali 2 (stok kembali utuh ke 3)
        branchStock += computeExactStockRestoration(txA.deducted, 2, 'completed')
        assert.equal(branchStock, 3)
    })

    test('7. Verifikasi kontrak SQL migrasi 0032 dan Server Action updateSale', () => {
        const sqlPath = path.resolve('supabase/migrations/0032_void_guard_and_exact_stock_restoration.sql')
        const actionsPath = path.resolve('app/dashboard/penjualan/riwayat/actions.ts')

        const sql = fs.readFileSync(sqlPath, 'utf8')
        const actionsCode = fs.readFileSync(actionsPath, 'utf8')

        // Kolom pelacak stok aktual di sale_items
        assert.match(sql, /branch_stock_deducted\s+numeric/i)
        assert.match(sql, /global_stock_deducted\s+numeric/i)

        // Trigger BEFORE INSERT dengan row lock FOR UPDATE
        assert.match(sql, /before\s+insert\s+on\s+sale_items/i)
        assert.match(sql, /for\s+update/i)

        // Guard status = 'voided' di update_sale_atomic & fn_restore_stock_on_delete
        assert.match(sql, /if\s+v_current_status\s*=\s*'voided'\s+then/i)
        assert.match(sql, /if\s+v_sale_status\s*=\s*'voided'\s+then/i)

        // Zeroing deducted stock pada void_sale_atomic
        assert.match(sql, /set\s+branch_stock_deducted\s*=\s*0/i)

        // Server Action menggunakan validateSaleEditable & shouldFallbackFromUpdateSaleRpc
        assert.match(actionsCode, /validateSaleEditable/)
        assert.match(actionsCode, /shouldFallbackFromUpdateSaleRpc/)
    })
})

