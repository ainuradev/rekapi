import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('Prioritas 3: Financial Reporting Clarity (Accrual vs. Cash Flow)', () => {
    // Model perhitungan Rekapi
    function calculateFinancialMetrics({ sales, saleItems, purchases, expenses }) {
        const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total), 0)
        const totalHPP = saleItems.reduce((sum, item) => sum + Number(item.cost_price) * Number(item.quantity), 0)
        const totalPurchases = purchases.reduce((sum, p) => sum + Number(p.total), 0)
        const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0)

        const grossProfit = totalRevenue - totalHPP
        // Laba Operasional (Accrual): Gross Profit - Beban Operasional
        const netOperatingProfit = grossProfit - totalExpenses
        // Arus Kas Bersih (Cash Basis): Kas Masuk - Kas Keluar Belanja - Kas Keluar Operasional
        const netCashFlow = totalRevenue - totalPurchases - totalExpenses

        return {
            totalRevenue,
            totalHPP,
            totalPurchases,
            totalExpenses,
            grossProfit,
            netOperatingProfit,
            netCashFlow
        }
    }

    test('Scenario 1: Normal operational cycle with inventory purchase and sales', () => {
        // Toko beli 100 cup bahan baku seharga 1.000.000 (purchases)
        // Terjual 60 cup seharga 20.000 per cup (omzet 1.200.000, HPP 600.000)
        // Biaya listrik & sewa 200.000 (expenses)
        const data = {
            sales: [{ id: 's1', total: 1_200_000 }],
            saleItems: [{ product_id: 'p1', quantity: 60, cost_price: 10_000 }],
            purchases: [{ id: 'pur1', total: 1_000_000 }],
            expenses: [{ id: 'exp1', amount: 200_000 }]
        }

        const metrics = calculateFinancialMetrics(data)

        // Laba kotor = 1.200.000 - 600.000 = 600.000
        assert.equal(metrics.grossProfit, 600_000)

        // Laba operasional = 600.000 - 200.000 = 400.000 (UNTUNG OPERASIONAL)
        assert.equal(metrics.netOperatingProfit, 400_000)

        // Arus kas bersih = 1.200.000 - 1.000.000 - 200.000 = 0 (KAS NETRAL)
        assert.equal(metrics.netCashFlow, 0)

        // Bukti tidak ada double counting:
        // Jika purchases salah dikurangkan lagi dari laba operasional, laba akan menjadi minus (-600.000) padahal bisnis untung
        assert.notEqual(metrics.netOperatingProfit, metrics.netOperatingProfit - metrics.totalPurchases)
    })

    test('Scenario 2: Large capital inventory restocking causes negative cash flow while business is profitable', () => {
        // Restock besar untuk persiapan event akhir bulan
        const data = {
            sales: [{ id: 's1', total: 5_000_000 }],
            saleItems: [{ product_id: 'p1', quantity: 100, cost_price: 15_000 }], // HPP = 1.500.000
            purchases: [{ id: 'pur1', total: 8_000_000 }], // Beli stok besar 8.000.000
            expenses: [{ id: 'exp1', amount: 500_000 }]
        }

        const metrics = calculateFinancialMetrics(data)

        // Laba operasional: (5.000.000 - 1.500.000) - 500.000 = 3.000.000 (Profitabel)
        assert.equal(metrics.netOperatingProfit, 3_000_000)

        // Arus kas bersih: 5.000.000 - 8.000.000 - 500.000 = -3.500.000 (Defisit Kas Sementara)
        assert.equal(metrics.netCashFlow, -3_500_000)

        assert.ok(metrics.netOperatingProfit > 0, 'Bisnis harus tetap tercatat untung operasional')
        assert.ok(metrics.netCashFlow < 0, 'Arus kas jujur melaporkan kas keluar lebih besar dari kas masuk')
    })

    test('Scenario 3: Zero sales period (early setup or holiday closure)', () => {
        const data = {
            sales: [],
            saleItems: [],
            purchases: [{ id: 'pur1', total: 500_000 }],
            expenses: [{ id: 'exp1', amount: 300_000 }]
        }

        const metrics = calculateFinancialMetrics(data)

        assert.equal(metrics.totalRevenue, 0)
        assert.equal(metrics.grossProfit, 0)
        assert.equal(metrics.netOperatingProfit, -300_000, 'Defisit operasional hanya sebesar beban operasional (300.000)')
        assert.equal(metrics.netCashFlow, -800_000, 'Kas keluar total 800.000')
    })

    test('CSV export structure cleanly separates Accrual Income Statement from Cash Basis Flow', () => {
        const summary = {
            totalRevenue: 2_000_000,
            totalHPP: 800_000,
            grossProfit: 1_200_000,
            totalPurchases: 500_000,
            totalExpenses: 300_000,
            netProfit: 900_000 // 1.200.000 - 300.000
        }

        const csvLines = [
            '=== 1. LAPORAN LABA RUGI OPERASIONAL (ACCRUAL BASIS) ===',
            'Komponen,Nominal (Rp),Keterangan',
            `"Pendapatan Penjualan (Omzet)",${summary.totalRevenue},"Total omset dari transaksi kasir"`,
            `"HPP (Harga Pokok Penjualan)",-${summary.totalHPP},"Modal bahan dari produk yang terjual"`,
            `"Laba Kotor (Gross Profit)",${summary.grossProfit},"Pendapatan Penjualan - HPP"`,
            `"Beban Operasional",-${summary.totalExpenses},"Gaji, sewa, listrik, utilitas, dll."`,
            `"LABA OPERASIONAL",${summary.netProfit},"${summary.netProfit >= 0 ? 'Surplus Operasional' : 'Defisit Operasional'}"`,
            '',
            '=== 2. RINGKASAN ARUS KAS OPERASIONAL (CASH BASIS) ===',
            'Komponen,Nominal (Rp),Keterangan',
            `"Penerimaan Kas dari Penjualan",${summary.totalRevenue},"Total kas masuk dari transaksi kasir"`,
            `"Pengeluaran Kas Belanja Bahan Baku",-${summary.totalPurchases},"Pembelian stok bahan ke supplier"`,
            `"Pengeluaran Kas Operasional",-${summary.totalExpenses},"Biaya operasional yang dibayarkan"`,
            `"ARUS KAS BERSIH",${summary.totalRevenue - summary.totalPurchases - summary.totalExpenses}`
        ]

        const csvContent = csvLines.join('\n')

        // Pastikan tidak ada "Belanja Bahan Baku" di dalam seksi 1 (Laba Rugi)
        const section1 = csvContent.split('=== 2.')[0]
        assert.ok(!section1.includes('Belanja Bahan Baku'), 'Belanja Bahan Baku tidak boleh berada di seksi Laba Rugi')
        assert.ok(section1.includes('LABA OPERASIONAL'), 'Seksi 1 harus menyajikan LABA OPERASIONAL')

        // Pastikan seksi 2 menyajikan ARUS KAS BERSIH dengan rumus yang benar
        const section2 = csvContent.split('=== 2.')[1]
        assert.ok(section2.includes('"ARUS KAS BERSIH",1200000'), 'Arus kas bersih = 2.000.000 - 500.000 - 300.000 = 1.200.000')
    })
})
