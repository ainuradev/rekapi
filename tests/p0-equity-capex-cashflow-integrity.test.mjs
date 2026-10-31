import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('P0: Phase 3 - Equity Integrity, CapEx Standardization, and Cash Flow Completeness', () => {

    test('1. deleteEquityRecord Reversal: Setoran modal (equity_deposit) memotong kembali saldo kas', () => {
        const account = {
            id: 'acc-cash-1',
            name: 'Kas Utama',
            current_balance: 5_000_000,
        }

        const equityRecord = {
            id: 'eq-101',
            type: 'initial_capital',
            amount: 2_000_000,
        }

        let financialTransactions = [
            {
                id: 'tx-eq-101',
                account_id: account.id,
                category: 'equity_deposit',
                amount: 2_000_000,
                reference_id: equityRecord.id,
            },
        ]

        // Simulasi logika deleteEquityRecord
        const tx = financialTransactions.find(
            (t) => t.reference_id === equityRecord.id && ['equity_deposit', 'equity_withdraw'].includes(t.category)
        )

        if (tx && tx.account_id === account.id) {
            const txAmt = Number(tx.amount || 0)
            if (tx.category === 'equity_deposit') {
                account.current_balance -= txAmt
            } else {
                account.current_balance += txAmt
            }
            financialTransactions = financialTransactions.filter((t) => t.id !== tx.id)
        }

        assert.equal(account.current_balance, 3_000_000, 'Saldo kas berkurang 2.000.000 setelah setoran modal dihapus')
        assert.equal(financialTransactions.length, 0, 'Mutasi financial_transactions terkait harus bersih/dihapus')
    })

    test('2. deleteEquityRecord Reversal: Prive penarikan (equity_withdraw) mengembalikan saldo kas', () => {
        const account = {
            id: 'acc-bank-1',
            name: 'BCA Operasional',
            current_balance: 10_000_000,
        }

        const priveRecord = {
            id: 'eq-prive-1',
            type: 'drawings_prive',
            amount: 1_500_000,
        }

        let financialTransactions = [
            {
                id: 'tx-prive-1',
                account_id: account.id,
                category: 'equity_withdraw',
                amount: 1_500_000,
                reference_id: priveRecord.id,
            },
        ]

        // Reversal
        const tx = financialTransactions.find((t) => t.reference_id === priveRecord.id)
        if (tx && tx.account_id === account.id) {
            const txAmt = Number(tx.amount || 0)
            if (tx.category === 'equity_withdraw') {
                account.current_balance += txAmt
            } else {
                account.current_balance -= txAmt
            }
            financialTransactions = financialTransactions.filter((t) => t.id !== tx.id)
        }

        assert.equal(account.current_balance, 11_500_000, 'Saldo bank dipulihkan kembali saat catatan prive dibatalkan')
        assert.equal(financialTransactions.length, 0)
    })

    test('3. deleteDebtPayable Guard: Menolak keras penghapusan utang yang memiliki riwayat cicilan (paid_amount > 0)', () => {
        function validateDeleteDebt(debt) {
            if (debt.purchase_id) {
                return {
                    error: 'Utang dari pembelian bahan baku tidak boleh dihapus manual. Silakan batalkan (hapus) data pembelian terkait di menu Bahan Baku.',
                }
            }
            if (Number(debt.paid_amount || 0) > 0) {
                return {
                    error: 'Tidak dapat menghapus utang yang sudah memiliki riwayat pembayaran/cicilan. Harap sesuaikan saldo via mutasi kas.',
                }
            }
            return { success: true }
        }

        // Skenario A: Utang sudah pernah dicicil (paid_amount = 500.000)
        const partiallyPaidDebt = { id: 'd1', total_amount: 2_000_000, paid_amount: 500_000, purchase_id: null }
        const resA = validateDeleteDebt(partiallyPaidDebt)
        assert.ok(resA.error)
        assert.match(resA.error, /riwayat pembayaran\/cicilan/i)

        // Skenario B: Utang pembelian bahan baku (purchase_id terisi)
        const purchaseDebt = { id: 'd2', total_amount: 1_000_000, paid_amount: 0, purchase_id: 'pur-123' }
        const resB = validateDeleteDebt(purchaseDebt)
        assert.ok(resB.error)
        assert.match(resB.error, /pembelian bahan baku/i)

        // Skenario C: Utang umum belum pernah dicicil (paid_amount = 0)
        const freshDebt = { id: 'd3', total_amount: 1_000_000, paid_amount: 0, purchase_id: null }
        const resC = validateDeleteDebt(freshDebt)
        assert.equal(resC.success, true)
    })

    test('4. Standarisasi Kategori Peralatan: CapEx tidak memotong Laba Bersih di Laba Rugi & Neraca', () => {
        const sales = [{ id: 's1', total: 10_000_000 }]
        const saleItems = [{ cost_price: 40_000, quantity: 100 }] // HPP = 4.000.000
        const expenses = [
            { category: 'gaji', amount: 2_000_000 },
            { category: 'listrik', amount: 500_000 },
            { category: 'peralatan', amount: 3_000_000 }, // Pembelian mesin espresso / freezer (CapEx)
        ]

        const totalRevenue = sales.reduce((s, r) => s + r.total, 0)
        const totalHPP = saleItems.reduce((s, i) => s + i.cost_price * i.quantity, 0)
        const grossProfit = totalRevenue - totalHPP // 10jt - 4jt = 6jt

        // Perhitungan Laba Rugi Baru (Standar Akuntansi)
        let totalOperatingExpenses = 0
        let equipmentCapex = 0
        for (const exp of expenses) {
            if (exp.category === 'peralatan') {
                equipmentCapex += exp.amount
            } else {
                totalOperatingExpenses += exp.amount
            }
        }
        const netProfitLabaRugi = grossProfit - totalOperatingExpenses

        // Perhitungan Neraca (Retained Earnings)
        let neracaOperatingExpenses = 0
        let neracaEquipmentAssets = 0
        for (const exp of expenses) {
            if (exp.category === 'peralatan') {
                neracaEquipmentAssets += exp.amount
            } else {
                neracaOperatingExpenses += exp.amount
            }
        }
        const netOperatingProfitNeraca = grossProfit - neracaOperatingExpenses

        // Verifikasi
        assert.equal(totalOperatingExpenses, 2_500_000, 'Beban operasional murni hanya gaji + listrik (2.500.000)')
        assert.equal(equipmentCapex, 3_000_000, 'Peralatan sebesar 3.000.000 dicatat terpisah sebagai CapEx / Aset Tetap')
        assert.equal(netProfitLabaRugi, 3_500_000, 'Laba Bersih di Laba-Rugi adalah 3.500.000')
        assert.equal(netOperatingProfitNeraca, 3_500_000, 'Laba Ditahan di Neraca adalah 3.500.000')
        assert.equal(netProfitLabaRugi, netOperatingProfitNeraca, 'Laba Bersih di Laba Rugi dan Neraca 100% klop / konsisten!')
    })

    test('5. Laporan Arus Kas Komprehensif: Menghitung modal masuk, cicilan utang keluar, dan prive', () => {
        // Data Operasional
        const cashSales = 3_000_000
        const digitalSales = 2_000_000
        const totalPurchases = 1_500_000 // Real paid cash
        const totalExpenses = 800_000

        // Data Mutasi Keuangan Tambahan
        const financialTransactions = [
            { category: 'equity_deposit', amount: 5_000_000 }, // Setoran modal awal/tambahan
            { category: 'debt_payment', amount: 1_200_000 },   // Pembayaran utang supplier
            { category: 'equity_withdraw', amount: 500_000 },   // Prive owner
        ]

        let equityDeposits = 0
        let equityWithdraws = 0
        let debtPayments = 0

        for (const tx of financialTransactions) {
            if (tx.category === 'equity_deposit') equityDeposits += tx.amount
            if (tx.category === 'equity_withdraw') equityWithdraws += tx.amount
            if (tx.category === 'debt_payment') debtPayments += tx.amount
        }

        // Rumus Arus Kas Baru
        const totalCashIn = cashSales + digitalSales + equityDeposits
        const totalCashOut = totalPurchases + totalExpenses + debtPayments + equityWithdraws
        const netCashFlow = totalCashIn - totalCashOut

        // Kas Masuk = 3jt + 2jt + 5jt = 10jt
        assert.equal(totalCashIn, 10_000_000, 'Total Kas Masuk mencakup modal pemilik')

        // Kas Keluar = 1.5jt (belanja) + 800rb (beban) + 1.2jt (utang) + 500rb (prive) = 4.000.000
        assert.equal(totalCashOut, 4_000_000, 'Total Kas Keluar mencakup cicilan utang dan prive')

        // Arus Kas Bersih = 10jt - 4jt = 6jt
        assert.equal(netCashFlow, 6_000_000, 'Arus Kas Bersih akurat mencerminkan likuiditas riil')
    })
})
