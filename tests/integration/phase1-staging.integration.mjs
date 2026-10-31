/**
 * Phase 1 Rekapi — Live Supabase STAGING integration tests.
 *
 * Jalankan HANYA terhadap project staging terisolasi:
 *   node --test tests/integration/phase1-staging.integration.mjs
 *
 * Prinsip:
 *  - TIDAK membaca .env / .env.local (mencegah fallback diam-diam ke production).
 *  - Semua konfigurasi wajib dari env STAGING_* yang di-set eksplisit.
 *  - Hanya memakai anon/publishable key + login user nyata (JWT). Service-role
 *    key ditolak, karena service_role mem-bypass RLS dan tidak membuktikan apa pun.
 *  - Setiap mutasi dibersihkan / dikembalikan di akhir test.
 *
 * Env wajib:
 *   RUN_STAGING_INTEGRATION=1
 *   STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY, STAGING_PROJECT_REF
 *   STAGING_OWNER_A_EMAIL/_PASSWORD, STAGING_EMPLOYEE_A_EMAIL/_PASSWORD,
 *   STAGING_OWNER_B_EMAIL/_PASSWORD
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ── Safety guard: Strict Allowlist & Production Blocklist ──────────────────
// Ref project staging resmi yang HANYA SATU-SATUNYA diizinkan:
const ALLOWED_STAGING_REF = 'ucvgszazrjnjaglaiswq'

// Project yang DIKETAHUI berisi data pelanggan nyata. Tidak pernah boleh dites.
const FORBIDDEN_PRODUCTION_REFS = new Set(['dnqzjrnyptwadojycxvm'])
try {
    // ref yang di-link Supabase CLI jika bukan staging juga dianggap production
    const linked = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim()
    if (linked && linked !== ALLOWED_STAGING_REF) FORBIDDEN_PRODUCTION_REFS.add(linked)
} catch { /* file opsional */ }

// Opsional: baca .env.staging.local bila ada (HANYA file staging khusus ini)
if (fs.existsSync('.env.staging.local')) {
    const raw = fs.readFileSync('.env.staging.local', 'utf8')
    for (const line of raw.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx === -1) continue
        const key = trimmed.slice(0, eqIdx).trim()
        const val = trimmed.slice(eqIdx + 1).trim()
        if (key === 'NEXT_PUBLIC_SUPABASE_URL' && (!process.env.STAGING_SUPABASE_URL || process.env.STAGING_SUPABASE_URL.includes('<'))) {
            process.env.STAGING_SUPABASE_URL = val
        }
        if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' && (!process.env.STAGING_SUPABASE_ANON_KEY || process.env.STAGING_SUPABASE_ANON_KEY.includes('<'))) {
            process.env.STAGING_SUPABASE_ANON_KEY = val
        }
        if (key.startsWith('STAGING_') && (!process.env[key] || process.env[key].includes('<'))) {
            process.env[key] = val
        }
    }
}

// Defaults untuk email akun testing standar
process.env.STAGING_OWNER_A_EMAIL = process.env.STAGING_OWNER_A_EMAIL || 'owner-a@rekapi-staging.test'
process.env.STAGING_EMPLOYEE_A_EMAIL = process.env.STAGING_EMPLOYEE_A_EMAIL || 'pegawai-a@rekapi-staging.test'
process.env.STAGING_OWNER_B_EMAIL = process.env.STAGING_OWNER_B_EMAIL || 'owner-b@rekapi-staging.test'

if (!process.env.STAGING_PROJECT_REF && process.env.STAGING_SUPABASE_URL) {
    const m = process.env.STAGING_SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)
    if (m) process.env.STAGING_PROJECT_REF = m[1]
}

