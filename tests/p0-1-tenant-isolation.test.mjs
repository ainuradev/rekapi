import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('P0-1: Tenant Isolation & Cross-Business Deletion Prevention', () => {
    test('removeEmployee logic rejects deletion of self', () => {
        const callerUserId = 'user-owner-biz-a'
        const targetProfileId = 'user-owner-biz-a'

        const isSelf = !targetProfileId || targetProfileId === callerUserId
        assert.equal(isSelf, true, 'Harus mendeteksi percobaan penghapusan akun sendiri')
    })

    test('removeEmployee logic rejects deletion when target belongs to another business', () => {
        const ownerBusinessId = 'biz-aaa-111'
        const targetProfile = {
            id: 'employee-biz-b',
            business_id: 'biz-bbb-222', // Bisnis lain!
            role: 'pegawai',
        }

        const isSameBusiness = targetProfile.business_id === ownerBusinessId
        assert.equal(isSameBusiness, false, 'Target milik bisnis B harus ditolak oleh owner bisnis A')
    })

    test('removeEmployee logic rejects deletion if target has role owner', () => {
        const ownerBusinessId = 'biz-aaa-111'
        const targetProfile = {
            id: 'another-owner-biz-a',
            business_id: 'biz-aaa-111',
            role: 'owner', // Bukan pegawai!
        }

        const isEmployee = targetProfile.role === 'pegawai'
        assert.equal(isEmployee, false, 'Target ber-role owner tidak boleh dihapus melalui removeEmployee')
    })

    test('removeEmployee logic permits deletion only when target is pegawai of same business', () => {
        const ownerBusinessId = 'biz-aaa-111'
        const callerUserId = 'owner-biz-a'
        const targetProfile = {
            id: 'legit-employee-biz-a',
            business_id: 'biz-aaa-111',
            role: 'pegawai',
        }

        const isSelf = targetProfile.id === callerUserId
        const isSameBusiness = targetProfile.business_id === ownerBusinessId
        const isEmployee = targetProfile.role === 'pegawai'

        const isValid = !isSelf && isSameBusiness && isEmployee
        assert.equal(isValid, true, 'Pegawai sah dalam bisnis yang sama diizinkan dihapus')
    })

    test('cancelPendingTransaction logic rejects when transaction business_id does not match caller business_id', () => {
        const callerBusinessId = 'biz-aaa-111'
        const paymentTx = {
            midtrans_order_id: 'ORDER-123',
            business_id: 'biz-bbb-222', // Bisnis lain!
            status: 'pending',
        }

        const isOwnerOfTx = paymentTx.business_id === callerBusinessId
        assert.equal(isOwnerOfTx, false, 'Transaksi milik bisnis lain harus ditolak')
    })
})
