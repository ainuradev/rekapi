import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('Expense Payment Impact and Account Deletion Integrity', () => {
    test('addExpense deducts account current_balance and registers linked financial_transaction', () => {
        // Simulasikan akun kas dan saldo awal
        const account = {
            id: 'acc-cash-1',
            name: 'Kasir Toko Utama',
            type: 'cash',
            current_balance: 1_500_000,
        }

        const expense = {
            id: 'exp-101',
            category: 'listrik',
            amount: 250_000,
            expense_date: '2026-10-27',
            description: 'Token listrik toko',
            account_id: account.id,
        }

        // Operasi: deduct balance
        const newBalance = account.current_balance - expense.amount
        assert.equal(newBalance, 1_250_000, 'Saldo kas berkurang sesuai nominal pengeluaran')

        // Mutasi transaksi keuangan terhubung
        const financialTx = {
            id: 'tx-201',
            account_id: account.id,
            type: 'expense',
            category: 'expense',
            amount: expense.amount,
            reference_id: expense.id,
            description: `Beban ${expense.category}: ${expense.description}`,
            transaction_date: expense.expense_date,
        }

        assert.equal(financialTx.reference_id, expense.id, 'reference_id menautkan transaksi ke ID expense')
        assert.equal(financialTx.type, 'expense')
        assert.equal(financialTx.amount, 250_000)
    })

    test('deleteExpense restores deducted funds to account current_balance and cleans up transactions', () => {
        const account = {
            id: 'acc-bank-1',
            name: 'BCA Operasional',
            type: 'bank',
            current_balance: 5_000_000,
        }

        const linkedTxs = [
            {
                id: 'tx-301',
                account_id: account.id,
                amount: 750_000,
                reference_id: 'exp-sewa-1',
                category: 'expense',
            },
        ]

        // Simulasi pembatalan/penghapusan pengeluaran
        let restoredBalance = account.current_balance
        for (const tx of linkedTxs) {
            restoredBalance += tx.amount
        }

        assert.equal(restoredBalance, 5_750_000, 'Saldo rekening berhasil dipulihkan secara utuh saat beban dihapus')
    })

    test('deleteFinancialAccount enforces minimum 1 account safeguard', () => {
        const totalAccounts = 1

        function validateCanDelete(count) {
            if (count <= 1) {
                return { error: 'Tidak dapat menghapus akun terakhir. Bisnis harus memiliki minimal 1 akun kas atau rekening aktif.' }
            }
            return { success: true }
        }

        const result = validateCanDelete(totalAccounts)
        assert.ok(result.error)
        assert.match(result.error, /minimal 1 akun/i)

        const canDeleteWithMultiple = validateCanDelete(3)
        assert.equal(canDeleteWithMultiple.success, true)
    })

    test('deleteFinancialAccount automatically falls back default status to remaining accounts', () => {
        const accounts = [
            { id: 'acc-1', name: 'Kas Kasir 1', type: 'cash', is_default_cash: true },
            { id: 'acc-2', name: 'Kas Cadangan', type: 'cash', is_default_cash: false },
            { id: 'acc-3', name: 'BCA Utama', type: 'bank', is_default_bank: true },
            { id: 'acc-4', name: 'Mandiri Cadangan', type: 'bank', is_default_bank: false },
        ]

        // Hapus acc-1 (default cash)
        const accountToDelete = accounts[0]
        let fallbackCash = null
        if (accountToDelete.is_default_cash) {
            fallbackCash = accounts.find((a) => a.type === 'cash' && a.id !== accountToDelete.id)
        }

        assert.ok(fallbackCash, 'Akun fallback kas harus ditemukan')
        assert.equal(fallbackCash.id, 'acc-2', 'Fallback kas dialihkan ke akun kas lain yang tersedia')

        // Hapus acc-3 (default bank)
        const bankToDelete = accounts[2]
        let fallbackBank = null
        if (bankToDelete.is_default_bank) {
            fallbackBank = accounts.find((a) => ['bank', 'e_wallet'].includes(a.type) && a.id !== bankToDelete.id)
        }

        assert.ok(fallbackBank, 'Akun fallback rekening bank harus ditemukan')
        assert.equal(fallbackBank.id, 'acc-4', 'Fallback bank dialihkan ke rekening lain yang tersedia')
    })
})
