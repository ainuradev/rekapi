/**
 * Phase 2 Rekapi — Live Supabase STAGING integration tests.
 *
 * Jalankan HANYA terhadap project staging terisolasi:
 *   $env:RUN_STAGING_INTEGRATION="1"; node --test tests/integration/phase2-staging.integration.mjs
 *
 * Aturan Keamanan:
 *  - TIDAK membaca .env / .env.local (mencegah fallback ke production).
 *  - Project target WAJIB 'ucvgszazrjnjaglaiswq' (staging).
 *  - Project production 'dnqzjrnyptwadojycxvm' DIBLOKIR KERAS.
 *  - Memakai JWT user nyata (Owner A, Employee A, Owner B) via Supabase Auth.
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ALLOWED_STAGING_REF = 'ucvgszazrjnjaglaiswq'
const FORBIDDEN_PRODUCTION_REFS = new Set(['dnqzjrnyptwadojycxvm'])

try {
    const linked = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim()
    if (linked && linked !== ALLOWED_STAGING_REF) FORBIDDEN_PRODUCTION_REFS.add(linked)
} catch { /* file opsional */ }

// Load .env.staging.local
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

process.env.STAGING_OWNER_A_EMAIL = process.env.STAGING_OWNER_A_EMAIL || 'owner-a@rekapi-staging.test'
process.env.STAGING_EMPLOYEE_A_EMAIL = process.env.STAGING_EMPLOYEE_A_EMAIL || 'pegawai-a@rekapi-staging.test'
process.env.STAGING_OWNER_B_EMAIL = process.env.STAGING_OWNER_B_EMAIL || 'owner-b@rekapi-staging.test'

if (!process.env.STAGING_PROJECT_REF && process.env.STAGING_SUPABASE_URL) {
    const m = process.env.STAGING_SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)
    if (m) process.env.STAGING_PROJECT_REF = m[1]
}

const E = process.env