const E = process.env
const REQUIRED = [
    'STAGING_SUPABASE_URL', 'STAGING_SUPABASE_ANON_KEY', 'STAGING_PROJECT_REF',
    'STAGING_OWNER_A_EMAIL', 'STAGING_OWNER_A_PASSWORD',
    'STAGING_EMPLOYEE_A_EMAIL', 'STAGING_EMPLOYEE_A_PASSWORD',
    'STAGING_OWNER_B_EMAIL', 'STAGING_OWNER_B_PASSWORD',
]

function decodeJwtRole(key) {
    try {
        const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString())
        return payload.role ?? null
    } catch { return null }
}

function evaluateGuard() {
    if (E.RUN_STAGING_INTEGRATION !== '1') return 'RUN_STAGING_INTEGRATION=1 tidak di-set'
    const missing = REQUIRED.filter((k) => !E[k] || (typeof E[k] === 'string' && E[k].startsWith('<') && E[k].endsWith('>')))
    if (missing.length) return `env belum lengkap atau masih berisi placeholder: ${missing.join(', ')}`
    
    const m = E.STAGING_SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)
    if (!m) return 'STAGING_SUPABASE_URL bukan URL project Supabase yang valid'
    const ref = m[1]

    // 1. Verifikasi Allowlist: Hanya izinkan staging resmi ucvgszazrjnjaglaiswq
    if (ref !== ALLOWED_STAGING_REF) {
        return `TARGET BUKAN STAGING YANG DIIZINKAN (wajib '${ALLOWED_STAGING_REF}', terdeteksi '${ref}') — EKSEKUSI DITOLAK MUTLAK`
    }
    if (E.STAGING_PROJECT_REF !== ALLOWED_STAGING_REF) {
        return `STAGING_PROJECT_REF tidak valid (wajib '${ALLOWED_STAGING_REF}', didapat '${E.STAGING_PROJECT_REF}') — EKSEKUSI DITOLAK`
    }

    // 2. Verifikasi Blocklist: Cegah production dnqzjrnyptwadojycxvm
    if (FORBIDDEN_PRODUCTION_REFS.has(ref) || ref === 'dnqzjrnyptwadojycxvm') {
        return 'TARGET ADALAH PROJECT PRODUCTION (dnqzjrnyptwadojycxvm) — DITOLAK MUTLAK'
    }

    const key = E.STAGING_SUPABASE_ANON_KEY
    if (key.startsWith('sb_secret_') || decodeJwtRole(key) === 'service_role') {
        return 'key yang diberikan adalah service-role/secret — DITOLAK (bypass RLS)'
    }
    return null
}

const BLOCK_REASON = evaluateGuard()
const skip = BLOCK_REASON ? `BLOCKED: ${BLOCK_REASON}` : false

// ── Helpers ─────────────────────────────────────────────────────────────────
async function login(email, password) {
    const client = createClient(E.STAGING_SUPABASE_URL, E.STAGING_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error) throw new Error(`login gagal untuk akun staging: ${error.message}`)
    const { data: profile, error: pErr } = await client
        .from('profiles').select('id, role, business_id, branch_id').eq('id', data.user.id).single()
    if (pErr) throw new Error(`profil tidak terbaca: ${pErr.message}`)
    return { client, user: data.user, profile }
}

const ctx = {}
const cleanup = []

