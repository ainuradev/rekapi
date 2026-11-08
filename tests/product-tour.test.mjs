import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('Interactive Spotlight Product Tour (Owner & Pegawai)', async (t) => {
    const rootDir = process.cwd()

    await t.test('1. ProductTour component defines Owner (6 steps) and Pegawai (3 steps) with spotlight & mobile drawer support', () => {
        const tourPath = path.join(rootDir, 'components/product-tour.tsx')
        assert.ok(fs.existsSync(tourPath), 'components/product-tour.tsx must exist')

        const src = fs.readFileSync(tourPath, 'utf8')

        // Step targets for Owner
        assert.ok(src.includes("target: 'dashboard-stats'"), 'Must include dashboard-stats target')
        assert.ok(src.includes("target: 'branch-selector'"), 'Must include branch-selector target')
        assert.ok(src.includes("target: 'nav-stok'"), 'Must include nav-stok target')
        assert.ok(src.includes("target: 'nav-kasir'"), 'Must include nav-kasir target')
        assert.ok(src.includes("target: 'nav-keuangan'"), 'Must include nav-keuangan target')
        assert.ok(src.includes("target: 'nav-cabang-pegawai'"), 'Must include nav-cabang-pegawai target')

        // Step targets for Pegawai
        assert.ok(src.includes("target: 'nav-riwayat'"), 'Must include nav-riwayat target for Pegawai')

        // Spotlight ring & overlay
        assert.ok(src.includes('ring-4 ring-emerald-500/80 rounded-xl transition-all duration-300'), 'Must render spotlight ring around target')
        assert.ok(src.includes('getBoundingClientRect'), 'Must measure target elements via getBoundingClientRect()')
        assert.ok(src.includes('rekapi_product_tour_v1_'), 'Must persist tour state per user in localStorage')
        assert.ok(src.includes('Selesai & Mulai'), 'Must render Selesai & Mulai on final step')
        assert.ok(src.includes('Lewati'), 'Must render Lewati button')
        assert.ok(src.includes('Kembali'), 'Must render Kembali button')
    })

    await t.test('2. DashboardNav & DashboardClient attach data-tour attributes and Panduan Aplikasi replay button', () => {
        const navPath = path.join(rootDir, 'app/dashboard/dashboard-nav.tsx')
        const clientPath = path.join(rootDir, 'app/dashboard/dashboard-client.tsx')

        const navSrc = fs.readFileSync(navPath, 'utf8')
        const clientSrc = fs.readFileSync(clientPath, 'utf8')

        assert.ok(clientSrc.includes('data-tour="dashboard-stats"'), 'DashboardClient must mark KPI stats with data-tour="dashboard-stats"')
        assert.ok(navSrc.includes('data-tour="branch-selector"'), 'DashboardNav must mark branch selector with data-tour="branch-selector"')
        assert.ok(navSrc.includes("tourId: 'nav-stok'"), 'DashboardNav must define nav-stok tourId')
        assert.ok(navSrc.includes("tourId: 'nav-kasir'"), 'DashboardNav must define nav-kasir tourId')
        assert.ok(navSrc.includes("tourId: 'nav-keuangan'"), 'DashboardNav must define nav-keuangan tourId')
        assert.ok(navSrc.includes("tourId: 'nav-cabang-pegawai'"), 'DashboardNav must define nav-cabang-pegawai tourId')
        assert.ok(navSrc.includes("tourId: 'nav-riwayat'"), 'DashboardNav must define nav-riwayat tourId')
        assert.ok(navSrc.includes('Panduan Aplikasi'), 'DashboardNav must include Panduan Aplikasi button to replay tour')
        assert.ok(navSrc.includes('<ProductTour'), 'DashboardNav must mount ProductTour component')
    })
})

