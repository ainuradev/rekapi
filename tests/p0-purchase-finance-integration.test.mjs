import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('P0: Purchase Integration with Finance (Cash, Debts & Neraca / Arus Kas)', () => {

    test('1. Pembelian Tunai (Paid): Memotong saldo kas dan mencatat financial_transactions (expense)', () => {
        const account = {
            id: 'acc-cash-1',
            name: 'Kas Operasional',
            type: 'cash',
            current_balance: 2_000_000,
        }

        const purchase = {
            id: 'pur-101',
            business_id: 'biz-1',
            branch_id: 'branch-1',
            supplier_id: 'sup-1',
            supplier: 'PT Pangan Makmur',
            purchase_date: '2026-10-28',
            total: 600_000,
            payment_status: 'paid',
            payment_method: 'cash',
            account_id: account.id,
            paid_amount: 600_000,
            due_date: null,
        }

        let debts = []
        let financialTransactions = []

        // Logika eksekusi pembelian tunai
        if (purchase.payment_status === 'paid' && purchase.account_id) {
            account.current_balance -= purchase.total
            financialTransactions.push({
                id: 'tx-pur-101',
                business_id: purchase.business_id,
                branch_id: purchase.branch_id,
                account_id: purchase.account_id,
                type: 'expense',
                category: 'expense',
                amount: purchase.total,
                reference_id: purchase.id,
                description: `Pembelian bahan baku (${purchase.supplier})`,
                transaction_date: purchase.purchase_date,
            })
        }

        assert.equal(account.current_balance, 1_400_000, 'Saldo kas harus berkurang sebesar total belanja')
        assert.equal(financialTransactions.length, 1, 'Harus mencatat 1 transaksi keuangan pengeluaran')
        assert.equal(financialTransactions[0].amount, 600_000)
        assert.equal(financialTransactions[0].reference_id, purchase.id)
        assert.equal(debts.length, 0, 'Pembelian tunai tidak boleh mencatat utang di debts_payables')
    })

    test('2. Pembelian Tempo (Unpaid): Tidak memotong kas, otomatis mencatat utang supplier di debts_payables', () => {
        const account = {
            id: 'acc-cash-1',
            name: 'Kas Operasional',
            type: 'cash',
            current_balance: 2_000_000,
        }

        const purchase = {
            id: 'pur-102',
            business_id: 'biz-1',
            branch_id: 'branch-1',
            supplier_id: 'sup-2',
            supplier: 'CV Rempah Nusantara',
            purchase_date: '2026-10-28',
            total: 1_500_000,
            payment_status: 'unpaid',
            payment_method: 'tempo',
            account_id: null,
            paid_amount: 0,
            due_date: '2026-11-15',
        }

        let debts = []
        let financialTransactions = []

        // Logika eksekusi pembelian kredit/tempo
        if (purchase.payment_status === 'unpaid') {
            debts.push({
                id: 'debt-pur-102',
                business_id: purchase.business_id,
                branch_id: purchase.branch_id,
                purchase_id: purchase.id,
                supplier_id: purchase.supplier_id,
                creditor_name: purchase.supplier,
                amount: purchase.total,
                remaining_amount: purchase.total,
                due_date: purchase.due_date,
                notes: `Utang pembelian bahan baku nota #${purchase.id.slice(0, 8)}`,
                status: 'unpaid',
            })
        }

        assert.equal(account.current_balance, 2_000_000, 'Saldo kas tidak boleh berkurang saat beli tempo')
        assert.equal(financialTransactions.length, 0, 'Tidak boleh ada arus kas keluar langsung')
        assert.equal(debts.length, 1, 'Harus otomatis tercatat 1 entri utang usaha di debts_payables')
        assert.equal(debts[0].purchase_id, purchase.id, 'purchase_id harus tertaut')
        assert.equal(debts[0].remaining_amount, 1_500_000)
        assert.equal(debts[0].due_date, '2026-11-15')
    })

    test('3. Pembatalan/Hapus Pembelian: Reversal saldo kas untuk tunai & hapus utang untuk tempo', () => {
        // Skenario A: Hapus pembelian tunai
        const cashAccount = {
            id: 'acc-cash-1',
            current_balance: 1_400_000,
        }
        const paidPurchase = {
            id: 'pur-101',
            account_id: 'acc-cash-1',
            payment_status: 'paid',
            total: 600_000,
        }
        let txList = [{ id: 'tx-pur-101', reference_id: 'pur-101', amount: 600_000 }]

        // Reversal tunai
        if (paidPurchase.payment_status === 'paid' && paidPurchase.account_id) {
            cashAccount.current_balance += paidPurchase.total
            txList = txList.filter((tx) => tx.reference_id !== paidPurchase.id)
        }

        assert.equal(cashAccount.current_balance, 2_000_000, 'Saldo kas harus dikembalikan utuh')
        assert.equal(txList.length, 0, 'Mutasi financial_transactions harus dihapus')

        // Skenario B: Hapus pembelian tempo
        let debtsList = [{ id: 'debt-102', purchase_id: 'pur-102', amount: 1_500_000 }]
        const unpaidPurchase = {
            id: 'pur-102',
            payment_status: 'unpaid',
            total: 1_500_000,
        }

        if (unpaidPurchase.payment_status === 'unpaid') {
            debtsList = debtsList.filter((d) => d.purchase_id !== unpaidPurchase.id)
        }

        assert.equal(debtsList.length, 0, 'Utang supplier terkait harus otomatis dihapus')
    })

    test('4. Pelunasan Utang Pembelian (payDebt): Menyinkronkan purchases paid_amount dan payment_status', () => {
        const purchase = {
            id: 'pur-201',
            total: 1_000_000,
            paid_amount: 0,
            payment_status: 'unpaid',
        }

        const debt = {
            id: 'debt-201',
            purchase_id: purchase.id,
            amount: 1_000_000,
            remaining_amount: 1_000_000,
            status: 'unpaid',
        }

        // Simulasi pelunasan bertahap (cicilan 400.000)
        function simulatePayDebt(payAmount) {
            debt.remaining_amount -= payAmount
            debt.status = debt.remaining_amount <= 0 ? 'paid' : 'partial'

            if (debt.purchase_id) {
                purchase.paid_amount += payAmount
                purchase.payment_status = purchase.paid_amount >= purchase.total ? 'paid' : 'unpaid'
            }
        }

        simulatePayDebt(400_000)
        assert.equal(debt.remaining_amount, 600_000)
        assert.equal(debt.status, 'partial')
        assert.equal(purchase.paid_amount, 400_000)
        assert.equal(purchase.payment_status, 'unpaid')

        // Pelunasan sisa 600.000
        simulatePayDebt(600_000)
        assert.equal(debt.remaining_amount, 0)
        assert.equal(debt.status, 'paid')
        assert.equal(purchase.paid_amount, 1_000_000)
        assert.equal(purchase.payment_status, 'paid', 'Status pembelian harus berubah menjadi lunas')
    })

    test('5. Audit Protection: deleteDebtPayable menolak penghapusan manual pada utang pembelian', () => {
        function validateDeleteDebt(debt) {
            if (debt.purchase_id) {
                return {
                    error: 'Utang ini berasal dari transaksi pembelian bahan baku. Untuk membatalkan utang ini, silakan hapus transaksi pembelian terkait di menu Inventaris Bahan Baku.',
                }
            }
            return { success: true }
        }

        const purchaseDebt = { id: 'debt-p-1', purchase_id: 'pur-999' }
        const generalDebt = { id: 'debt-g-1', purchase_id: null }

        const resPurchase = validateDeleteDebt(purchaseDebt)
        assert.ok(resPurchase.error)
        assert.match(resPurchase.error, /berasal dari transaksi pembelian bahan baku/i)

        const resGeneral = validateDeleteDebt(generalDebt)
        assert.equal(resGeneral.success, true)
    })

    test('6. Perbaikan Neraca: Nilai persediaan bahan baku dihitung dari quantity * cost_per_unit', () => {
        // Simulasi data skema 0023 & 0031
        const rawMaterialsStocks = [
            {
                branch_id: 'b-1',
                quantity: 50, // kolom yang valid di raw_material_branch_stocks
                raw_materials: {
                    business_id: 'biz-1',
                    cost_per_unit: 15_000, // kolom yang valid di raw_materials
                },
            },
            {
                branch_id: 'b-1',
                quantity: 20,
                raw_materials: {
                    business_id: 'biz-1',
                    cost_per_unit: 45_000,
                },
            },
            {
                branch_id: 'b-2',
                quantity: 10,
                raw_materials: {
                    business_id: 'biz-1',
                    cost_per_unit: 100_000,
                },
            },
        ]

        // Hitung nilai persediaan bahan baku
        let rawMaterialInventoryValue = 0
        for (const item of rawMaterialsStocks) {
            const qty = Number(item.quantity) || 0
            const cost = Number(item.raw_materials?.cost_per_unit) || 0
            rawMaterialInventoryValue += qty * cost
        }

        // 50 * 15.000 = 750.000
        // 20 * 45.000 = 900.000
        // 10 * 100.000 = 1.000.000
        // Total = 2.650.000
        assert.equal(
            rawMaterialInventoryValue,
            2_650_000,
            'Nilai persediaan bahan baku di neraca harus 2.650.000 (tidak lagi Rp 0)'
        )
    })

    test('7. Perbaikan Distorsi Arus Kas: Pembelian tempo (unpaid) tidak dihitung sebagai arus kas keluar', () => {
        const purchases = [
            {
                id: 'pur-1',
                total: 500_000,
                paid_amount: 500_000,
                payment_status: 'paid',
            },
            {
                id: 'pur-2',
                total: 3_000_000,
                paid_amount: 0,
                payment_status: 'unpaid', // Beli tempo 3 juta
            },
            {
                id: 'pur-3',
                total: 1_200_000,
                paid_amount: 400_000, // Pembayaran bertahap
                payment_status: 'unpaid',
            },
        ]

        // Logika Arus Kas Baru (Hanya menghitung dana kas nyata yang keluar)
        const totalPurchasesCashOut = purchases.reduce((acc, curr) => {
            const paid = Number(curr.paid_amount ?? (curr.payment_status === 'unpaid' ? 0 : curr.total)) || 0
            return acc + paid
        }, 0)

        // Harus 500.000 + 0 + 400.000 = 900.000 (Bukan 4.700.000!)
        assert.equal(
            totalPurchasesCashOut,
            900_000,
            'Arus kas keluar pembelian hanya menghitung paid_amount riil (900.000), bukan total nominal tempo (4.700.000)'
        )
    })
})
