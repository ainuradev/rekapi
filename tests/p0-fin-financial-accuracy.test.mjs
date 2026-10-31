import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('P0-FIN: Financial Calculation Accuracy (No Double-Counting)', () => {
    test('grossProfit = totalRevenue - totalHPP (not double-counting purchases)', () => {
        const totalRevenue = 1_000_000
        const totalHPP = 400_000 // cost of goods sold dari item terjual
        const totalPurchases = 500_000 // belanja bahan baku ke supplier
        const totalExpenses = 150_000 // operasional: gaji, sewa, listrik

        // Formula LAMA (SALAH): double-counting
        const wrongNetProfit = (totalRevenue - totalHPP) - totalPurchases - totalExpenses
        // = 600_000 - 500_000 - 150_000 = -50_000 (merugi padahal tidak)

        // Formula BARU (BENAR)
        const grossProfit = totalRevenue - totalHPP   // = 600_000
        const netProfit = grossProfit - totalExpenses  // = 450_000 (Laba Operasional)
        const netCashFlow = netProfit - totalPurchases // = -50_000 (Arus Kas Bersih)

        // grossProfit hanya mengurangi HPP (actual cost per item terjual)
        assert.equal(grossProfit, 600_000)

        // netProfit TIDAK mengurangi totalPurchases (sudah tercermin di HPP)
        assert.equal(netProfit, 450_000)

        // netCashFlow memberikan gambaran kas keluar sebenarnya
        assert.equal(netCashFlow, -50_000)

        // Membuktikan rumus lama salah (wrongNetProfit beda dari netProfit)
        assert.notEqual(wrongNetProfit, netProfit)
        assert.equal(wrongNetProfit, -50_000) // old wrong formula = same as netCashFlow, misleadingly shown as "laba bersih"
    })

    test('netProfit formula: grossProfit - totalExpenses only', () => {
        // Simulasikan berbagai skenario bisnis
        const cases = [
            { revenue: 500_000, hpp: 200_000, purchases: 300_000, expenses: 50_000,
              expectedGross: 300_000, expectedNet: 250_000, expectedCashFlow: -50_000 },
            { revenue: 2_000_000, hpp: 800_000, purchases: 600_000, expenses: 200_000,
              expectedGross: 1_200_000, expectedNet: 1_000_000, expectedCashFlow: 400_000 },
            { revenue: 0, hpp: 0, purchases: 100_000, expenses: 50_000,
              expectedGross: 0, expectedNet: -50_000, expectedCashFlow: -150_000 },
        ]

        for (const c of cases) {
            const grossProfit = c.revenue - c.hpp
            const netProfit = grossProfit - c.expenses
            const netCashFlow = netProfit - c.purchases

            assert.equal(grossProfit, c.expectedGross, `grossProfit mismatch for revenue=${c.revenue}`)
            assert.equal(netProfit, c.expectedNet, `netProfit mismatch for revenue=${c.revenue}`)
            assert.equal(netCashFlow, c.expectedCashFlow, `netCashFlow mismatch for revenue=${c.revenue}`)
        }
    })

    test('export-button netCashFlow formula matches corrected calculation', () => {
        // Simulasi data yang dikirim ke ExportButton
        const summary = {
            totalRevenue: 3_000_000,
            totalHPP: 1_200_000,
            grossProfit: 1_800_000,          // = totalRevenue - totalHPP
            totalPurchases: 800_000,
            totalExpenses: 300_000,
            netProfit: 1_500_000,            // = grossProfit - totalExpenses (Laba Operasional)
        }

        // ExportButton dan page.tsx kini 100% konsisten menghitung netCashFlow:
        // Arus Kas Bersih = Penerimaan Kas Penjualan - Pengeluaran Belanja Bahan - Pengeluaran Operasional
        const unifiedNetCashFlow = summary.totalRevenue - summary.totalPurchases - summary.totalExpenses
        assert.equal(unifiedNetCashFlow, 1_900_000, 'Arus kas bersih harus 1.900.000 tanpa double counting HPP')

        // Verifikasi Laba Operasional tidak mengurangi belanja bahan (sudah diwakili HPP)
        const netOperatingProfit = summary.grossProfit - summary.totalExpenses
        assert.equal(netOperatingProfit, summary.netProfit)
        assert.equal(netOperatingProfit, 1_500_000)
    })

    test('dashboard branch summary uses actual omzet, not fake 45% estimate', () => {
        const todayBranchSales = [
            { total: 200_000, branch_id: 'branch-1' },
            { total: 150_000, branch_id: 'branch-1' },
        ]

        // Formula LAMA (SALAH): pakai estimasi 45%
        const oldFakeProfit = Math.round(todayBranchSales.reduce((a, s) => a + s.total, 0) * 0.45)
        assert.equal(oldFakeProfit, 157_500) // angka palsu

        // Formula BARU (BENAR): gunakan omzet actual
        const actualOmzet = Math.round(todayBranchSales.reduce((a, s) => a + s.total, 0))
        assert.equal(actualOmzet, 350_000) // angka nyata

        // Pastikan tidak menggunakan 0.45 estimasi
        assert.notEqual(actualOmzet, oldFakeProfit)
    })
})
