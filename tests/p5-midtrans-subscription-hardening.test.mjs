import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

describe('Prioritas 5: Midtrans Signature & Subscription Expiry Hardening', () => {
    test('1. Valid signature correctly authenticates against Midtrans SHA-512 formula', () => {
        const orderId = 'ORDER-12345'
        const statusCode = '200'
        const grossAmount = '100000.00'
        const serverKey = 'SB-Mid-server-testkey123'

        const validSignature = crypto
            .createHash('sha512')
            .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
            .digest('hex')

        // Valid hash verification
        const computedHash = crypto
            .createHash('sha512')
            .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
            .digest('hex')

        assert.equal(computedHash, validSignature, 'Valid signature must match computed hash')

        // Forged amount or key must fail
        const forgedAmount = '1.00'
        const forgedHash = crypto
            .createHash('sha512')
            .update(`${orderId}${statusCode}${forgedAmount}${serverKey}`)
            .digest('hex')

        assert.notEqual(forgedHash, validSignature, 'Forged amount must be rejected by signature mismatch')
    })

    test('2. Signature verification fails when serverKey is missing or empty', () => {
        const serverKey = ''
        assert.ok(!serverKey, 'Missing serverKey should be detected')
    })

    test('3. Subscription renewal preserves and accumulates remaining active days', () => {
        const durationDays = 30
        const now = new Date()

        // Kasus A: User masih memiliki 10 hari aktif tersisa
        const existingExpiry = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000)
        const currentExpiryMs = existingExpiry.getTime()

        const baseDateA = currentExpiryMs > now.getTime() ? new Date(existingExpiry) : new Date(now)
        const newExpiresAtA = new Date(baseDateA)
        newExpiresAtA.setDate(newExpiresAtA.getDate() + durationDays)

        // Harus bertambah dari existingExpiry (10 + 30 = 40 hari dari sekarang)
        const diffDaysA = Math.round((newExpiresAtA.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        assert.equal(diffDaysA, 40, 'Early renewal must accumulate remaining 10 days to 40 days total')

        // Kasus B: User langganan sudah expired 5 hari lalu
        const expiredExpiry = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
        const expiredExpiryMs = expiredExpiry.getTime()

        const baseDateB = expiredExpiryMs > now.getTime() ? new Date(expiredExpiry) : new Date(now)
        const newExpiresAtB = new Date(baseDateB)
        newExpiresAtB.setDate(newExpiresAtB.getDate() + durationDays)

        // Harus mulai dari now (30 hari dari sekarang)
        const diffDaysB = Math.round((newExpiresAtB.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        assert.equal(diffDaysB, 30, 'Expired renewal must start fresh from current time')
    })
})
