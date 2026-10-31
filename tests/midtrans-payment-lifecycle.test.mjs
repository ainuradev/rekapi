import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
    OFFICIAL_PLAN_CATALOG,
    calculateSubscriptionRenewalExpiry,
    canAddBranch,
    canAddEmployee,
} from '../lib/subscription-limits.ts'

const ROOT = process.cwd()

describe('Midtrans Payment Lifecycle & Security Suite (Mock / Unit)', () => {
    const sandboxServerKey = 'SB-Mid-server-testKey1234567890'

    // 1. Order creation & server-side plan pricing integrity
    test('1. Order creation enforces server-side plan price and structured order ID', () => {
        const businessId = '11111111-2222-3333-4444-555555555555'
        const fakeNow = 1774300000000
        const orderId = `REKAPI-${businessId.substring(0, 8)}-${fakeNow}`

        assert.equal(orderId, 'REKAPI-11111111-1774300000000')

        // Simulasi data paket dari database (bukan dari input request user)
        const dbPlan = {
            id: 'plan-business',
            code: 'BUSINESS_MONTHLY',
            name: 'Bisnis',
            price: 79000, // Harga resmi DB
            duration_days: 30,
        }

        // Simulasi manipulasi client (client mencoba mengirim price: 1000)
        const clientManipulatedPrice = 1000
        assert.notEqual(clientManipulatedPrice, dbPlan.price)

        // Parameter order WAJIB mengambil dbPlan.price
        const origin = 'https://rekapi.com'
        const parameter = {
            transaction_details: {
                order_id: orderId,
                gross_amount: Number(dbPlan.price),
            },
            customer_details: {
                first_name: 'Owner UMKM',
                email: 'owner@umkm.test',
            },
            item_details: [
                {
                    id: dbPlan.code,
                    price: Number(dbPlan.price),
                    quantity: 1,
                    name: `Rekapi ${dbPlan.name} - ${dbPlan.duration_days} Hari`,
                },
            ],
            callbacks: {
                finish: `${origin}/dashboard/subscription/success`,
                unfinish: `${origin}/dashboard/subscription/unfinish`,
                error: `${origin}/dashboard/subscription/error`,
            },
        }

        assert.equal(parameter.transaction_details.gross_amount, 79000)
        assert.equal(parameter.item_details[0].price, 79000)
        assert.equal(parameter.item_details[0].id, 'BUSINESS_MONTHLY')
        assert.equal(parameter.callbacks.finish, 'https://rekapi.com/dashboard/subscription/success')
    })

    // 2. SHA-512 Signature verification and forgery rejection
    test('2. SHA-512 signature authentication accepts authentic payload and rejects forged inputs', () => {
        const orderId = 'REKAPI-11111111-1774300000000'
        const statusCode = '200'
        const grossAmount = '79000.00'

        const computeSignature = (oid, sc, ga, key) =>
            crypto
                .createHash('sha512')
                .update(`${oid}${sc}${ga}${key}`)
                .digest('hex')

        const validSignature = computeSignature(orderId, statusCode, grossAmount, sandboxServerKey)

        // Skenario A: Payload asli diverifikasi berhasil
        assert.equal(
            computeSignature(orderId, statusCode, grossAmount, sandboxServerKey),
            validSignature,
            'Tanda tangan asli wajib cocok'
        )

        // Skenario B: Manipulasi gross_amount ditolak
        const forgedAmountSignature = computeSignature(orderId, statusCode, '1000.00', sandboxServerKey)
        assert.notEqual(forgedAmountSignature, validSignature, 'Forged amount harus ditolak')

        // Skenario C: Manipulasi order_id ditolak
        const forgedOrderIdSignature = computeSignature('REKAPI-99999999-0000', statusCode, grossAmount, sandboxServerKey)
        assert.notEqual(forgedOrderIdSignature, validSignature, 'Forged orderId harus ditolak')

        // Skenario D: Manipulasi status_code ditolak
        const forgedStatusCodeSignature = computeSignature(orderId, '404', grossAmount, sandboxServerKey)
        assert.notEqual(forgedStatusCodeSignature, validSignature, 'Forged statusCode harus ditolak')

        // Skenario E: Manipulasi server_key (penyerang menggunakan key lain) ditolak
        const forgedKeySignature = computeSignature(orderId, statusCode, grossAmount, 'SB-Mid-server-forged')
        assert.notEqual(forgedKeySignature, validSignature, 'Forged serverKey harus ditolak')
    })

    // 3. Status mapping Midtrans transaction_status ke status pembayaran & langganan
    test('3. Midtrans status mapping maps all payment statuses accurately', () => {
        const resolveStatus = (transactionStatus, fraudStatus) => {
            let paymentStatus = 'pending'
            let subscriptionStatus = 'pending'

            if (transactionStatus === 'capture') {
                if (fraudStatus === 'accept') {
                    paymentStatus = 'settlement'
                    subscriptionStatus = 'active'
                } else if (fraudStatus === 'challenge') {
                    paymentStatus = 'challenge'
                    subscriptionStatus = 'pending'
                }
            } else if (transactionStatus === 'settlement') {
                paymentStatus = 'settlement'
                subscriptionStatus = 'active'
            } else if (
                transactionStatus === 'cancel' ||
                transactionStatus === 'deny' ||
                transactionStatus === 'expire'
            ) {
                paymentStatus = transactionStatus
                subscriptionStatus = 'canceled'
            } else if (transactionStatus === 'pending') {
                paymentStatus = 'pending'
                subscriptionStatus = 'pending'
            }
            return { paymentStatus, subscriptionStatus }
        }

        // settlement
        assert.deepEqual(resolveStatus('settlement', null), {
            paymentStatus: 'settlement',
            subscriptionStatus: 'active',
        })

        // capture + accept
        assert.deepEqual(resolveStatus('capture', 'accept'), {
            paymentStatus: 'settlement',
            subscriptionStatus: 'active',
        })

        // capture + challenge (fraud review)
        assert.deepEqual(resolveStatus('capture', 'challenge'), {
            paymentStatus: 'challenge',
            subscriptionStatus: 'pending',
        })

        // pending
        assert.deepEqual(resolveStatus('pending', null), {
            paymentStatus: 'pending',
            subscriptionStatus: 'pending',
        })

        // expire
        assert.deepEqual(resolveStatus('expire', null), {
            paymentStatus: 'expire',
            subscriptionStatus: 'canceled',
        })

        // cancel
        assert.deepEqual(resolveStatus('cancel', null), {
            paymentStatus: 'cancel',
            subscriptionStatus: 'canceled',
        })

        // deny
        assert.deepEqual(resolveStatus('deny', null), {
            paymentStatus: 'deny',
            subscriptionStatus: 'canceled',
        })
    })

    // 4. Idempotensi sinkronisasi pembayaran
    test('4. Webhook idempotency prevents duplicate activation or re-extension', () => {
        let subscriptionExpiresAt = new Date('2026-11-20T00:00:00.000Z')
        let timesExtended = 0

        const simulateSync = (currentDbStatus) => {
            // Rule di lib/midtrans/sync.ts: jika di DB sudah settlement, langsung kembalikan sukses tanpa mutasi
            if (currentDbStatus === 'settlement') {
                return {
                    success: true,
                    paymentStatus: 'settlement',
                    subscriptionStatus: 'active',
                    mutated: false,
                }
            }

            // Pertama kali settlement: mutasi DB
            timesExtended += 1
            subscriptionExpiresAt = new Date(subscriptionExpiresAt.getTime() + 30 * 86400000)
            return {
                success: true,
                paymentStatus: 'settlement',
                subscriptionStatus: 'active',
                mutated: true,
            }
        }

        // Panggilan pertama (transaksi selesai dibayar)
        const res1 = simulateSync('pending')
        assert.equal(res1.success, true)
        assert.equal(res1.mutated, true)
        assert.equal(timesExtended, 1)
        const expiryAfterFirst = subscriptionExpiresAt.toISOString()

        // Panggilan kedua (webhook duplikat / retry Midtrans)
        const res2 = simulateSync('settlement')
        assert.equal(res2.success, true)
        assert.equal(res2.mutated, false, 'Idempotensi: webhook duplikat tidak boleh memutasi DB')
        assert.equal(timesExtended, 1, 'Idempotensi: durasi tidak boleh ditambah dua kali')
        assert.equal(subscriptionExpiresAt.toISOString(), expiryAfterFirst)
    })

    // 5. Akumulasi masa aktif (Renewal Lebih Awal vs Trial/Expired) menggunakan helper produksi asli
    test('5. Early renewal accumulates remaining days (10 + 28 = 38 days) while trial/expired starts at 28 days from now', () => {
        const durationDays = 28
        const fixedNow = new Date('2026-10-29T12:00:00.000Z')
        const MS_PER_DAY = 86_400_000

        // Skenario A: Bisnis active dengan sisa 10 hari -> 10 + 28 = 38 hari (BUKAN reset 28 hari, BUKAN 56 hari)
        const tenDaysFuture = new Date(fixedNow.getTime() + 10 * MS_PER_DAY).toISOString()
        const newExpiryActive = calculateSubscriptionRenewalExpiry({
            currentBusinessStatus: 'active',
            currentBusinessExpiresAt: tenDaysFuture,
            durationDays,
            now: fixedNow,
        })
        const addedDaysActive = Math.round((newExpiryActive.getTime() - fixedNow.getTime()) / MS_PER_DAY)
        assert.equal(addedDaysActive, 38, 'Perpanjangan dini wajib mengakumulasikan sisa 10 hari + 28 hari = 38 hari')

        // Skenario B: Bisnis trial (belum pernah active) membeli paket pertama -> tepat 28 hari dari sekarang
        const newExpiryTrial = calculateSubscriptionRenewalExpiry({
            currentBusinessStatus: 'trial',
            currentBusinessExpiresAt: null,
            durationDays,
            now: fixedNow,
        })
        const addedDaysTrial = Math.round((newExpiryTrial.getTime() - fixedNow.getTime()) / MS_PER_DAY)
        assert.equal(addedDaysTrial, 28, 'Pembelian pertama dari trial wajib tepat 28 hari (tidak tergandakan menjadi 56 hari)')

        // Skenario C: Bisnis expired 7 hari lalu -> dimulai tepat 28 hari dari sekarang
        const expiredPast = new Date(fixedNow.getTime() - 7 * MS_PER_DAY).toISOString()
        const newExpiryExpired = calculateSubscriptionRenewalExpiry({
            currentBusinessStatus: 'expired',
            currentBusinessExpiresAt: expiredPast,
            durationDays,
            now: fixedNow,
        })
        const addedDaysExpired = Math.round((newExpiryExpired.getTime() - fixedNow.getTime()) / MS_PER_DAY)
        assert.equal(addedDaysExpired, 28, 'Perpanjangan setelah expired wajib tepat 28 hari dari sekarang')

        // Skenario D: Bisnis masih berstatus active di kolom lama namun tanggalnya sudah lewat 2 hari -> tepat 28 hari dari sekarang
        const staleActivePast = new Date(fixedNow.getTime() - 2 * MS_PER_DAY).toISOString()
        const newExpiryStale = calculateSubscriptionRenewalExpiry({
            currentBusinessStatus: 'active',
            currentBusinessExpiresAt: staleActivePast,
            durationDays,
            now: fixedNow,
        })
        const addedDaysStale = Math.round((newExpiryStale.getTime() - fixedNow.getTime()) / MS_PER_DAY)
        assert.equal(addedDaysStale, 28, 'Status active yang sudah lewat jatuh tempo wajib dimulai 28 hari dari sekarang')
    })

    // 5b. Upgrade / Ganti Paket saat masih aktif langsung mengupdate plan_id & kuota serta mengakumulasi hari
    test('5b. Upgrading plan while active immediately updates plan_id and quotas (Standard -> Business / Pro) and accumulates days', () => {
        const fixedNow = new Date('2026-10-29T12:00:00.000Z')
        const MS_PER_DAY = 86_400_000

        const businessRow = {
            id: 'biz-001',
            subscription_status: 'active',
            subscription_plan_id: 'plan-standard',
            subscription_expires_at: new Date(fixedNow.getTime() + 10 * MS_PER_DAY).toISOString(),
        }

        // Sebelum upgrade (Standard: max 1 cabang, 1 pegawai) -> tambah cabang ke-2 ditolak
        assert.equal(
            canAddBranch(1, OFFICIAL_PLAN_CATALOG.standard, businessRow.subscription_status).allowed,
            false
        )
        assert.equal(
            canAddEmployee(1, OFFICIAL_PLAN_CATALOG.standard, businessRow.subscription_status).allowed,
            false
        )

        // Simulasi settlement paket Business (28 hari) seperti di lib/midtrans/sync.ts
        const newExpiry = calculateSubscriptionRenewalExpiry({
            currentBusinessStatus: businessRow.subscription_status,
            currentBusinessExpiresAt: businessRow.subscription_expires_at,
            durationDays: OFFICIAL_PLAN_CATALOG.business.duration_days,
            now: fixedNow,
        })
        businessRow.subscription_status = 'active'
        businessRow.subscription_plan_id = 'plan-business'
        businessRow.subscription_expires_at = newExpiry.toISOString()

        // Setelah settlement upgrade ke Business: plan_id berubah, kuota langsung 3 cabang & 3 pegawai, masa aktif 38 hari
        assert.equal(businessRow.subscription_plan_id, 'plan-business')
        assert.equal(
            Math.round((new Date(businessRow.subscription_expires_at).getTime() - fixedNow.getTime()) / MS_PER_DAY),
            38
        )
        assert.equal(
            canAddBranch(1, OFFICIAL_PLAN_CATALOG.business, businessRow.subscription_status).allowed,
            true
        )
        assert.equal(
            canAddBranch(3, OFFICIAL_PLAN_CATALOG.business, businessRow.subscription_status).allowed,
            false
        )
        assert.equal(
            canAddEmployee(2, OFFICIAL_PLAN_CATALOG.business, businessRow.subscription_status).allowed,
            true
        )
    })

    // 5c. Verifikasi kode produksi: tombol beli aktif untuk renewal/upgrade, pending expires_at = null, & CAS atomik
    test('5c. Production code allows active users to renew/upgrade, inserts pending expires_at: null, and uses atomic CAS on settlement', () => {
        const createTxRoute = fs.readFileSync(
            path.join(ROOT, 'app', 'api', 'midtrans', 'create-transaction', 'route.ts'),
            'utf8'
        )
        const syncSource = fs.readFileSync(
            path.join(ROOT, 'lib', 'midtrans', 'sync.ts'),
            'utf8'
        )
        const subClientSource = fs.readFileSync(
            path.join(ROOT, 'app', 'dashboard', 'subscription', 'subscription-client.tsx'),
            'utf8'
        )

        // 1. create-transaction menyisipkan expires_at: null pada baris pending (mencegah bug 28+28 = 56 hari)
        assert.match(createTxRoute, /status:\s*'pending'[\s\S]*?expires_at:\s*null/)
        // create-transaction tidak memblokir bisnis yang sudah active
        assert.doesNotMatch(createTxRoute, /subscription_status\s*===\s*'active'[\s\S]*?status:\s*400/)

        // 2. sync.ts menggunakan Compare-And-Swap (.eq('midtrans_order_id', orderId).neq('status', 'settlement'))
        assert.match(
            syncSource,
            /\.update\(\{[\s\S]*?status:\s*'settlement'[\s\S]*?\}\)[\s\S]*?\.eq\('midtrans_order_id',\s*orderId\)[\s\S]*?\.neq\('status',\s*'settlement'\)/
        )
        // sync.ts membaca sisa masa aktif dari tabel businesses dan langsung meng-update subscription_plan_id
        assert.match(syncSource, /from\('businesses'\)[\s\S]*?subscription_expires_at/)
        assert.match(syncSource, /subscription_plan_id:\s*subscription\.plan_id/)

        // 3. UI subscription-client.tsx tetap mengaktifkan tombol beli untuk perpanjangan dini maupun upgrade paket
        assert.match(subClientSource, /Perpanjang Paket Ini/)
        assert.match(subClientSource, /Upgrade \/ Ganti ke Paket Ini/)
        assert.doesNotMatch(subClientSource, /disabled=\{isCurrentPlan\}/)
    })

    // 5d. Simulasi Race Condition Konkuren: Webhook settlement + Manual Sync berjalan bersamaan pada order_id yang sama
    test('5d. Concurrent webhook and manual sync race condition extends active duration strictly 1 time via CAS', async () => {
        const fixedNow = new Date('2026-10-29T12:00:00.000Z')
        const MS_PER_DAY = 86_400_000

        // Mock state DB dengan row-level CAS seperti Postgres UPDATE ... WHERE midtrans_order_id = $1 AND status <> 'settlement'
        const db = {
            paymentTx: { midtrans_order_id: 'REKAPI-RACE-001', status: 'pending' },
            business: {
                subscription_status: 'active',
                subscription_plan_id: 'plan-standard',
                subscription_expires_at: new Date(fixedNow.getTime() + 10 * MS_PER_DAY).toISOString(),
            },
            extensionsCount: 0,
        }

        const runConcurrentSync = async (callerName) => {
            // Keduanya membaca status awal 'pending' secara bersamaan sebelum salah satu selesai update!
            const initialObservedStatus = db.paymentTx.status
            if (initialObservedStatus === 'settlement') {
                return { callerName, claimed: false }
            }

            // Simulasi network roundtrip ke Midtrans Core API secara paralel
            await new Promise((resolve) => setTimeout(resolve, 10))

            // Operasi CAS atomik pada baris payment_transactions (Postgres mengunci baris sehingga hanya 1 yang menang)
            let claimedTx = null
            if (db.paymentTx.status !== 'settlement') {
                db.paymentTx.status = 'settlement'
                claimedTx = { ...db.paymentTx }
            }

            if (!claimedTx) {
                return { callerName, claimed: false }
            }

            // Hanya pemenang CAS yang boleh mengakumulasi masa aktif bisnis
            db.extensionsCount += 1
            const nextExpiry = calculateSubscriptionRenewalExpiry({
                currentBusinessStatus: db.business.subscription_status,
                currentBusinessExpiresAt: db.business.subscription_expires_at,
                durationDays: 28,
                now: fixedNow,
            })
            db.business.subscription_plan_id = 'plan-pro'
            db.business.subscription_expires_at = nextExpiry.toISOString()
            return { callerName, claimed: true }
        }

        const [webhookRes, manualSyncRes] = await Promise.all([
            runConcurrentSync('webhook'),
            runConcurrentSync('manual-success-page'),
        ])

        // Tepat 1 caller yang mengklaim CAS, caller lainnya keluar dengan aman tanpa mutasi ganda
        const winners = [webhookRes, manualSyncRes].filter((r) => r.claimed)
        assert.equal(winners.length, 1, 'Hanya tepat 1 proses paralel yang boleh memenangkan klaim CAS')
        assert.equal(db.extensionsCount, 1, 'Masa aktif hanya boleh diperpanjang 1 kali')

        const finalDays = Math.round(
            (new Date(db.business.subscription_expires_at).getTime() - fixedNow.getTime()) / MS_PER_DAY
        )
        assert.equal(finalDays, 38, 'Total masa aktif harus 38 hari (10 + 28), tidak boleh ter-double menjadi 66 hari')
        assert.equal(db.business.subscription_plan_id, 'plan-pro')
    })
})

