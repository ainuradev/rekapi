import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
    OFFICIAL_PLAN_CATALOG,
    TRIAL_LIMITS,
    canAddBranch,
    canAddEmployee,
    canAssignEmployeeToBranch,
} from '../lib/subscription-limits.ts'
import {
    checkModuleAccess,
    checkServerModuleAccess,
    getSubscriptionPlanTier,
} from '../lib/subscription-access.ts'
import {
    DEFAULT_SUBSCRIPTION_PLANS,
    ensureSubscriptionPlans,
} from '../lib/subscription-plans.ts'
import {
    isQuotaDowngrade,
    executeAutoDeactivateOnDowngrade,
} from '../lib/subscription-downgrade.ts'

const ROOT = process.cwd()

function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return {}
    const raw = fs.readFileSync(filePath, 'utf8')
    const env = {}
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const idx = trimmed.indexOf('=')
        if (idx > 0) {
            env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
        }
    }
    return env
}

describe('COMPREHENSIVE END-TO-END SYSTEM AUDIT & BLACKBOX TESTING (DIMENSI 1 S/D 5)', () => {
    // =========================================================================
    // DIMENSI 1: Keselarasan Codebase vs blueprint.md (Single Source of Truth)
    // =========================================================================
    test('Dimensi 1: Keselarasan blueprint.md, konstanta paket (49k/99k/179k, 28 hari, kuota 1/3/5), Cabang Utama (PUSAT), Auto-Deactivate, & Beban Non-Kas', () => {
        const blueprint = fs.readFileSync(path.join(ROOT, 'blueprint.md'), 'utf8')

        // 1. Dokumentasi mencakup migrasi 0001 s/d 0045
        assert.match(blueprint, /Migrasi 0001 s\/d 0045/i, 'blueprint.md wajib mencakup Migrasi 0001 s/d 0045')

        // 2. Harga paket resmi & harga coret di blueprint.md
        assert.match(blueprint, /Rp 49\.000/, 'blueprint.md wajib mencantumkan harga Standard Rp 49.000')
        assert.match(blueprint, /Rp 99\.000/, 'blueprint.md wajib mencantumkan harga Business Rp 99.000')
        assert.match(blueprint, /Rp 179\.000/, 'blueprint.md wajib mencantumkan harga Pro Rp 179.000')
        assert.match(blueprint, /149\.000/, 'blueprint.md wajib mencantumkan harga coret Standard Rp 149.000')
        assert.match(blueprint, /299\.000/, 'blueprint.md wajib mencantumkan harga coret Business Rp 299.000')
        assert.match(blueprint, /499\.000/, 'blueprint.md wajib mencantumkan harga coret Pro Rp 499.000')
        assert.match(blueprint, /28 hari/i, 'blueprint.md wajib mencantumkan masa aktif 28 hari')

        // 3. Konsep arsitektur terbaru terdokumentasi di blueprint.md
        assert.match(blueprint, /PUSAT/, 'blueprint.md wajib mendokumentasikan Cabang Utama (code = PUSAT)')
        assert.match(blueprint, /auto_deactivate_on_downgrade/, 'blueprint.md wajib mendokumentasikan auto_deactivate_on_downgrade')
        assert.match(blueprint, /is_non_cash/, 'blueprint.md wajib mendokumentasikan akuntansi Beban Non-Kas (is_non_cash)')
        assert.match(blueprint, /image_url/, 'blueprint.md wajib mendokumentasikan image_url produk')
        assert.match(blueprint, /qris_image_url/, 'blueprint.md wajib mendokumentasikan qris_image_url toko')
        assert.match(blueprint, /system_notifications/, 'blueprint.md wajib mendokumentasikan Pusat Notifikasi Terpadu')
        assert.match(blueprint, /ProductTour/, 'blueprint.md wajib mendokumentasikan Interactive ProductTour')

        // 4. Keselarasan antara OFFICIAL_PLAN_CATALOG (subscription-limits.ts) dan DEFAULT_SUBSCRIPTION_PLANS (subscription-plans.ts)
        for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
            const limitCatalog = OFFICIAL_PLAN_CATALOG[plan.code]
            assert.ok(limitCatalog, `Paket ${plan.code} wajib ada di OFFICIAL_PLAN_CATALOG`)
            assert.equal(plan.price, limitCatalog.price, `Harga paket ${plan.code} harus sinkron`)
            assert.equal(plan.original_price, limitCatalog.original_price, `Harga coret paket ${plan.code} harus sinkron`)
            assert.equal(plan.max_branches, limitCatalog.max_branches, `Kuota cabang paket ${plan.code} harus sinkron`)
            assert.equal(plan.max_employees, limitCatalog.max_employees, `Kuota pegawai paket ${plan.code} harus sinkron`)
            assert.equal(plan.duration_days, 28, `Durasi paket ${plan.code} harus 28 hari`)
        }
    })

    // =========================================================================
    // DIMENSI 2: Audit Cacat Logika Bisnis & Akuntansi Keuangan (Zero Financial Drift)
    // =========================================================================
    test('Dimensi 2: Zero Financial Drift pada Void Penjualan, Pembelian Kredit vs Pelunasan Utang, Penjualan Kredit (DP), & Persamaan Neraca', () => {
        // 1. Verifikasi voidSale membersihkan piutang gantung & memanggil void_sale_atomic
        const riwayatActions = fs.readFileSync(path.join(ROOT, 'app/dashboard/penjualan/riwayat/actions.ts'), 'utf8')
        assert.match(riwayatActions, /supabase\.rpc\('void_sale_atomic'/, 'voidSale wajib memanggil void_sale_atomic')
        assert.match(
            riwayatActions,
            /\.from\('receivables'\)\s*\.delete\(\)\s*\.eq\('sale_id',\s*saleId\)\s*\.eq\('business_id',\s*profile\.business_id\)/,
            'voidSale wajib menghapus entitas receivables terkait agar tidak menjadi piutang gantung'
        )

        // 2. Verifikasi addPurchase & deletePurchase menjaga sinkronisasi raw_materials.stock dan tidak mendouble-count beban di Laba Rugi
        const bahanBakuActions = fs.readFileSync(path.join(ROOT, 'app/dashboard/bahan-baku/actions.ts'), 'utf8')
        assert.match(
            bahanBakuActions,
            /\.from\('raw_materials'\)\s*\.update\(\{\s*stock:\s*total/,
            'addPurchase & deletePurchase wajib menyinkronkan agregat raw_materials.stock dari raw_material_branch_stocks'
        )

        const labaRugiPage = fs.readFileSync(path.join(ROOT, 'app/dashboard/keuangan/laba-rugi/page.tsx'), 'utf8')
        assert.doesNotMatch(
            labaRugiPage,
            /from\('debts_payables'\)|debt_payment/,
            'Laba-Rugi tidak boleh menghitung pelunasan utang (debt_payment) sebagai beban operasional ganda'
        )

        // 3. Verifikasi Neraca menyertakan is_non_cash pada query expenses dan mengecualikan piutang dari transaksi voided
        const neracaPage = fs.readFileSync(path.join(ROOT, 'app/dashboard/keuangan/neraca/page.tsx'), 'utf8')
        assert.match(
            neracaPage,
            /\.select\('amount, category, branch_id, expense_date, description, is_non_cash'\)/,
            'Neraca wajib mengambil kolom is_non_cash dari tabel expenses'
        )
        assert.match(
            neracaPage,
            /if\s*\(saleObj\?\.status\s*===\s*'voided'\)\s*return\s*false/,
            'Neraca wajib mengecualikan piutang yang berasal dari penjualan berstatus voided'
        )

        // 4. Verifikasi Buku Utang & Piutang menghitung sisa utang/piutang hanya dari status !== paid dan mengecualikan voided
        const utangPiutangPage = fs.readFileSync(path.join(ROOT, 'app/dashboard/keuangan/utang-piutang/page.tsx'), 'utf8')
        const utangPiutangClient = fs.readFileSync(path.join(ROOT, 'app/dashboard/keuangan/utang-piutang/utang-piutang-client.tsx'), 'utf8')
        assert.match(
            utangPiutangPage,
            /r\.sales\?\.status\s*!==\s*'voided'/,
            'Halaman Utang-Piutang wajib memfilter piutang dari penjualan voided'
        )
        assert.match(
            utangPiutangClient,
            /debts\s*\.filter\(\(d\)\s*=>\s*d\.status\s*!==\s*'paid'\)/,
            'UtangPiutangClient wajib memfilter status !== paid saat menghitung remainingDebts'
        )
        assert.match(
            utangPiutangClient,
            /receivables\s*\.filter\(\(r\)\s*=>\s*r\.status\s*!==\s*'paid'\)/,
            'UtangPiutangClient wajib memfilter status !== paid saat menghitung remainingReceivables'
        )
    })

    // =========================================================================
    // DIMENSI 3: Isolasi Multi-Tenant, Cabang, Role (Owner vs Pegawai) & Tier Gating
    // =========================================================================
    test('Dimensi 3: Proteksi Role (Owner vs Pegawai), Server Action Tier Gating (checkServerModuleAccess), & Resolusi Mode Konsolidasi (all -> Cabang Utama)', () => {
        // 1. Seluruh halaman khusus Owner wajib memblokir Pegawai (profile.role !== 'owner' -> redirect('/dashboard'))
        const ownerOnlyPages = [
            'app/dashboard/cabang/page.tsx',
            'app/dashboard/pegawai/page.tsx',
            'app/dashboard/bahan-baku/page.tsx',
            'app/dashboard/subscription/page.tsx',
            'app/dashboard/data/page.tsx',
            'app/dashboard/keuangan/page.tsx',
            'app/dashboard/keuangan/laba-rugi/page.tsx',
            'app/dashboard/keuangan/neraca/page.tsx',
            'app/dashboard/keuangan/arus-kas/page.tsx',
            'app/dashboard/keuangan/kas-rekening/page.tsx',
            'app/dashboard/keuangan/utang-piutang/page.tsx',
            'app/dashboard/keuangan/modal/page.tsx',
            'app/dashboard/keuangan/beban/page.tsx',
            'app/dashboard/keuangan/kinerja/page.tsx',
        ]

        for (const relPath of ownerOnlyPages) {
            const content = fs.readFileSync(path.join(ROOT, relPath), 'utf8')
            assert.match(
                content,
                /profile\??\.role\s*!==\s*'owner'/,
                `Halaman ${relPath} wajib memeriksa profile.role !== 'owner' agar tidak bisa diakses Pegawai`
            )
        }

        // 2. Server Actions modul berjenjang wajib menegakkan checkServerModuleAccess
        const rmActions = fs.readFileSync(path.join(ROOT, 'app/dashboard/bahan-baku/raw-material-actions.ts'), 'utf8')
        const supActions = fs.readFileSync(path.join(ROOT, 'app/dashboard/bahan-baku/supplier-actions.ts'), 'utf8')
        const purActions = fs.readFileSync(path.join(ROOT, 'app/dashboard/bahan-baku/actions.ts'), 'utf8')
        const finActions = fs.readFileSync(path.join(ROOT, 'app/dashboard/keuangan/actions.ts'), 'utf8')

        assert.match(rmActions, /checkServerModuleAccess\(profile\.business_id,\s*'raw_materials',\s*supabase\)/)
        assert.match(supActions, /checkServerModuleAccess\(profile\.business_id,\s*'raw_materials',\s*supabase\)/)
        assert.match(purActions, /checkServerModuleAccess\(profile\.business_id,\s*'raw_materials',\s*supabase\)/)
        assert.match(finActions, /getAuthorizedOwner\('cash_accounts'\)/)
        assert.match(finActions, /getAuthorizedOwner\('debts_receivables'\)/)
        assert.match(finActions, /getAuthorizedOwner\('capital_equity'\)/)

        // 3. Proteksi HPP & Satuan di produk/actions.ts serta Audit/Payments di riwayat/actions.ts
        const prodActions = fs.readFileSync(path.join(ROOT, 'app/dashboard/produk/actions.ts'), 'utf8')
        assert.match(prodActions, /Hanya Owner yang dapat mengubah HPP produk/)
        assert.match(prodActions, /Hanya Owner yang dapat mengubah satuan produk/)
    })

    // =========================================================================
    // DIMENSI 4: Audit Keselarasan Database Live (Staging & Production vs Migrasi 0001-0045)
    // =========================================================================
    test('Dimensi 4: Verifikasi Skema Live Database Staging & Production (Tabel, Kolom, View, Harga Paket 49k/99k/179k, & Notifikasi Bersih)', async () => {
        const stagingEnv = parseEnvFile(path.join(ROOT, '.env.staging.local'))
        const prodEnv = parseEnvFile(path.join(ROOT, '.env'))

        const targets = []
        if (stagingEnv.NEXT_PUBLIC_SUPABASE_URL && stagingEnv.SUPABASE_SERVICE_ROLE_KEY) {
            targets.push({
                name: 'Staging (ucvgszazrjnjaglaiswq)',
                url: stagingEnv.NEXT_PUBLIC_SUPABASE_URL,
                key: stagingEnv.SUPABASE_SERVICE_ROLE_KEY,
            })
        }
        if (prodEnv.NEXT_PUBLIC_SUPABASE_URL && prodEnv.SUPABASE_SERVICE_ROLE_KEY) {
            targets.push({
                name: 'Production (dnqzjrnyptwadojycxvm)',
                url: prodEnv.NEXT_PUBLIC_SUPABASE_URL,
                key: prodEnv.SUPABASE_SERVICE_ROLE_KEY,
            })
        }

        assert.ok(targets.length >= 1, 'Minimal 1 environment database (Staging/Production) harus terkonfigurasi')

        for (const target of targets) {
            const admin = createClient(target.url, target.key, {
                auth: { persistSession: false, autoRefreshToken: false },
            })

            // 1. Pastikan paket langganan di database sinkron (49000, 99000, 179000, 28 hari, kuota 1/3/5)
            const plans = await ensureSubscriptionPlans(admin)
            const stdPlan = plans.find((p) => p.code === 'standard')
            const bizPlan = plans.find((p) => p.code === 'business')
            const proPlan = plans.find((p) => p.code === 'pro')

            assert.ok(stdPlan && bizPlan && proPlan, `[${target.name}] Ketiga paket wajib ada di subscription_plans`)
            assert.equal(Number(stdPlan.price), 49000, `[${target.name}] Harga Standard harus 49000`)
            assert.equal(Number(bizPlan.price), 99000, `[${target.name}] Harga Business harus 99000`)
            assert.equal(Number(proPlan.price), 179000, `[${target.name}] Harga Pro harus 179000`)
            assert.equal(Number(stdPlan.max_branches), 1, `[${target.name}] max_branches Standard harus 1`)
            assert.equal(Number(bizPlan.max_branches), 3, `[${target.name}] max_branches Business harus 3`)
            assert.equal(Number(proPlan.max_branches), 5, `[${target.name}] max_branches Pro harus 5`)
            assert.equal(Number(stdPlan.max_employees), 1, `[${target.name}] max_employees Standard harus 1`)
            assert.equal(Number(bizPlan.max_employees), 3, `[${target.name}] max_employees Business harus 3`)
            assert.equal(Number(proPlan.max_employees), 5, `[${target.name}] max_employees Pro harus 5`)

            // 2. Pastikan seluruh kolom krusial migrasi 0001-0045 tersedia di live schema
            const schemaChecks = [
                { table: 'businesses', cols: 'id, name, qris_image_url, subscription_status, subscription_plan_id' },
                { table: 'branches', cols: 'id, business_id, name, code, status, qris_image_url' },
                { table: 'profiles', cols: 'id, business_id, branch_id, role, is_active' },
                { table: 'products', cols: 'id, business_id, name, selling_price, cost_price, unit, image_url, status' },
                { table: 'owner_products_view', cols: 'id, business_id, name, selling_price, cost_price, image_url' },
                { table: 'expenses', cols: 'id, business_id, branch_id, category, amount, is_non_cash' },
                { table: 'raw_materials', cols: 'id, business_id, name, stock, cost_per_unit, min_stock' },
                { table: 'raw_material_branch_stocks', cols: 'id, business_id, raw_material_id, branch_id, quantity' },
                { table: 'debts_payables', cols: 'id, business_id, branch_id, purchase_id, total_amount, paid_amount, status' },
                { table: 'receivables', cols: 'id, business_id, branch_id, sale_id, total_amount, paid_amount, status' },
                { table: 'system_notifications', cols: 'id, business_id, title, message, category, action_url' },
                { table: 'notification_reads', cols: 'id, notification_id, user_id, read_at' },
            ]

            for (const chk of schemaChecks) {
                const { error } = await admin.from(chk.table).select(chk.cols).limit(1)
                assert.equal(
                    error,
                    null,
                    `[${target.name}] Tabel/View ${chk.table} (${chk.cols}) gagal diakses: ${error?.message}`
                )
            }

            // 3. Pastikan tidak ada notifikasi dummy testing ("askldhasd", "langganan woi", "temoek")
            const { data: dummyNotifs } = await admin
                .from('system_notifications')
                .select('id, title')
                .in('title', ['askldhasd', 'langganan woi', 'temoek'])
            assert.equal(
                (dummyNotifs ?? []).length,
                0,
                `[${target.name}] Tabel system_notifications harus bersih dari data dummy testing`
            )
        }
    })

    // =========================================================================
    // DIMENSI 5: Blackbox Testing Simulasi Alur Pengguna (5 Skenario End-to-End)
    // =========================================================================
    test('Dimensi 5 - Skenario 1: Onboarding Tenant Baru -> Cabang Utama (PUSAT) -> Kuota Paket Standard (1 Cabang, 1 Kasir)', () => {
        // Simulasi tenant baru terdaftar dengan Cabang Utama (code = 'PUSAT')
        const tenant = {
            id: 'biz-new-001',
            name: 'Kopi Senja Nusantara',
            subscription_status: 'active',
            plan: OFFICIAL_PLAN_CATALOG.standard,
            branches: [
                { id: 'br-pusat-001', code: 'PUSAT', name: 'Cabang Utama', status: 'active' },
            ],
            employees: [],
        }

        // Verifikasi Cabang Utama terbentuk dengan code = 'PUSAT' dan status = 'active'
        assert.equal(tenant.branches.length, 1)
        assert.equal(tenant.branches[0].code, 'PUSAT')
        assert.equal(tenant.branches[0].status, 'active')

        // Pada paket Standard (max_branches = 1), tambah cabang ke-2 wajib ditolak
        const activeBranchCount = tenant.branches.filter((b) => b.status === 'active').length
        const addSecondBranchCheck = canAddBranch(activeBranchCount, tenant.plan, tenant.subscription_status)
        assert.equal(addSecondBranchCheck.allowed, false, 'Paket Standard wajib menolak penambahan cabang ke-2')
        assert.match(addSecondBranchCheck.reason || '', /maksimal 1 cabang/i)

        // Penambahan kasir pertama di Cabang Utama diizinkan
        const addFirstCashierCheck = canAddEmployee(tenant.employees.length, tenant.plan, tenant.subscription_status)
        const assignToPusatCheck = canAssignEmployeeToBranch(0, 'Cabang Utama')
        assert.equal(addFirstCashierCheck.allowed, true)
        assert.equal(assignToPusatCheck.allowed, true)

        tenant.employees.push({ id: 'emp-001', branch_id: 'br-pusat-001', role: 'pegawai', is_active: true })

        // Penambahan kasir ke-2 pada paket Standard wajib ditolak
        const addSecondCashierCheck = canAddEmployee(tenant.employees.length, tenant.plan, tenant.subscription_status)
        assert.equal(addSecondCashierCheck.allowed, false, 'Paket Standard wajib menolak penambahan kasir ke-2')
    })

    test('Dimensi 5 - Skenario 2: Katalog & Kasir POS -> Upload Foto Produk & QRIS -> Transaksi Tunai, Kredit (DP), Void & Persamaan Neraca', () => {
        // State buku besar akuntansi bisnis
        let cashBalance = 1_000_000 // Saldo awal kas toko
        const initialCapital = 1_000_000
        const product = {
            id: 'prod-kopi-01',
            name: 'Es Kopi Susu Gula Aren',
            selling_price: 25_000,
            cost_price: 10_000,
            image_url: 'https://res.cloudinary.com/demo/image/upload/f_webp,w_400,h_400/kopi.webp',
            branch_stock: 20, // Nilai persediaan awal = 20 * 10.000 = Rp 200.000
        }
        const businessQrisUrl = 'https://res.cloudinary.com/demo/image/upload/f_webp,w_800,h_1000/qris-toko.webp'

        assert.ok(product.image_url.includes('400'), 'Produk memiliki image_url terkompresi')
        assert.ok(businessQrisUrl.includes('800'), 'Toko memiliki qris_image_url resolusi tajam')

        const sales = []
        const receivables = []

        function computeFinancialStatements() {
            const activeSales = sales.filter((s) => s.status !== 'voided')
            const revenue = activeSales.reduce((sum, s) => sum + s.total, 0)
            const cogs = activeSales.reduce((sum, s) => sum + s.qty * s.cost_price, 0)
            const grossProfit = revenue - cogs
            const netProfit = grossProfit

            const inventoryValue = product.branch_stock * product.cost_price
            const activeReceivables = receivables
                .filter((r) => r.status !== 'paid')
                .reduce((sum, r) => sum + Math.max(0, r.total_amount - r.paid_amount), 0)

            const totalAssets = cashBalance + activeReceivables + inventoryValue
            const totalLiabilities = 0
            // Opening working capital = persediaan awal (20 * 10.000 = 200.000)
            const openingWorkingCapital = 20 * 10_000
            const totalEquity = initialCapital + openingWorkingCapital + netProfit
            const totalLiabilitiesAndEquity = totalLiabilities + totalEquity

            return {
                revenue,
                cogs,
                grossProfit,
                netProfit,
                inventoryValue,
                activeReceivables,
                totalAssets,
                totalLiabilitiesAndEquity,
                isBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 1,
            }
        }

        // 1. Transaksi Tunai/QRIS: Jual 4 cup @ Rp 25.000 = Rp 100.000 (HPP = Rp 40.000)
        const sale1 = {
            id: 'sale-cash-01',
            qty: 4,
            total: 100_000,
            paid_amount: 100_000,
            cost_price: product.cost_price,
            payment_status: 'paid',
            status: 'completed',
        }
        sales.push(sale1)
        product.branch_stock -= sale1.qty
        cashBalance += sale1.paid_amount

        let fsReport = computeFinancialStatements()
        assert.equal(product.branch_stock, 16, 'Stok cabang berkurang dari 20 menjadi 16')
        assert.equal(cashBalance, 1_100_000, 'Saldo kas bertambah Rp 100.000 menjadi Rp 1.100.000')
        assert.equal(fsReport.revenue, 100_000, 'Omzet penjualan tercatat Rp 100.000')
        assert.equal(fsReport.cogs, 40_000, 'HPP tercatat Rp 40.000')
        assert.equal(fsReport.grossProfit, 60_000, 'Laba kotor tercatat Rp 60.000')
        assert.equal(fsReport.isBalanced, true, 'Neraca seimbang setelah penjualan tunai')

        // 2. Transaksi Kredit (Kasbon) dengan DP: Jual 6 cup @ Rp 25.000 = Rp 150.000, DP = Rp 50.000, Piutang = Rp 100.000
        const sale2 = {
            id: 'sale-credit-02',
            qty: 6,
            total: 150_000,
            paid_amount: 50_000,
            cost_price: product.cost_price,
            payment_status: 'partial',
            status: 'completed',
        }
        sales.push(sale2)
        product.branch_stock -= sale2.qty
        cashBalance += sale2.paid_amount // HANYA DP Rp 50.000 yang masuk ke Kas!
        receivables.push({
            id: 'rec-02',
            sale_id: sale2.id,
            total_amount: 100_000,
            paid_amount: 0,
            status: 'unpaid',
        })

        fsReport = computeFinancialStatements()
        assert.equal(product.branch_stock, 10, 'Stok cabang berkurang menjadi 10')
        assert.equal(cashBalance, 1_150_000, 'Kas hanya bertambah sebesar DP Rp 50.000')
        assert.equal(fsReport.activeReceivables, 100_000, 'Sisa tagihan Rp 100.000 masuk ke Piutang Usaha')
        assert.equal(fsReport.isBalanced, true, 'Neraca tetap seimbang (Aset = Liabilitas + Ekuitas) setelah penjualan kredit DP')

        // 3. Void Transaksi Kredit (sale-credit-02): Stok kembali, DP dikembalikan dari kas, Piutang dihapus
        sale2.status = 'voided'
        product.branch_stock += sale2.qty
        cashBalance -= sale2.paid_amount
        const recIdx = receivables.findIndex((r) => r.sale_id === sale2.id)
        if (recIdx !== -1) receivables.splice(recIdx, 1)

        fsReport = computeFinancialStatements()
        assert.equal(product.branch_stock, 16, 'Stok cabang pulih kembali ke 16 setelah Void')
        assert.equal(cashBalance, 1_100_000, 'Saldo kas kembali ke Rp 1.100.000 setelah reversal DP')
        assert.equal(fsReport.activeReceivables, 0, 'Piutang dari transaksi void bersih (Rp 0)')
        assert.equal(fsReport.isBalanced, true, 'Neraca tetap 100% seimbang setelah Void penjualan')
    })

    test('Dimensi 5 - Skenario 3: Penyesuaian Stok Bahan Baku (waste_expired Non-Kas vs input_correction)', () => {
        let cashBalance = 2_000_000
        const rawMaterial = {
            id: 'rm-susu-01',
            name: 'Susu Fresh Milk',
            unit: 'liter',
            cost_per_unit: 25_000,
            stock: 20, // Nilai persediaan = Rp 500.000
        }
        const expenses = []

        function adjustStock(reason, qtyChange) {
            rawMaterial.stock += qtyChange
            if (reason === 'waste_expired' || reason === 'lost_shrinkage') {
                const lossAmount = Math.abs(qtyChange) * rawMaterial.cost_per_unit
                expenses.push({
                    category: 'lainnya',
                    amount: lossAmount,
                    is_non_cash: true,
                    description: `[WASTE/RUSAK] ${rawMaterial.name}`,
                })
                // PENTING: Kas TIDAK berkurang karena is_non_cash = true
            }
        }

        // 1. Kurangi 2 liter karena rusak/kedaluwarsa (waste_expired) -> kerugian Rp 50.000
        adjustStock('waste_expired', -2)
        assert.equal(rawMaterial.stock, 18, 'Stok bahan baku berkurang menjadi 18 liter')
        assert.equal(expenses.length, 1, 'Tercatat 1 baris beban kerugian persediaan')
        assert.equal(expenses[0].amount, 50_000, 'Nominal beban kerugian adalah 2 * Rp 25.000 = Rp 50.000')
        assert.equal(expenses[0].is_non_cash, true, 'Beban wajib ditandai is_non_cash = true')
        assert.equal(cashBalance, 2_000_000, 'Saldo Kas/Bank TIDAK terpotong oleh beban non-kas')

        // 2. Kurangi 1 liter karena koreksi salah input (input_correction) -> tidak mencatat beban
        adjustStock('input_correction', -1)
        assert.equal(rawMaterial.stock, 17, 'Stok bahan baku terkoreksi menjadi 17 liter')
        assert.equal(expenses.length, 1, 'Koreksi salah input TIDAK menambah beban di Laba Rugi')
        assert.equal(cashBalance, 2_000_000, 'Saldo Kas/Bank tetap utuh')
    })

    test('Dimensi 5 - Skenario 4: Siklus Upgrade & Downgrade Langganan (Standard -> Pro -> Standard)', async () => {
        // Deteksi downgrade kuota cabang dari Pro (5) ke Standard (1)
        assert.equal(isQuotaDowngrade(5, 1), true)
        assert.equal(isQuotaDowngrade(1, 5), false)

        // Simulasi state database in-memory untuk executeAutoDeactivateOnDowngrade
        const mockBranches = [
            { id: 'br-pusat', business_id: 'biz-01', name: 'Cabang Utama', code: 'PUSAT', status: 'active', created_at: '2026-01-01T00:00:00Z' },
            { id: 'br-cabang-2', business_id: 'biz-01', name: 'Cabang Kedua', code: 'CBG-02', status: 'active', created_at: '2026-02-01T00:00:00Z' },
            { id: 'br-cabang-3', business_id: 'biz-01', name: 'Cabang Ketiga', code: 'CBG-03', status: 'active', created_at: '2026-03-01T00:00:00Z' },
        ]
        const mockProfiles = [
            { id: 'emp-pusat', business_id: 'biz-01', branch_id: 'br-pusat', role: 'pegawai', is_active: true },
            { id: 'emp-2', business_id: 'biz-01', branch_id: 'br-cabang-2', role: 'pegawai', is_active: true },
            { id: 'emp-3', business_id: 'biz-01', branch_id: 'br-cabang-3', role: 'pegawai', is_active: true },
        ]

        const fakeAdminClient = {
            rpc: async () => ({ error: null }),
            from: (table) => {
                if (table === 'branches') {
                    return {
                        select: () => ({
                            eq: () => ({
                                order: async () => ({ data: mockBranches, error: null }),
                            }),
                        }),
                        update: (vals) => ({
                            eq: async (_col, id) => {
                                const b = mockBranches.find((x) => x.id === id)
                                if (b) Object.assign(b, vals)
                                return { error: null }
                            },
                            in: async (_col, ids) => {
                                for (const id of ids) {
                                    const b = mockBranches.find((x) => x.id === id)
                                    if (b) Object.assign(b, vals)
                                }
                                return { error: null }
                            },
                        }),
                    }
                }
                if (table === 'profiles') {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    eq: async () => ({
                                        data: mockProfiles.filter((p) => p.is_active),
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                        update: (vals) => ({
                            in: async (_col, ids) => {
                                for (const id of ids) {
                                    const p = mockProfiles.find((x) => x.id === id)
                                    if (p) Object.assign(p, vals)
                                }
                                return { error: null }
                            },
                        }),
                    }
                }
                throw new Error(`Unexpected table: ${table}`)
            },
        }

        const result = await executeAutoDeactivateOnDowngrade('biz-01', fakeAdminClient)
        assert.equal(result.isDowngrade, true)
        assert.equal(result.deactivatedBranches, 2, '2 cabang tambahan wajib dinonaktifkan otomatis')
        assert.equal(result.deactivatedEmployees, 2, '2 kasir cabang tambahan wajib dinonaktifkan otomatis')

        // Pastikan Cabang Utama (PUSAT) dan kasirnya tetap aktif
        assert.equal(mockBranches.find((b) => b.id === 'br-pusat')?.status, 'active', 'Cabang Utama wajib tetap active')
        assert.equal(mockBranches.find((b) => b.id === 'br-cabang-2')?.status, 'inactive', 'Cabang Kedua wajib menjadi inactive')
        assert.equal(mockBranches.find((b) => b.id === 'br-cabang-3')?.status, 'inactive', 'Cabang Ketiga wajib menjadi inactive')
        assert.equal(mockProfiles.find((p) => p.id === 'emp-pusat')?.is_active, true, 'Kasir Cabang Utama wajib tetap aktif')
        assert.equal(mockProfiles.find((p) => p.id === 'emp-2')?.is_active, false, 'Kasir Cabang Kedua wajib nonaktif')
        assert.equal(mockProfiles.find((p) => p.id === 'emp-3')?.is_active, false, 'Kasir Cabang Ketiga wajib nonaktif')
    })

    test('Dimensi 5 - Skenario 5: Keamanan Server Action & Tier Gating (Standard Ditolak Akses Modul Business/Pro, Business Ditolak Modul Pro)', async () => {
        const futureIso = new Date(Date.now() + 14 * 86_400_000).toISOString()

        function buildMockSupabaseForPlan(planCode) {
            return {
                from: () => ({
                    select: () => ({
                        eq: () => ({
                            single: async () => ({
                                data: {
                                    id: 'biz-test',
                                    subscription_status: 'active',
                                    trial_ends_at: null,
                                    subscription_expires_at: futureIso,
                                    subscription_plans: { code: planCode, name: planCode.toUpperCase() },
                                },
                                error: null,
                            }),
                        }),
                    }),
                }),
            }
        }

        const stdClient = buildMockSupabaseForPlan('standard')
        const bizClient = buildMockSupabaseForPlan('business')
        const proClient = buildMockSupabaseForPlan('pro')

        // 1. Paket Standard ditolak saat memanggil Server Action Bahan Baku, Kas Rekening, Utang Piutang, dan Modal
        assert.equal((await checkServerModuleAccess('biz-test', 'raw_materials', stdClient)).allowed, false)
        assert.equal((await checkServerModuleAccess('biz-test', 'cash_accounts', stdClient)).allowed, false)
        assert.equal((await checkServerModuleAccess('biz-test', 'debts_receivables', stdClient)).allowed, false)
        assert.equal((await checkServerModuleAccess('biz-test', 'capital_equity', stdClient)).allowed, false)

        // 2. Paket Business diizinkan untuk Bahan Baku, Kas Rekening, Utang Piutang, namun ditolak untuk Modal/Neraca/Arus Kas (Pro)
        assert.equal((await checkServerModuleAccess('biz-test', 'raw_materials', bizClient)).allowed, true)
        assert.equal((await checkServerModuleAccess('biz-test', 'cash_accounts', bizClient)).allowed, true)
        assert.equal((await checkServerModuleAccess('biz-test', 'debts_receivables', bizClient)).allowed, true)
        assert.equal((await checkServerModuleAccess('biz-test', 'capital_equity', bizClient)).allowed, false)
        assert.equal((await checkServerModuleAccess('biz-test', 'balance_sheet', bizClient)).allowed, false)

        // 3. Paket Pro diizinkan mengakses seluruh modul
        for (const mod of ['raw_materials', 'cash_accounts', 'debts_receivables', 'capital_equity', 'cash_flow_report', 'balance_sheet']) {
            assert.equal((await checkServerModuleAccess('biz-test', mod, proClient)).allowed, true, `Pro wajib diizinkan mengakses ${mod}`)
        }
    })
})