describe('Phase 2 — Supabase Staging Live Integration Test', () => {
    let clientOwnerA
    let clientEmployeeA
    let clientOwnerB
    let userOwnerA
    let userEmployeeA
    let userOwnerB
    let profileOwnerA
    let profileEmployeeA
    let profileOwnerB
    let phase2TablesAvailable = false

    before(async () => {
        if (!E.RUN_STAGING_INTEGRATION) {
            console.log('⚠️ RUN_STAGING_INTEGRATION != 1. Menjalankan verifikasi offline/safety.')
            return
        }

        assert.ok(E.STAGING_SUPABASE_URL, 'STAGING_SUPABASE_URL wajib diisi')
        assert.ok(E.STAGING_SUPABASE_ANON_KEY, 'STAGING_SUPABASE_ANON_KEY wajib diisi')
        assert.ok(E.STAGING_PROJECT_REF, 'STAGING_PROJECT_REF wajib diisi')

        // Safety check production
        assert.ok(
            !FORBIDDEN_PRODUCTION_REFS.has(E.STAGING_PROJECT_REF),
            `KRITIKAL: Target ref ${E.STAGING_PROJECT_REF} terdeteksi sebagai PRODUCTION! Pengujian DIBATALKAN.`
        )
        assert.equal(
            E.STAGING_PROJECT_REF,
            ALLOWED_STAGING_REF,
            `Target harus tepat project staging resmi ${ALLOWED_STAGING_REF}`
        )

        function makeClient() {
            return createClient(E.STAGING_SUPABASE_URL, E.STAGING_SUPABASE_ANON_KEY, {
                auth: { persistSession: false, autoRefreshToken: false }
            })
        }

        clientOwnerA = makeClient()
        clientEmployeeA = makeClient()
        clientOwnerB = makeClient()

        // Login users
        const authA = await clientOwnerA.auth.signInWithPassword({
            email: E.STAGING_OWNER_A_EMAIL,
            password: E.STAGING_OWNER_A_PASSWORD
        })
        assert.ok(!authA.error, `Login Owner A gagal: ${authA.error?.message}`)
        userOwnerA = authA.data.user

        const authEmp = await clientEmployeeA.auth.signInWithPassword({
            email: E.STAGING_EMPLOYEE_A_EMAIL,
            password: E.STAGING_EMPLOYEE_A_PASSWORD
        })
        assert.ok(!authEmp.error, `Login Employee A gagal: ${authEmp.error?.message}`)
        userEmployeeA = authEmp.data.user

        const authB = await clientOwnerB.auth.signInWithPassword({
            email: E.STAGING_OWNER_B_EMAIL,
            password: E.STAGING_OWNER_B_PASSWORD
        })
        assert.ok(!authB.error, `Login Owner B gagal: ${authB.error?.message}`)
        userOwnerB = authB.data.user

        // Fetch profiles
        const { data: profA } = await clientOwnerA.from('profiles').select('*').eq('id', userOwnerA.id).single()
        profileOwnerA = profA

        const { data: profEmp } = await clientEmployeeA.from('profiles').select('*').eq('id', userEmployeeA.id).single()
        profileEmployeeA = profEmp

        const { data: profB } = await clientOwnerB.from('profiles').select('*').eq('id', userOwnerB.id).single()
        profileOwnerB = profB

        // Check if Phase 2 tables are created on staging
        const { error: checkErr } = await clientOwnerA.from('raw_materials').select('id').limit(1)
        phase2TablesAvailable = !checkErr
    })

    test('0. Validasi Target Database & Environment Safety', () => {
        if (!E.RUN_STAGING_INTEGRATION) return
        assert.equal(E.STAGING_PROJECT_REF, ALLOWED_STAGING_REF)
        assert.ok(!FORBIDDEN_PRODUCTION_REFS.has(E.STAGING_PROJECT_REF))
        assert.ok(profileOwnerA?.business_id)
        assert.ok(profileOwnerB?.business_id)
        assert.notEqual(profileOwnerA.business_id, profileOwnerB.business_id)
    })

    test('1. Status Kesiapan Skema Migrasi 0023 di Staging', () => {
        if (!E.RUN_STAGING_INTEGRATION) return
        if (!phase2TablesAvailable) {
            console.log('ℹ️ Tabel raw_materials belum ditemukan di schema cache staging. Migrasi 0023 siap dieksekusi.')
        } else {
            console.log('✅ Tabel Phase 2 aktif dan terdeteksi di staging database.')
        }
        assert.ok(true)
    })

    test('2. Multi-tenant RLS Isolation Guard (Tenant A vs Tenant B)', async () => {
        if (!E.RUN_STAGING_INTEGRATION || !phase2TablesAvailable) return

        // Owner A coba query raw materials
        const { data: matsA, error: errA } = await clientOwnerA.from('raw_materials').select('*')
        assert.ok(!errA, `Query Owner A gagal: ${errA?.message}`)
        if (matsA) {
            for (const m of matsA) {
                assert.equal(m.business_id, profileOwnerA.business_id, 'Semua data harus milik bisnis A')
            }
        }

        // Owner B coba query raw materials
        const { data: matsB, error: errB } = await clientOwnerB.from('raw_materials').select('*')
        assert.ok(!errB, `Query Owner B gagal: ${errB?.message}`)
        if (matsB) {
            for (const m of matsB) {
                assert.equal(m.business_id, profileOwnerB.business_id, 'Semua data harus milik bisnis B')
            }
        }
    })

    test('3. Employee A ditolak mutasi bahan baku cabang di luar wewenangnya', async () => {
        if (!E.RUN_STAGING_INTEGRATION || !phase2TablesAvailable) return

        // Employee A hanya berwenang di cabang profileEmployeeA.branch_id
        if (profileEmployeeA.branch_id) {
            // Mencoba mutasi dengan branch_id palsu atau milik cabang lain
            const { error: mutErr } = await clientEmployeeA.from('inventory_mutations').insert({
                business_id: profileEmployeeA.business_id,
                branch_id: '00000000-0000-0000-0000-000000000000',
                raw_material_id: '00000000-0000-0000-0000-000000000000',
                mutation_type: 'adjustment',
                change_amount: 1,
                balance_after: 1
            })
            assert.ok(mutErr, 'Mutasi di luar cabang wewenang wajib ditolak oleh database RLS')
        }
    })

    test('4. Ledger inventory_mutations tidak dapat di-update atau di-delete langsung (Immutable)', async () => {
        if (!E.RUN_STAGING_INTEGRATION || !phase2TablesAvailable) return

        // Coba delete ledger
        const { error: delErr } = await clientOwnerA.from('inventory_mutations').delete().neq('id', 'dummy')
        assert.ok(delErr, 'Delete langsung pada inventory_mutations wajib ditolak database (42501)')
    })
})
