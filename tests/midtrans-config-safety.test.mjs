import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
    validateMidtransConfig,
    getMidtransConfigStatus,
    MidtransConfigError,
} from '../lib/midtrans/config.ts'

describe('Midtrans Configuration & Fail-Closed Safety Suite', () => {
    const validSandboxEnv = {
        NODE_ENV: 'test',
        APP_ENV: 'test',
        MIDTRANS_IS_PRODUCTION: 'false',
        MIDTRANS_SERVER_KEY: 'SB-Mid-server-test1234567890abcdef',
        MIDTRANS_CLIENT_KEY: 'SB-Mid-client-test1234567890abcdef',
        NEXT_PUBLIC_MIDTRANS_CLIENT_KEY: 'SB-Mid-client-test1234567890abcdef',
        NEXT_PUBLIC_MIDTRANS_SNAP_URL: 'https://app.sandbox.midtrans.com/snap/snap.js',
        NEXT_PUBLIC_SUPABASE_URL: 'https://ucvgszazrjnjaglaiswq.supabase.co',
    }

    const validProdEnv = {
        NODE_ENV: 'production',
        APP_ENV: 'production',
        VERCEL_ENV: 'production',
        MIDTRANS_IS_PRODUCTION: 'true',
        MIDTRANS_SERVER_KEY: 'Mid-server-prod1234567890abcdef',
        MIDTRANS_CLIENT_KEY: 'Mid-client-prod1234567890abcdef',
        NEXT_PUBLIC_MIDTRANS_CLIENT_KEY: 'Mid-client-prod1234567890abcdef',
        NEXT_PUBLIC_MIDTRANS_SNAP_URL: 'https://app.midtrans.com/snap/snap.js',
        NEXT_PUBLIC_SUPABASE_URL: 'https://prodprojectref1234.supabase.co',
    }

    test('1. Valid Sandbox configuration passes validation with correct snap URL', () => {
        const config = validateMidtransConfig(validSandboxEnv)
        assert.equal(config.isProduction, false)
        assert.equal(config.environment, 'sandbox')
        assert.equal(config.snapUrl, 'https://app.sandbox.midtrans.com/snap/snap.js')
        assert.equal(config.serverKey, validSandboxEnv.MIDTRANS_SERVER_KEY)
    })

    test('2. Valid Production configuration passes validation in verified production environment', () => {
        const config = validateMidtransConfig(validProdEnv)
        assert.equal(config.isProduction, true)
        assert.equal(config.environment, 'production')
        assert.equal(config.snapUrl, 'https://app.midtrans.com/snap/snap.js')
        assert.equal(config.serverKey, validProdEnv.MIDTRANS_SERVER_KEY)
    })

    test('3. Fail-Closed: Production Midtrans is blocked in development environment', () => {
        const devProdEnv = {
            ...validProdEnv,
            NODE_ENV: 'development',
            APP_ENV: 'development',
        }
        assert.throws(
            () => validateMidtransConfig(devProdEnv),
            (err) => {
                assert.ok(err instanceof MidtransConfigError)
                assert.match(err.message, /Pembayaran PRODUCTION DITOLAK pada environment non-production/)
                return true
            }
        )
    })

    test('4. Fail-Closed: Production Midtrans is blocked when targeting staging Supabase DB', () => {
        const stagingProdEnv = {
            ...validProdEnv,
            NODE_ENV: 'production',
            APP_ENV: 'production',
            NEXT_PUBLIC_SUPABASE_URL: 'https://ucvgszazrjnjaglaiswq.supabase.co',
        }
        assert.throws(
            () => validateMidtransConfig(stagingProdEnv),
            (err) => {
                assert.ok(err instanceof MidtransConfigError)
                assert.match(err.message, /stagingDb=true/)
                return true
            }
        )
    })

    test('5. Fail-Closed: Production Midtrans is blocked in test environment', () => {
        const testProdEnv = {
            ...validProdEnv,
            NODE_ENV: 'test',
            APP_ENV: 'test',
        }
        assert.throws(
            () => validateMidtransConfig(testProdEnv),
            (err) => {
                assert.ok(err instanceof MidtransConfigError)
                return true
            }
        )
    })

    test('6. Inconsistent credentials: Sandbox mode rejecting invalid server key format', () => {
        const invalidEnv = {
            ...validSandboxEnv,
            MIDTRANS_SERVER_KEY: 'invalid-midtrans-key-12345',
        }
        assert.throws(
            () => validateMidtransConfig(invalidEnv),
            (err) => {
                assert.ok(err instanceof MidtransConfigError)
                assert.match(err.message, /MIDTRANS_SERVER_KEY tidak valid/)
                return true
            }
        )
    })

    test('6b. Sandbox mode accepts modern Sandbox key format without SB- prefix (Mid-server-* / Mid-client-*) without blocking', () => {
        const modernSandboxEnv = {
            ...validSandboxEnv,
            MIDTRANS_SERVER_KEY: 'Mid-server-sandbox-mock-key-00000',
            MIDTRANS_CLIENT_KEY: 'Mid-client-sandbox-mock-key-00000',
            NEXT_PUBLIC_MIDTRANS_CLIENT_KEY: 'Mid-client-sandbox-mock-key-00000',
        }
        const config = validateMidtransConfig(modernSandboxEnv)
        assert.equal(config.isProduction, false)
        assert.equal(config.environment, 'sandbox')
        assert.equal(config.snapUrl, 'https://app.sandbox.midtrans.com/snap/snap.js')
        assert.equal(config.serverKey, 'Mid-server-sandbox-mock-key-00000')
        assert.equal(config.clientKey, 'Mid-client-sandbox-mock-key-00000')

        const status = getMidtransConfigStatus(modernSandboxEnv)
        assert.equal(status.isValid, true)
        assert.equal(status.environment, 'sandbox')
        assert.equal(status.errors.length, 0)
        assert.equal(status.serverKeyPrefix, 'Mid-server-***')
        assert.equal(status.clientKeyPrefix, 'Mid-client-***')
        assert.ok(Array.isArray(status.notes) && status.notes.length === 1)
        assert.equal(JSON.stringify(status).includes('sandbox-mock-key-00000'), false)
    })

    test('7. Inconsistent credentials: Production mode rejecting Sandbox server key (SB-Mid-server-*)', () => {
        const mixedEnv = {
            ...validProdEnv,
            MIDTRANS_SERVER_KEY: 'SB-Mid-server-sandboxkey12345',
        }
        assert.throws(
            () => validateMidtransConfig(mixedEnv),
            (err) => {
                assert.ok(err instanceof MidtransConfigError)
                assert.match(err.message, /mode Production memerlukan server key berawalan 'Mid-server-'/)
                return true
            }
        )
    })

    test('8. Missing MIDTRANS_SERVER_KEY is rejected safely', () => {
        const missingKeyEnv = {
            ...validSandboxEnv,
            MIDTRANS_SERVER_KEY: '',
        }
        assert.throws(
            () => validateMidtransConfig(missingKeyEnv),
            (err) => {
                assert.ok(err instanceof MidtransConfigError)
                assert.match(err.message, /MIDTRANS_SERVER_KEY tidak ditemukan/)
                return true
            }
        )
    })

    test('9. Missing Client Key is rejected safely', () => {
        const missingClientEnv = {
            ...validSandboxEnv,
            MIDTRANS_CLIENT_KEY: '',
            NEXT_PUBLIC_MIDTRANS_CLIENT_KEY: '',
        }
        assert.throws(
            () => validateMidtransConfig(missingClientEnv),
            (err) => {
                assert.ok(err instanceof MidtransConfigError)
                assert.match(err.message, /NEXT_PUBLIC_MIDTRANS_CLIENT_KEY tidak ditemukan/)
                return true
            }
        )
    })

    test('10. Placeholder keys (<server_key>) are rejected', () => {
        const placeholderEnv = {
            ...validSandboxEnv,
            MIDTRANS_SERVER_KEY: '<your_server_key>',
        }
        assert.throws(
            () => validateMidtransConfig(placeholderEnv),
            (err) => {
                assert.ok(err instanceof MidtransConfigError)
                assert.match(err.message, /masih berupa placeholder/)
                return true
            }
        )
    })

    test('11. Snap URL mismatch: Sandbox rejecting explicit Production Snap URL', () => {
        const mismatchSnapEnv = {
            ...validSandboxEnv,
            NEXT_PUBLIC_MIDTRANS_SNAP_URL: 'https://app.midtrans.com/snap/snap.js',
        }
        assert.throws(
            () => validateMidtransConfig(mismatchSnapEnv),
            (err) => {
                assert.ok(err instanceof MidtransConfigError)
                assert.match(err.message, /NEXT_PUBLIC_MIDTRANS_SNAP_URL mengarah ke Production/)
                return true
            }
        )
    })

    test('12. getMidtransConfigStatus safely masks secrets without leaking values', () => {
        const status = getMidtransConfigStatus(validSandboxEnv)
        assert.equal(status.isValid, true)
        assert.equal(status.environment, 'sandbox')
        assert.equal(status.isProduction, false)
        assert.equal(status.serverKeyConfigured, true)
        assert.equal(status.serverKeyPrefix, 'SB-Mid-server-***')
        assert.equal(status.clientKeyConfigured, true)
        assert.equal(status.clientKeyPrefix, 'SB-Mid-client-***')
        // Pastikan tidak ada raw secret
        assert.equal(JSON.stringify(status).includes('test1234567890abcdef'), false)
    })
})