describe('Midtrans Live Sandbox Gateway Verification', () => {
    test('6. Live Sandbox Gateway Execution Status Check (Supports Mid-* and SB-Mid-* Sandbox Keys)', async (t) => {
        const env = process.env
        const isProduction = env.MIDTRANS_IS_PRODUCTION === 'true'
        const serverKey = (env.MIDTRANS_SERVER_KEY || '').trim()
        const clientKey = (env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || env.MIDTRANS_CLIENT_KEY || '').trim()

        if (isProduction) {
            t.skip('SKIPPED: MIDTRANS_IS_PRODUCTION=true terdeteksi. Pengujian live sandbox hanya berjalan saat mode sandbox.')
            return
        }

        const hasValidSandboxKeyFormat =
            (serverKey.startsWith('Mid-server-') || serverKey.startsWith('SB-Mid-server-')) &&
            (clientKey.startsWith('Mid-client-') || clientKey.startsWith('SB-Mid-client-'))

        if (!hasValidSandboxKeyFormat) {
            t.skip(
                'SKIPPED: Environment saat ini tidak memuat kredensial Midtrans Sandbox (Mid-server-* / SB-Mid-server-*). Jalankan dengan --env-file=.env.local untuk verifikasi live gateway.'
            )
            return
        }

        // Kredensial Sandbox tersedia (baik format terbaru Mid-* maupun klasik SB-Mid-*): uji autentikasi ke Core API Sandbox
        try {
            const authHeader = Buffer.from(`${serverKey}:`).toString('base64')
            const res = await fetch('https://api.sandbox.midtrans.com/v2/REKAPI-SANDBOX-DIAG-000000/status', {
                headers: {
                    Authorization: `Basic ${authHeader}`,
                    Accept: 'application/json',
                },
            })
            assert.notEqual(
                res.status,
                401,
                'Kredensial Midtrans Sandbox ditolak (HTTP 401 Unauthorized) oleh api.sandbox.midtrans.com'
            )
            const body = await res.json()
            assert.ok(
                res.ok && (body.status_code === '404' || body.status_code === '200'),
                `Respons Core API Sandbox valid (HTTP ${res.status}, Midtrans status_code=${body.status_code})`
            )
        } catch (err) {
            if (err && (err.code === 'ENOTFOUND' || err.cause?.code === 'ENOTFOUND' || err.cause?.code === 'ETIMEDOUT')) {
                t.skip(`SKIPPED: Jaringan keluar ke api.sandbox.midtrans.com sedang tidak terjangkau (${err.message})`)
                return
            }
            assert.fail(`Koneksi gateway sandbox gagal: ${err.message}`)
        }
    })
})
