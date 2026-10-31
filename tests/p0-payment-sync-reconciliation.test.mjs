import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

describe('P0: Unified Payment RPC, Receivables-Sales Sync & Reconciliation', () => {

    test('1. RPC Parameter Tolerance: Mendukung p_recorded_by dan p_user_id secara interchange & fallback', () => {
        function resolveRecordedBy(p_recorded_by, p_user_id, auth_uid) {
            const v_recorded_by = p_recorded_by || p_user_id || auth_uid || null
            if (!v_recorded_by) {
                throw new Error('Pengguna pencatat pembayaran wajib diisi.')
            }
            return v_recorded_by
        }

        const userId = 'a0000000-0000-0000-0000-000000000001'
        const ownerId = 'a0000000-0000-0000-0000-000000000002'

        // Skenario A: Hanya p_user_id yang dikirim (backward compatibility dari client lama)
        assert.equal(
            resolveRecordedBy(null, userId, null),
            userId,
            'p_user_id harus terpetakan ke recorded_by jika p_recorded_by null'
        )

        // Skenario B: Hanya p_recorded_by yang dikirim (standar SQL 0029)
        assert.equal(
            resolveRecordedBy(ownerId, null, null),
            ownerId,
            'p_recorded_by harus dipakai jika tersedia'
        )

        // Skenario C: Keduanya dikirim (p_recorded_by diutamakan, fallback ke p_user_id)
        assert.equal(
            resolveRecordedBy(ownerId, userId, null),
            ownerId,
            'p_recorded_by memiliki prioritas pertama jika keduanya disediakan'
        )

        // Skenario D: Keduanya null, fallback ke auth_uid
        assert.equal(
            resolveRecordedBy(null, null, userId),
            userId,
            'auth.uid() menjadi fallback terakhir jika parameter tidak dikirim'
        )

        // Skenario E: Seluruh identitas kosong
        assert.throws(
            () => resolveRecordedBy(null, null, null),
            /Pengguna pencatat pembayaran wajib diisi/
        )
    })

    test('2. Idempotency Key Tolerance: Regex validasi UUID v1-v5 vs string non-UUID fallback', () => {
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

        function parseIdempotencyKey(p_idempotency_key) {
            let v_idempotency_uuid = null
            if (p_idempotency_key && typeof p_idempotency_key === 'string' && p_idempotency_key.trim() !== '') {
                const trimmed = p_idempotency_key.trim()
                if (UUID_REGEX.test(trimmed)) {
                    v_idempotency_uuid = trimmed.toLowerCase()
                }
            }
            return v_idempotency_uuid
        }

        // Skenario A: UUID v4 valid hasil crypto.randomUUID()
        const validUuid = crypto.randomUUID()
        assert.equal(
            parseIdempotencyKey(validUuid),
            validUuid.toLowerCase(),
            'UUID v4 harus berhasil diparsing menjadi UUID murni'
        )

        // Skenario B: String teks non-UUID (format lama PAY-saleId-timestamp)
        const oldStringKey = 'PAY-sale-12345-1729000000000'
        assert.equal(
            parseIdempotencyKey(oldStringKey),
            null,
            'String teks non-UUID tidak boleh menyebabkan crash cast UUID, wajib fallback ke null'
        )

        // Skenario C: String kosong atau whitespace
        assert.equal(parseIdempotencyKey('   '), null)
        assert.equal(parseIdempotencyKey(null), null)
        assert.equal(parseIdempotencyKey(undefined), null)
    })

    test('3. Sinkronisasi Pelunasan dari Menu Keuangan ke Sales & Sale Payments (Dualisme Selesai)', () => {
        // Simulasi database state
        let accountBalance = 1_000_000
        const sale = {
            id: 'sale-kredit-101',
            invoice_number: 'INV/20261028/001',
            total: 750_000,
            paid_amount: 250_000, // DP 250k
            payment_status: 'partial',
            status: 'completed',
        }

        const receivable = {
            id: 'rec-201',
            sale_id: sale.id,
            total_amount: 750_000,
            paid_amount: 250_000,
            status: 'partial',
        }

        const salePayments = [
            {
                id: 'pay-001',
                sale_id: sale.id,
                amount: 250_000,
                payment_number: 'PAY/20261028/1001',
            }
        ]

        const financialTransactions = [
            {
                id: 'ft-001',
                amount: 250_000,
                type: 'income',
                category: 'sale',
            }
        ]

        // Eksekusi simulasi pelunasan dari menu Keuangan (payReceivable sisa 500.000)
        function payReceivableUnified({ receivable_id, payment_amount, account_id, payment_date }) {
            assert.equal(receivable.id, receivable_id)
            const remaining = receivable.total_amount - receivable.paid_amount
            assert.ok(payment_amount <= remaining, 'Nominal tidak melebihi sisa piutang')

            // Karena receivable.sale_id != null, delegasikan secara atomik:
            if (receivable.sale_id) {
                const newPaid = sale.paid_amount + payment_amount
                const newStatus = newPaid >= sale.total ? 'paid' : 'partial'

                // 1. Update sales
                sale.paid_amount = newPaid
                sale.payment_status = newStatus

                // 2. Update receivables
                receivable.paid_amount = newPaid
                receivable.status = newStatus

                // 3. Tambah buku besar sale_payments
                const newPaymentId = 'pay-002'
                salePayments.push({
                    id: newPaymentId,
                    sale_id: sale.id,
                    receivable_id: receivable.id,
                    amount: payment_amount,
                    payment_number: 'PAY/20261028/1002',
                    account_id,
                    payment_date,
                })

                // 4. Tambah kas & transaksi keuangan
                accountBalance += payment_amount
                financialTransactions.push({
                    id: 'ft-002',
                    account_id,
                    amount: payment_amount,
                    type: 'income',
                    category: 'receivable_payment',
                    reference_id: newPaymentId,
                })

                return { success: true, payment_status: newStatus }
            }
        }

        const res = payReceivableUnified({
            receivable_id: 'rec-201',
            payment_amount: 500_000,
            account_id: 'acc-bca-1',
            payment_date: '2026-10-28',
        })

        assert.equal(res.success, true)
        // Verifikasi sales ikut terupdate lunas
        assert.equal(sale.paid_amount, 750_000)
        assert.equal(sale.payment_status, 'paid', 'Status sales otomatis menjadi paid saat piutang dilunasi di Keuangan')
        
        // Verifikasi receivable sinkron
        assert.equal(receivable.paid_amount, 750_000)
        assert.equal(receivable.status, 'paid')

        // Verifikasi saldo kas bertambah
        assert.equal(accountBalance, 1_500_000, 'Saldo kas/rekening penampung bertambah sesuai nominal pelunasan')

        // Verifikasi sale_payments mencatat mutasi pelunasan
        assert.equal(salePayments.length, 2)
        assert.equal(salePayments[1].amount, 500_000)

        // Verifikasi jurnal mutasi kas mencatat penerimaan piutang
        assert.equal(financialTransactions.length, 2)
        assert.equal(financialTransactions[1].category, 'receivable_payment')
        assert.equal(financialTransactions[1].amount, 500_000)
    })

    test('4. Pencegahan Overpayment: Pembayaran melebihi sisa tagihan wajib ditolak', () => {
        const sale = {
            id: 'sale-002',
            total: 300_000,
            paid_amount: 200_000, // Sisa: 100.000
            payment_status: 'partial',
        }

        function validatePaymentAmount(sale, amount) {
            const sisa = sale.total - sale.paid_amount
            if (amount > sisa + 0.01) {
                return {
                    error: `Nominal pembayaran (Rp ${amount.toLocaleString('id-ID')}) melebihi sisa tagihan piutang (Sisa: Rp ${sisa.toLocaleString('id-ID')}).`
                }
            }
            return { success: true }
        }

        // Coba bayar 150.000 (melebihi sisa 100.000)
        const invalidPayment = validatePaymentAmount(sale, 150_000)
        assert.ok(invalidPayment.error)
        assert.match(invalidPayment.error, /melebihi sisa tagihan piutang/i)

        // Bayar tepat 100.000 (valid)
        const validPayment = validatePaymentAmount(sale, 100_000)
        assert.equal(validPayment.success, true)
    })

    test('5. Integritas Void: Pembatalan transaksi membalikkan seluruh uang kas dari sale_payments', () => {
        let accountBalance = 3_000_000
        const sale = {
            id: 'sale-void-01',
            total: 1_000_000,
            paid_amount: 500_000,
            status: 'completed',
        }

        const salePayments = [
            { id: 'p1', amount: 300_000, account_id: 'acc-1' },
            { id: 'p2', amount: 200_000, account_id: 'acc-1' },
        ]

        // Eksekusi voidSale
        function executeVoid(sale, payments) {
            if (sale.status === 'voided') {
                throw new Error('Transaksi sudah dibatalkan.')
            }

            let totalReversed = 0
            for (const p of payments) {
                totalReversed += p.amount
                accountBalance -= p.amount
            }

            sale.status = 'voided'
            return { success: true, totalReversed }
        }

        const voidResult = executeVoid(sale, salePayments)
        assert.equal(voidResult.success, true)
        assert.equal(voidResult.totalReversed, 500_000)
        assert.equal(accountBalance, 2_500_000, 'Saldo kas harus berkurang sebesar total uang yang pernah dibayarkan')
        assert.equal(sale.status, 'voided')

        // Transaksi voided tidak dapat menerima pembayaran baru
        function tryPayVoidedSale(sale) {
            if (sale.status === 'voided') {
                return { error: 'Transaksi ini telah dibatalkan (voided) dan tidak dapat menerima pembayaran.' }
            }
            return { success: true }
        }

        const payAttempt = tryPayVoidedSale(sale)
        assert.ok(payAttempt.error)
        assert.match(payAttempt.error, /tidak dapat menerima pembayaran/i)
    })

    test('6. Proteksi Audit deleteReceivable: Menolak penghapusan piutang yang bersumber dari penjualan POS', () => {
        const salesReceivable = {
            id: 'rec-pos-001',
            sale_id: 'sale-pos-001',
            title: 'Penjualan Bon/Kredit #INV-001',
        }

        const generalReceivable = {
            id: 'rec-manual-002',
            sale_id: null,
            title: 'Pinjaman Karyawan Kasbon',
        }

        function deleteReceivable(rec) {
            if (rec.sale_id) {
                return {
                    error: 'Piutang dari penjualan kasir tidak boleh dihapus manual. Silakan batalkan (void) transaksi penjualan terkait di menu Riwayat Penjualan.'
                }
            }
            return { success: true }
        }

        // Piutang penjualan kasir: DITOLAK
        const resultPos = deleteReceivable(salesReceivable)
        assert.ok(resultPos.error)
        assert.equal(
            resultPos.error,
            'Piutang dari penjualan kasir tidak boleh dihapus manual. Silakan batalkan (void) transaksi penjualan terkait di menu Riwayat Penjualan.'
        )

        // Piutang non-penjualan (manual): DIIZINKAN
        const resultManual = deleteReceivable(generalReceivable)
        assert.equal(resultManual.success, true)
    })

    test('7. Partial Unique Index: Mencegah duplikasi data piutang untuk transaksi penjualan yang sama', () => {
        const existingReceivables = [
            { id: 'rec-1', business_id: 'biz-1', sale_id: 'sale-001' },
            { id: 'rec-2', business_id: 'biz-1', sale_id: 'sale-002' },
            { id: 'rec-3', business_id: 'biz-1', sale_id: null }, // non-sale piutang boleh banyak null
            { id: 'rec-4', business_id: 'biz-1', sale_id: null },
        ]

        function checkUniqueReceivable(business_id, sale_id) {
            if (sale_id !== null) {
                const exists = existingReceivables.some(
                    r => r.business_id === business_id && r.sale_id === sale_id
                )
                if (exists) {
                    throw new Error('unique_violation: uq_receivables_business_sale')
                }
            }
            return true
        }

        // Menambahkan receivable baru untuk sale yang sudah punya piutang -> harus throw
        assert.throws(
            () => checkUniqueReceivable('biz-1', 'sale-001'),
            /uq_receivables_business_sale/
        )

        // Menambahkan piutang non-sale (sale_id = null) -> diizinkan
        assert.equal(checkUniqueReceivable('biz-1', null), true)

        // Menambahkan piutang untuk sale berbeda -> diizinkan
        assert.equal(checkUniqueReceivable('biz-1', 'sale-003'), true)
    })
})
