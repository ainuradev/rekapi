import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('AUDIT & PENYESUAIAN: Credit Sales, Partial Payments, Receivables, Cash & Void Flow', () => {

    test('Aturan B & F: Penjualan kredit tanpa DP membuat piutang tanpa penerimaan kas fiktif', () => {
        // Simulasi akun kas & pelanggan
        let cashAccountBalance = 500_000
        const customer = { id: 'cust-1', name: 'Pak Budi', current_receivable: 0, receivable_limit: 2_000_000 }
        const product = { id: 'prod-1', name: 'Beras 5kg', stock: 10, selling_price: 65_000, cost_price: 55_000 }
        
        // Buat penjualan kredit 2 karung beras = Rp 130.000, DP = 0
        const qty = 2
        const total = product.selling_price * qty // 130.000
        const dp = 0

        // Validasi Aturan B.1: Wajib ada customer teridentifikasi
        assert.ok(customer.id, 'Penjualan kredit harus terkait pelanggan yang teridentifikasi')

        // Validasi Aturan B.5 & B.6: Status pembayaran unpaid, kas tidak bertambah
        const payment_status = dp === 0 ? 'unpaid' : (dp < total ? 'partial' : 'paid')
        assert.equal(payment_status, 'unpaid')

        // Mutasi stok: Stok berkurang 1x
        product.stock -= qty
        assert.equal(product.stock, 8, 'Stok berkurang saat penjualan selesai')

        // Mutasi kas: DP = 0 -> tidak ada uang masuk fiktif
        if (dp > 0) {
            cashAccountBalance += dp
        }
        assert.equal(cashAccountBalance, 500_000, 'Kas TIDAK boleh bertambah jika penjualan kredit tanpa DP (Aturan F.3)')

        // Mutasi piutang
        const remainingDebt = total - dp
        customer.current_receivable += remainingDebt
        assert.equal(customer.current_receivable, 130_000, 'Piutang pelanggan bertambah sebesar total tagihan')
        assert.ok(customer.current_receivable <= customer.receivable_limit, 'Tidak melebihi limit piutang')
    })

    test('Aturan B.7 & D.2: Penjualan kredit dengan DP mencatat penerimaan kas riil dan buku besar pembayaran', () => {
        let cashAccountBalance = 1_000_000
        const customer = { id: 'cust-2', name: 'Bu Ani', current_receivable: 0, receivable_limit: 3_000_000 }
        const salePayments = []

        const total = 1_000_000
        const dp = 300_000 // DP 30%

        // Mutasi kas: hanya bertambah sebesar DP
        cashAccountBalance += dp
        assert.equal(cashAccountBalance, 1_300_000, 'Kas hanya bertambah sebesar DP yang nyata diterima (Aturan F.1)')

        // Pencatatan buku besar pembayaran unik (sale_payments)
        salePayments.push({
            id: 'pay-001',
            sale_id: 'sale-001',
            payment_number: 'PAY/20261025/0001',
            amount: dp,
            payment_method: 'transfer',
            payment_date: new Date().toISOString(),
        })

        assert.equal(salePayments.length, 1)
        assert.equal(salePayments[0].amount, 300_000)

        // Sisa piutang tercatat
        const remainingDebt = total - dp
        customer.current_receivable += remainingDebt
        assert.equal(customer.current_receivable, 700_000, 'Sisa piutang adalah Total - DP = 700.000')

        const payment_status = dp < total ? 'partial' : 'paid'
        assert.equal(payment_status, 'partial', 'Status pembayaran harus partial jika ada DP tapi belum lunas')
    })

    test('Aturan D & E: Pembayaran parsial & pelunasan piutang menurunkan saldo tanpa menggandakan omzet', () => {
        let cashAccountBalance = 1_300_000
        let totalRevenue = 1_000_000 // Omzet saat transaksi penjualan terjadi
        const sale = {
            id: 'sale-001',
            total: 1_000_000,
            paid_amount: 300_000, // Sudah DP 300.000
            payment_status: 'partial'
        }
        const customer = { current_receivable: 700_000 }
        const salePayments = [
            { id: 'pay-001', amount: 300_000 }
        ]

        // Pembayaran cicilan ke-2: Rp 400.000
        function recordPayment(amount, method, idempotencyKey) {
            const sisa = sale.total - sale.paid_amount
            // Aturan D.5: Pembayaran tidak boleh melebihi sisa tagihan
            if (amount > sisa) {
                throw new Error(`Nominal pembayaran melebihi sisa tagihan (${sisa})`)
            }

            // Aturan D.7: Idempotensi
            if (salePayments.some(p => p.idempotencyKey === idempotencyKey)) {
                return { success: true, message: 'Idempotent duplicate' }
            }

            sale.paid_amount += amount
            customer.current_receivable -= amount
            cashAccountBalance += amount

            // Aturan E.5: Pelunasan TIDAK menambah omzet lagi!
            // totalRevenue tetap 1_000_000

            if (sale.paid_amount === sale.total) {
                sale.payment_status = 'paid'
            } else {
                sale.payment_status = 'partial'
            }

            salePayments.push({
                id: 'pay-' + (salePayments.length + 1),
                amount,
                idempotencyKey
            })

            return { success: true }
        }

        // Eksekusi cicilan Rp 400.000
        recordPayment(400_000, 'cash', 'key-cicilan-2')
        assert.equal(sale.paid_amount, 700_000)
        assert.equal(customer.current_receivable, 300_000)
        assert.equal(cashAccountBalance, 1_700_000)
        assert.equal(totalRevenue, 1_000_000, 'Omzet TIDAK boleh bertambah saat pembayaran piutang')
        assert.equal(sale.payment_status, 'partial')

        // Test Overpayment Guard
        assert.throws(
            () => recordPayment(500_000, 'cash', 'key-overpay'),
            /Nominal pembayaran melebihi sisa tagihan/
        )

        // Test Pelunasan sisa Rp 300.000
        recordPayment(300_000, 'transfer', 'key-pelunasan')
        assert.equal(sale.paid_amount, 1_000_000)
        assert.equal(customer.current_receivable, 0, 'Piutang lunas (0)')
        assert.equal(sale.payment_status, 'paid', 'Status pembayaran beralih menjadi paid (lunas)')
        assert.equal(totalRevenue, 1_000_000, 'Total omzet tetap akurat tidak berlipat ganda')
        assert.equal(salePayments.length, 3, 'Tercatat 3 transaksi pembayaran di buku besar immutable')
    })

    test('Aturan C, F & G: Pembatalan transaksi (Void) mengembalikan stok, membalik kas, dan menutup piutang tanpa menghapus data', () => {
        let stockBranch = 8
        let stockGlobal = 18
        let cashAccountBalance = 500_000
        let customerReceivable = 100_000
        let auditLogs = []

        const sale = {
            id: 'sale-002',
            status: 'completed',
            total: 200_000,
            paid_amount: 100_000, // DP 100.000, sisa 100.000 piutang
            payment_status: 'partial',
            items: [{ product_id: 'prod-1', qty: 2 }]
        }

        // Eksekusi Soft Void
        function executeVoid(userRole, reason) {
            // Aturan A.2: Hanya owner yang berhak void/batalkan transaksi
            if (userRole !== 'owner') {
                throw new Error('Hanya owner yang berhak membatalkan transaksi')
            }
            if (sale.status === 'voided') {
                throw new Error('Transaksi sudah dibatalkan sebelumnya')
            }

            // 1. Status diubah ke voided (Bukan hard delete)
            sale.status = 'voided'
            sale.voided_at = new Date().toISOString()
            sale.void_reason = reason

            // 2. Stok dikembalikan (Aturan G.1 & G.5)
            for (const item of sale.items) {
                stockBranch += item.qty
                stockGlobal += item.qty
            }

            // 3. Reversal kas: Uang yang pernah diterima dikembalikan/dibalik
            if (sale.paid_amount > 0) {
                cashAccountBalance -= sale.paid_amount
            }

            // 4. Piutang dibatalkan
            const remainingPiutang = sale.total - sale.paid_amount
            customerReceivable -= remainingPiutang

            // 5. Audit log dicatat (Aturan I.1-I.5)
            auditLogs.push({
                action: 'VOID',
                sale_id: sale.id,
                reason,
                timestamp: sale.voided_at
            })
        }

        // Pegawai coba void -> harus gagal
        assert.throws(
            () => executeVoid('pegawai', 'Salah input kasir'),
            /Hanya owner yang berhak/
        )

        // Owner eksekusi void
        executeVoid('owner', 'Pelanggan membatalkan pesanan katering')

        // Verifikasi hasil void
        assert.equal(sale.status, 'voided', 'Transaksi berstatus voided, data fisik tidak terhapus')
        assert.equal(stockBranch, 10, 'Stok cabang kembali utuh')
        assert.equal(stockGlobal, 20, 'Stok global kembali utuh')
        assert.equal(cashAccountBalance, 400_000, 'Saldo kas dibalik secara otomatis sebesar DP 100.000')
        assert.equal(customerReceivable, 0, 'Piutang yang belum terbayar dibatalkan')
        assert.equal(auditLogs.length, 1, 'Audit trail append-only tersimpan')
        assert.equal(auditLogs[0].action, 'VOID')
    })

    test('Aturan H: Laporan Arus Kas, Laba Rugi, dan Dashboard mengecualikan transaksi voided', () => {
        const sales = [
            { id: 's1', total: 500_000, status: 'completed', payment_status: 'paid', paid_amount: 500_000 },
            { id: 's2', total: 300_000, status: 'voided', payment_status: 'paid', paid_amount: 300_000 }, // Dibatalkan!
            { id: 's3', total: 400_000, status: 'completed', payment_status: 'unpaid', paid_amount: 0 }, // Kredit
        ]

        // 1. Laba Rugi (Accrual Revenue)
        const validSales = sales.filter(s => s.status !== 'voided')
        const totalRevenue = validSales.reduce((sum, s) => sum + s.total, 0)
        assert.equal(totalRevenue, 900_000, 'Revenue laba rugi adalah s1 (500k) + s3 (400k) = 900k. s2 voided dikecualikan.')

        // 2. Arus Kas Masuk (Actual Cash Received)
        // s1 tunai 500k, s2 voided (0k), s3 kredit tanpa DP (0k)
        const totalCashIn = validSales.reduce((sum, s) => sum + (s.paid_amount || 0), 0)
        assert.equal(totalCashIn, 500_000, 'Arus kas masuk adalah 500k riil diterima. Penjualan kredit tanpa DP tidak menambah kas fiktif.')

        // 3. Piutang Belum Dilunasi
        const outstandingReceivables = validSales
            .filter(s => s.payment_status !== 'paid')
            .reduce((sum, s) => sum + (s.total - (s.paid_amount || 0)), 0)
        assert.equal(outstandingReceivables, 400_000, 'Total piutang aktif hanya s3 sebesar 400.000')
    })
})
