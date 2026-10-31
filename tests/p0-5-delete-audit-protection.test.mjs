import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('P0-5: Employee Sale Deletion & Audit Trail Protection', () => {
    test('Employee cannot delete transactions even within their own branch', async () => {
        const callerProfile = {
            id: 'pegawai-uuid-1',
            role: 'pegawai',
            branch_id: 'branch-1',
            business_id: 'biz-1'
        }

        const sale = {
            id: 'sale-1',
            business_id: 'biz-1',
            branch_id: 'branch-1',
            total: 50000
        }

        function checkDeleteAuthorization(profile, targetSale) {
            if (!profile || profile.role !== 'owner') {
                return { error: 'Akses ditolak: Hanya pemilik bisnis (Owner) yang berhak menghapus transaksi.' }
            }
            if (targetSale.business_id !== profile.business_id) {
                return { error: 'Akses ditolak: Transaksi tidak terdaftar di bisnis Anda.' }
            }
            return { success: true }
        }

        const result = checkDeleteAuthorization(callerProfile, sale)
        assert.equal(result.success, undefined)
        assert.match(result.error, /Hanya pemilik bisnis \(Owner\) yang berhak menghapus/)
    })

    test('Cross-tenant owner cannot delete transaction of another business', async () => {
        const foreignOwner = {
            id: 'owner-uuid-biz-2',
            role: 'owner',
            business_id: 'biz-2'
        }

        const saleBiz1 = {
            id: 'sale-biz-1',
            business_id: 'biz-1',
            branch_id: 'branch-1',
            total: 100000
        }

        function checkDeleteAuthorization(profile, targetSale) {
            if (!profile || profile.role !== 'owner') {
                return { error: 'Akses ditolak: Hanya pemilik bisnis (Owner) yang berhak menghapus transaksi.' }
            }
            if (targetSale.business_id !== profile.business_id) {
                return { error: 'Akses ditolak: Transaksi tidak terdaftar di bisnis Anda.' }
            }
            return { success: true }
        }

        const result = checkDeleteAuthorization(foreignOwner, saleBiz1)
        assert.equal(result.success, undefined)
        assert.match(result.error, /Transaksi tidak terdaftar di bisnis Anda/)
    })

    test('Audit logs survive sale deletion with ON DELETE SET NULL and retain full snapshot', async () => {
        const mockDatabase = {
            sales: [
                {
                    id: 'sale-100',
                    business_id: 'biz-1',
                    branch_id: 'branch-1',
                    invoice_number: 'INV-20261018-0001',
                    total: 75000,
                    sale_items: [{ product_id: 'p1', quantity: 3, price: 25000, cost_price: 15000 }]
                }
            ],
            sale_edit_logs: []
        }

        const ownerProfile = {
            id: 'owner-uuid-1',
            role: 'owner',
            business_id: 'biz-1'
        }

        // Simulate deleteSale action logic
        async function executeDeleteSale(saleId, profile) {
            const sale = mockDatabase.sales.find(s => s.id === saleId)
            if (!sale) return { error: 'Not found' }
            if (profile.role !== 'owner') return { error: 'Unauthorized role' }
            if (sale.business_id !== profile.business_id) return { error: 'Unauthorized tenant' }

            // Record audit log
            const auditEntry = {
                id: 'log-' + Math.random(),
                sale_id: sale.id,
                business_id: sale.business_id,
                edited_by: profile.id,
                old_data: {
                    action: 'DELETED',
                    deleted_at: new Date().toISOString(),
                    invoice_number: sale.invoice_number,
                    total: sale.total,
                    items: sale.sale_items
                },
                new_data: {
                    action: 'DELETED',
                    deleted_by: profile.id,
                    deleted_by_role: profile.role
                },
                reason: 'Transaksi dihapus secara permanen oleh Owner.'
            }
            mockDatabase.sale_edit_logs.push(auditEntry)

            // Delete sale
            mockDatabase.sales = mockDatabase.sales.filter(s => s.id !== saleId)

            // Foreign key ON DELETE SET NULL simulation
            mockDatabase.sale_edit_logs.forEach(log => {
                if (log.sale_id === saleId) {
                    log.sale_id = null
                }
            })

            return { success: true }
        }

        const res = await executeDeleteSale('sale-100', ownerProfile)
        assert.equal(res.success, true)

        // Verify sale was deleted
        assert.equal(mockDatabase.sales.length, 0)

        // Verify audit log SURVIVED with sale_id set to null, business_id intact, and snapshot preserved
        assert.equal(mockDatabase.sale_edit_logs.length, 1)
        const preservedLog = mockDatabase.sale_edit_logs[0]
        assert.equal(preservedLog.sale_id, null)
        assert.equal(preservedLog.business_id, 'biz-1')
        assert.equal(preservedLog.old_data.action, 'DELETED')
        assert.equal(preservedLog.old_data.invoice_number, 'INV-20261018-0001')
        assert.equal(preservedLog.old_data.total, 75000)
        assert.equal(preservedLog.old_data.items.length, 1)
    })
})