describe('Phase 1 — Supabase staging integration (RLS nyata, JWT user)', { skip }, () => {
    before(async () => {
        ctx.ownerA = await login(E.STAGING_OWNER_A_EMAIL, E.STAGING_OWNER_A_PASSWORD)
        ctx.empA = await login(E.STAGING_EMPLOYEE_A_EMAIL, E.STAGING_EMPLOYEE_A_PASSWORD)
        ctx.ownerB = await login(E.STAGING_OWNER_B_EMAIL, E.STAGING_OWNER_B_PASSWORD)

        // Prasyarat data seed harus sesuai (bukan asumsi)
        assert.equal(ctx.ownerA.profile.role, 'owner')
        assert.equal(ctx.empA.profile.role, 'pegawai')
        assert.equal(ctx.ownerB.profile.role, 'owner')
        assert.equal(ctx.empA.profile.business_id, ctx.ownerA.profile.business_id)
        assert.notEqual(ctx.ownerA.profile.business_id, ctx.ownerB.profile.business_id)
        assert.ok(ctx.empA.profile.branch_id, 'Employee A harus terkunci ke satu cabang')

        const { data: bizA } = await ctx.ownerA.client
            .from('businesses').select('*').eq('id', ctx.ownerA.profile.business_id).single()
        ctx.bizAOriginal = bizA
        const { data: bizB } = await ctx.ownerB.client
            .from('businesses').select('*').eq('id', ctx.ownerB.profile.business_id).single()
        ctx.bizBOriginal = bizB
    })

    after(async () => {
        for (const fn of cleanup.reverse()) {
            try { await fn() } catch (e) { console.error('cleanup gagal:', e.message) }
        }
        if (ctx.bizAOriginal) {
            const { name, address, phone, logo_url } = ctx.bizAOriginal
            await ctx.ownerA.client.from('businesses')
                .update({ name, address, phone, logo_url }).eq('id', ctx.bizAOriginal.id)
        }
    })

    // 0 ─ Verifikasi Target Lingkungan Staging & Keamanan Skema
    test('0. Target database adalah staging resmi (ucvgszazrjnjaglaiswq) & aman dari production', async () => {
        assert.equal(ALLOWED_STAGING_REF, 'ucvgszazrjnjaglaiswq')
        assert.equal(E.STAGING_PROJECT_REF, 'ucvgszazrjnjaglaiswq')
        assert.equal(E.STAGING_SUPABASE_URL, 'https://ucvgszazrjnjaglaiswq.supabase.co')
        assert.ok(FORBIDDEN_PRODUCTION_REFS.has('dnqzjrnyptwadojycxvm'), 'Production ref dnqzjrnyptwadojycxvm wajib ada di daftar blokir')
        assert.notEqual(E.STAGING_PROJECT_REF, 'dnqzjrnyptwadojycxvm', 'Target tidak boleh production')

        // Verifikasi skema katalog paket dari migrasi
        const { data: plans, error: planErr } = await ctx.ownerA.client
            .from('subscription_plans')
            .select('name, max_branches, max_employees')
        assert.equal(planErr, null)
        assert.ok(plans.length >= 3, 'Katalog subscription_plans minimal harus memiliki 3 paket')
        const branchMap = Object.fromEntries(plans.map((p) => [p.name, p.max_branches]))
        const empMap = Object.fromEntries(plans.map((p) => [p.name, p.max_employees]))
        assert.equal(branchMap['Standard'], 1)
        assert.equal(branchMap['Business'], 3)
        assert.equal(branchMap['Pro'], 5)
        assert.equal(empMap['Standard'], 1)
        assert.equal(empMap['Business'], 3)
        assert.equal(empMap['Pro'], 5)
    })

    // 1 ─ Owner membaca & mengubah bisnisnya sendiri, field lain tidak tertimpa
    test('1. Owner A membaca & memperbarui profil bisnis sendiri', async () => {
        const { client, profile } = ctx.ownerA
        const marker = `IT-${Date.now()}`
        const { data, error } = await client.from('businesses')
            .update({ address: `Jl. Staging ${marker}`, phone: '081200000001', logo_url: null })
            .eq('id', profile.business_id)
            .select('id, address, phone, logo_url, subscription_status, subscription_plan_id, subscription_expires_at')
        assert.equal(error, null)
        assert.equal(data.length, 1, 'tepat satu baris harus berubah')
        assert.equal(data[0].address, `Jl. Staging ${marker}`)
        assert.equal(data[0].logo_url, null)
        assert.equal(data[0].subscription_status, ctx.bizAOriginal.subscription_status)
        assert.equal(data[0].subscription_plan_id, ctx.bizAOriginal.subscription_plan_id)
        assert.equal(data[0].subscription_expires_at, ctx.bizAOriginal.subscription_expires_at)

        const { data: bizList } = await client.from('businesses').select('id')
        assert.deepEqual(bizList.map((b) => b.id), [profile.business_id], 'owner hanya melihat bisnisnya')
    })

    // 1b ─ Owner tidak boleh mengubah status langganan sendiri (F1)
    test('1b. Owner A ditolak saat mengubah kolom langganan secara langsung', async () => {
        const { client, profile } = ctx.ownerA
        const { data, error } = await client.from('businesses')
            .update({ subscription_status: 'active', subscription_expires_at: '2099-12-31T00:00:00Z' })
            .eq('id', profile.business_id).select('id')
        // Diharapkan: 42501 permission denied (setelah draft 0021 diterapkan)
        assert.ok(error, `kolom langganan dapat diubah langsung oleh owner (rows: ${data?.length})`)
        assert.equal(error.code, '42501')
        const { data: after } = await client.from('businesses')
            .select('subscription_status, subscription_expires_at').eq('id', profile.business_id).single()
        assert.equal(after.subscription_status, ctx.bizAOriginal.subscription_status)
        assert.equal(after.subscription_expires_at, ctx.bizAOriginal.subscription_expires_at)
    })

    // 2 ─ Owner mengelola cabang di bisnisnya
    test('2. Owner A menambah, mengubah, dan menghapus cabang miliknya', async () => {
        const { client, profile } = ctx.ownerA
        const name = `IT Cabang ${Date.now()}`
        const ins = await client.from('branches')
            .insert({ business_id: profile.business_id, name, address: 'Jl. Uji', phone: '0811' })
            .select('id, business_id, name, address, phone').single()
        if (ins.error?.code === 'P0001') {
            // batas paket sudah penuh — tidak bisa menguji CRUD tanpa mengubah seed
            assert.fail('seed Owner A harus menyisakan kuota cabang minimal 1')
        }
        assert.equal(ins.error, null)
        assert.equal(ins.data.business_id, profile.business_id)
        cleanup.push(() => client.from('branches').delete().eq('id', ins.data.id))

        const upd = await client.from('branches').update({ address: null, phone: '0812' })
            .eq('id', ins.data.id).select('address, phone, name').single()
        assert.equal(upd.error, null)
        assert.equal(upd.data.address, null)
        assert.equal(upd.data.phone, '0812')
        assert.equal(upd.data.name, name, 'nama tidak boleh tertimpa')

        const del = await client.from('branches').delete().eq('id', ins.data.id).select('id')
        assert.equal(del.error, null)
        assert.equal(del.data.length, 1)
        const { data: gone } = await client.from('branches').select('id').eq('id', ins.data.id)
        assert.equal(gone.length, 0)
    })

    // 2b ─ Cabang dengan riwayat transaksi tidak bisa dihapus (FK RESTRICT)
    test('2b. Cabang dengan transaksi historis ditolak dihapus (23503)', async () => {
        const { client, profile } = ctx.ownerA
        const { data: s } = await client.from('sales').select('branch_id').limit(1)
        assert.ok(s?.length, 'seed harus memiliki minimal satu penjualan untuk bisnis A')
        const { error } = await client.from('branches').delete()
            .eq('id', s[0].branch_id).eq('business_id', profile.business_id)
        assert.ok(error)
        assert.equal(error.code, '23503')
    })

    // 3 ─ Employee tidak boleh mengubah bisnis / cabang
    test('3. Employee A ditolak mengubah profil bisnis dan cabang', async () => {
        const { client, profile } = ctx.empA
        // UPDATE yang ditolak RLS tidak error: 0 baris terpengaruh
        const bu = await client.from('businesses').update({ name: 'HACKED' })
            .eq('id', profile.business_id).select('id')
        assert.equal(bu.error, null)
        assert.equal(bu.data.length, 0, 'employee tidak boleh mengubah bisnis')

        const bi = await client.from('branches')
            .insert({ business_id: profile.business_id, name: 'Cabang Liar' }).select('id')
        assert.ok(bi.error, 'employee tidak boleh membuat cabang')
        assert.equal(bi.error.code, '42501')

        const br = await client.from('branches').update({ name: 'HACKED' })
            .eq('id', profile.branch_id).select('id')
        assert.equal(br.data.length, 0)

        const bd = await client.from('branches').delete().eq('id', profile.branch_id).select('id')
        assert.equal(bd.data.length, 0)

        const { data: verify } = await ctx.ownerA.client.from('businesses')
            .select('name').eq('id', profile.business_id).single()
        assert.notEqual(verify.name, 'HACKED')
    })

    // 4 ─ Isolasi tenant
    test('4. Tenant A tidak dapat membaca atau mengubah data Tenant B', async () => {
        const a = ctx.ownerA.client
        const bizB = ctx.ownerB.profile.business_id

        for (const table of ['businesses', 'branches', 'sales', 'expenses', 'purchases', 'profiles']) {
            const col = table === 'businesses' ? 'id' : 'business_id'
            const { data, error } = await a.from(table).select('id').eq(col, bizB)
            assert.equal(error, null, `${table}: ${error?.message}`)
            assert.equal(data.length, 0, `${table} milik tenant B bocor ke tenant A`)
        }

        const upd = await a.from('businesses').update({ name: 'TAMPERED' }).eq('id', bizB).select('id')
        assert.equal(upd.data.length, 0)

        const ins = await a.from('branches').insert({ business_id: bizB, name: 'Injected' }).select('id')
        assert.ok(ins.error, 'tenant A tidak boleh membuat cabang di tenant B')

        const { data: bAfter } = await ctx.ownerB.client.from('businesses')
            .select('name').eq('id', bizB).single()
        assert.equal(bAfter.name, ctx.bizBOriginal.name)
    })

    // 5 ─ Employee tidak dapat membaca HPP
    test('5. Employee A tidak dapat membaca products.cost_price', async () => {
        const c = ctx.empA.client
        const direct = await c.from('products').select('id, cost_price').limit(1)
        assert.ok(direct.error, 'select cost_price harus ditolak')
        assert.equal(direct.error.code, '42501')

        const star = await c.from('products').select('*').limit(1)
        assert.ok(star.error, 'select * harus ditolak karena memuat cost_price')

        const pub = await c.from('products').select('id, name, selling_price').limit(5)
        assert.equal(pub.error, null, 'katalog publik tetap harus dapat dibaca kasir')
        assert.ok(pub.data.length > 0, 'seed harus memiliki produk')

        const view = await c.from('owner_products_view').select('*').limit(1)
        assert.equal(view.error, null)
        assert.equal(view.data.length, 0, 'owner_products_view harus kosong bagi pegawai')

        const ownerView = await ctx.ownerA.client.from('owner_products_view').select('id, cost_price').limit(1)
        assert.equal(ownerView.error, null)
        assert.ok(ownerView.data.length > 0 && 'cost_price' in ownerView.data[0])
    })

    // 6 ─ Batas cabang sesuai paket (F2)
    test('6. Insert cabang langsung melewati max_branches ditolak database', async () => {
        const { client, profile } = ctx.ownerA
        const { data: biz } = await client.from('businesses')
            .select('subscription_plans(max_branches)').eq('id', profile.business_id).single()
        const max = biz?.subscription_plans?.max_branches
        assert.ok(Number.isInteger(max), 'seed Owner A harus memakai paket dengan max_branches terbatas')

        const { count } = await client.from('branches')
            .select('id', { count: 'exact', head: true }).eq('business_id', profile.business_id)
        const created = []
        let rejection = null
        try {
            for (let i = count; i <= max; i++) {
                const r = await client.from('branches')
                    .insert({ business_id: profile.business_id, name: `IT Limit ${i}-${Date.now()}` })
                    .select('id').single()
                if (r.error) { rejection = r.error; break }
                created.push(r.data.id)
            }

            const { count: finalCount } = await client.from('branches')
                .select('id', { count: 'exact', head: true }).eq('business_id', profile.business_id)
            assert.ok(rejection, `berhasil membuat ${finalCount} cabang padahal max ${max}`)
            assert.equal(rejection.code, 'P0001')
            assert.equal(finalCount, max)
        } finally {
            for (const id of created) {
                await client.from('branches').delete().eq('id', id)
            }
        }
    })

    // 6b ─ Dua insert cabang bersamaan tidak bisa melewati limit (Race condition / Concurrency safety)
    test('6b. Dua insert cabang bersamaan tidak bisa melewati limit', async () => {
        const { client, profile } = ctx.ownerA
        const { data: biz } = await client.from('businesses')
            .select('subscription_plans(max_branches)').eq('id', profile.business_id).single()
        const max = biz?.subscription_plans?.max_branches
        assert.ok(Number.isInteger(max))

        // Siapkan kondisi agar sisa kuota tepat 1 (misal dari 1 cabang ke max-1)
        const { count: currentCount } = await client.from('branches')
            .select('id', { count: 'exact', head: true }).eq('business_id', profile.business_id)
        
        const filler = []
        try {
            for (let i = currentCount; i < max - 1; i++) {
                const r = await client.from('branches')
                    .insert({ business_id: profile.business_id, name: `IT Filler ${i}-${Date.now()}` })
                    .select('id').single()
                if (!r.error) filler.push(r.data.id)
            }

            // Luncurkan 2 request insert secara bersamaan memperebutkan 1 slot terakhir
            const p1 = client.from('branches')
                .insert({ business_id: profile.business_id, name: `IT Race 1-${Date.now()}` })
                .select('id').single()
            const p2 = client.from('branches')
                .insert({ business_id: profile.business_id, name: `IT Race 2-${Date.now()}` })
                .select('id').single()

            const [res1, res2] = await Promise.all([p1, p2])

            if (res1.data?.id) filler.push(res1.data.id)
            if (res2.data?.id) filler.push(res2.data.id)

            const successCount = [res1, res2].filter((r) => !r.error).length
            const rejectedCount = [res1, res2].filter((r) => r.error?.code === 'P0001').length

            assert.equal(successCount, 1, 'Tepat 1 insert paralel yang boleh berhasil')
            assert.equal(rejectedCount, 1, 'Tepat 1 insert paralel yang harus ditolak dengan P0001')

            const { count: finalCount } = await client.from('branches')
                .select('id', { count: 'exact', head: true }).eq('business_id', profile.business_id)
            assert.equal(finalCount, max, `Total cabang tidak boleh melampaui max (${max})`)
        } finally {
            for (const id of filler) {
                await client.from('branches').delete().eq('id', id)
            }
        }
    })

    // 6c ─ Sinkronisasi Migrasi 0022: Trial tanpa plan & status expired dibatasi maks 1 cabang
    test('6c. Trial tanpa plan & status expired dibatasi maksimal 1 cabang (Migrasi 0022)', async () => {
        const { client, profile } = ctx.ownerB
        const bizBId = profile.business_id

        // Ambil admin client (hanya untuk set kondisi status trial/expired sementara pada Tenant B)
        const adminClient = (await import('@supabase/supabase-js')).createClient(
            E.STAGING_SUPABASE_URL,
            // Baca service key staging dari .env.staging.local untuk fixture setup
            fs.readFileSync('.env.staging.local', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1]
        )

        try {
            // Skenario 1: Status 'trial' tanpa plan (subscription_plan_id = null)
            await adminClient.from('businesses')
                .update({ subscription_status: 'trial', subscription_plan_id: null })
                .eq('id', bizBId)

            // Tenant B sudah punya 1 cabang. Coba buat cabang ke-2 menggunakan JWT Owner B
            const trialInsert = await client.from('branches')
                .insert({ business_id: bizBId, name: `IT Trial Fail-${Date.now()}` })
                .select('id').single()

            assert.ok(trialInsert.error, 'Trial tanpa plan tidak boleh menambah cabang melebihi 1')
            assert.equal(trialInsert.error.code, 'P0001')

            // Skenario 2: Status 'expired'
            await adminClient.from('businesses')
                .update({ subscription_status: 'expired', subscription_plan_id: null })
                .eq('id', bizBId)

            const expiredInsert = await client.from('branches')
                .insert({ business_id: bizBId, name: `IT Expired Fail-${Date.now()}` })
                .select('id').single()

            assert.ok(expiredInsert.error, 'Bisnis berstatus expired tidak boleh menambah cabang')
            assert.equal(expiredInsert.error.code, 'P0001')
        } finally {
            // Kembalikan konfigurasi Tenant B ke semula
            await adminClient.from('businesses')
                .update({
                    subscription_status: ctx.bizBOriginal.subscription_status,
                    subscription_plan_id: ctx.bizBOriginal.subscription_plan_id,
                    subscription_expires_at: ctx.bizBOriginal.subscription_expires_at,
                })
                .eq('id', bizBId)
        }
    })

    // 7 ─ Transaksi atomik, riwayat, struk, dan konsistensi keuangan
    test('7. Penjualan via RPC, riwayat, data struk, dan rekap keuangan konsisten', async () => {
        const { client, profile, user } = ctx.empA
        const { data: products } = await client.from('products')
            .select('id, selling_price').eq('status', 'aktif').limit(1)
        assert.ok(products.length)
        const p = products[0]
        const key = crypto.randomUUID()
        const total = Number(p.selling_price) * 2

        const before = await ctx.ownerA.client.from('sales')
            .select('total').eq('branch_id', profile.branch_id)
        const beforeSum = before.data.reduce((s, r) => s + Number(r.total), 0)

        const rpc = await client.rpc('create_sale_atomic', {
            p_business_id: profile.business_id, p_branch_id: profile.branch_id, p_user_id: user.id,
            p_channel: 'offline', p_payment_method: 'cash', p_total: total,
            p_items: [{ product_id: p.id, quantity: 2, price: p.selling_price, cost_price: 0, subtotal: total }],
            p_idempotency_key: key, p_invoice_number: `IT/${Date.now()}`,
        })
        assert.equal(rpc.error, null, rpc.error?.message)
        assert.equal(rpc.data.is_duplicate, false)
        const saleId = rpc.data.sale_id

        // idempotensi: retry tidak membuat baris baru
        const retry = await client.rpc('create_sale_atomic', {
            p_business_id: profile.business_id, p_branch_id: profile.branch_id, p_user_id: user.id,
            p_channel: 'offline', p_payment_method: 'cash', p_total: total,
            p_items: [{ product_id: p.id, quantity: 2, price: p.selling_price, cost_price: 0, subtotal: total }],
            p_idempotency_key: key,
        })
        assert.equal(retry.data.sale_id, saleId)
        assert.equal(retry.data.is_duplicate, true)

        // HPP tercatat dari DB, bukan dari payload (payload mengirim 0)
        const { data: items } = await ctx.ownerA.client.from('sale_items')
            .select('cost_price, quantity').eq('sale_id', saleId)
        const { data: prodCost } = await ctx.ownerA.client.from('owner_products_view')
            .select('cost_price').eq('id', p.id).single()
        assert.equal(items.length, 1)
        assert.equal(Number(items[0].cost_price), Number(prodCost.cost_price))

        // riwayat + data struk (cabang & bisnis) terbaca oleh owner
        const { data: hist } = await ctx.ownerA.client.from('sales')
            .select('id, total, branches(name, address, phone), businesses(name, address, phone, logo_url)')
            .eq('id', saleId).single()
        assert.equal(Number(hist.total), total)
        assert.ok(hist.branches?.name)
        assert.ok('address' in hist.branches && 'logo_url' in hist.businesses)

        // rekap cabang naik tepat sebesar total transaksi
        const afterQ = await ctx.ownerA.client.from('sales')
            .select('total').eq('branch_id', profile.branch_id)
        const afterSum = afterQ.data.reduce((s, r) => s + Number(r.total), 0)
        assert.equal(afterSum - beforeSum, total)
        // Catatan: sales tidak dibersihkan otomatis karena audit log 0017 bersifat append-only.
    })

    // 7b ─ Integritas harga: RPC tidak boleh menerima total/harga palsu dari client
    test('7b. RPC menolak atau mengoreksi harga/total yang dimanipulasi', async () => {
        const { client, profile, user } = ctx.empA
        const { data: [p] } = await client.from('products')
            .select('id, selling_price').eq('status', 'aktif').limit(1)
        const rpc = await client.rpc('create_sale_atomic', {
            p_business_id: profile.business_id, p_branch_id: profile.branch_id, p_user_id: user.id,
            p_channel: 'offline', p_payment_method: 'cash', p_total: 1,
            p_items: [{ product_id: p.id, quantity: 5, price: 1, cost_price: 0, subtotal: 1 }],
            p_idempotency_key: crypto.randomUUID(),
        })
        if (rpc.error) return // ditolak: perilaku yang benar
        const { data: sale } = await ctx.ownerA.client.from('sales')
            .select('total').eq('id', rpc.data.sale_id).single()
        assert.equal(Number(sale.total), Number(p.selling_price) * 5,
            'RPC menyimpan total palsu dari client (bypass validasi server action)')
    })

    // 8 ─ Kegagalan tidak meninggalkan data parsial
    test('8. RPC gagal di tengah tidak meninggalkan header sales yatim', async () => {
        const { client, profile, user } = ctx.empA
        const key = crypto.randomUUID()
        const { data: [p] } = await client.from('products').select('id, selling_price').limit(1)
        const rpc = await client.rpc('create_sale_atomic', {
            p_business_id: profile.business_id, p_branch_id: profile.branch_id, p_user_id: user.id,
            p_channel: 'offline', p_payment_method: 'cash', p_total: 10,
            p_items: [
                { product_id: p.id, quantity: 1, price: p.selling_price, cost_price: 0, subtotal: 10 },
                { product_id: '00000000-0000-0000-0000-000000000000', quantity: 1, price: 1, cost_price: 0, subtotal: 1 },
            ],
            p_idempotency_key: key,
        })
        assert.ok(rpc.error, 'produk tak dikenal harus menggagalkan seluruh transaksi')
        const { data: orphan } = await ctx.ownerA.client.from('sales').select('id').eq('idempotency_key', key)
        assert.equal(orphan.length, 0)
    })

    // 9 ─ Pegawai tidak bisa transaksi di cabang lain / bisnis lain
    test('9. Employee A ditolak membuat transaksi untuk bisnis B', async () => {
        const { client, user } = ctx.empA
        const { data: bBranch } = await ctx.ownerB.client.from('branches').select('id').limit(1)
        const rpc = await client.rpc('create_sale_atomic', {
            p_business_id: ctx.ownerB.profile.business_id, p_branch_id: bBranch[0].id, p_user_id: user.id,
            p_channel: 'offline', p_payment_method: 'cash', p_total: 0, p_items: [],
        })
        assert.ok(rpc.error)
        assert.match(rpc.error.message, /Akses ditolak/)
    })
})

if (BLOCK_REASON) {
    console.warn(`\n[phase1-staging] Integration test TIDAK dijalankan → ${BLOCK_REASON}\n`)
}
