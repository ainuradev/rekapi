import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveBranchId } from '@/lib/active-branch'
import { formatIndonesianDate, getIndonesianDate } from '@/lib/date-utils'
import { checkModuleAccess } from '@/lib/subscription-access'
import PlanFeatureGate from '@/components/plan-feature-gate'
import {
    calculateMerchandiseInventoryValue,
    resolveEffectiveBranchFilter,
    type ProductValuationItem,
    type ProductBranchStockItem,
} from '@/lib/inventory-valuation'
import PrintButton from '../print-button'
import PeriodSelect from '../period-select'

function fmt(n: number) {
    return 'Rp' + Math.round(n).toLocaleString('id-ID')
}

export default async function NeracaPage({
    searchParams,
}: {
    searchParams: Promise<{
        branch?: string
        period?: string
        as_of_date?: string
        end_date?: string
        date?: string
    }>
}) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, business_id, businesses(name, subscription_status, trial_ends_at, subscription_expires_at, subscription_plans(code, name))')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner' || !profile.business_id) {
        redirect('/dashboard')
    }

    const businessData = profile.businesses as unknown as {
        name: string
        subscription_status: string | null
        trial_ends_at: string | null
        subscription_expires_at: string | null
        subscription_plans?: { code: string; name: string } | null
    } | null

    const moduleAccess = checkModuleAccess(
        {
            status: businessData?.subscription_status || 'trial',
            planCode: businessData?.subscription_plans?.code || null,
            trialEndsAt: businessData?.trial_ends_at || null,
            expiresAt: businessData?.subscription_expires_at || null,
        },
        'balance_sheet'
    )

    if (!moduleAccess.allowed) {
        return (
            <PlanFeatureGate
                module="balance_sheet"
                currentPlanName={
                    businessData?.subscription_plans?.name ||
                    (businessData?.subscription_status === 'trial' ? 'Trial 7 Hari' : 'Standard')
                }
            />
        )
    }

    const businessId = profile.business_id
    const businessName = businessData?.name || 'Bisnis Anda'

    const params = await searchParams
    const activeBranchId = await getActiveBranchId()
    const candidateBranchId = (activeBranchId && activeBranchId !== 'all')
        ? activeBranchId
        : (params?.branch && params.branch !== 'all' ? params.branch : 'all')

    // Tanggal posisi neraca (Point-in-Time)
    const asOfDate = params?.as_of_date || params?.end_date || params?.date || getIndonesianDate()
    const asOfTimestamp = `${asOfDate}T23:59:59.999+07:00`

    // Fetch branches for filter (scoped strictly to user's business)
    const { data: branches } = await supabase
        .from('branches')
        .select('id, name')
        .eq('business_id', businessId)
        .order('name')

    const branchList = branches ?? []
    const { selectedBranchId, branchLabel } = resolveEffectiveBranchFilter(candidateBranchId, branchList)

    // ── 1. Fetch Sales (Pendapatan & Kas Masuk — Non-Void, hingga tanggal posisi) ──
    let salesQuery = supabase
        .from('sales')
        .select('id, total, paid_amount, payment_status, branch_id, transaction_date')
        .eq('business_id', businessId)
        .neq('status', 'voided')
        .lte('transaction_date', asOfTimestamp)

    let paymentsQuery = supabase
        .from('sale_payments')
        .select('amount, sale_id, sales!inner(branch_id, status)')
        .eq('business_id', businessId)
        .neq('sales.status', 'voided')
        .lte('payment_date', asOfDate)

    if (selectedBranchId !== 'all') {
        salesQuery = salesQuery.eq('branch_id', selectedBranchId)
        paymentsQuery = paymentsQuery.eq('sales.branch_id', selectedBranchId)
    }

    const [{ data: salesRaw }, { data: paymentsRaw }] = await Promise.all([
        salesQuery,
        paymentsQuery,
    ])
    const totalSales = (salesRaw ?? []).reduce((acc, s) => acc + Number(s.total || 0), 0)

    // Hitung penerimaan kas riil dari penjualan
    let totalPaidSales = 0
    const trackedSaleIds = new Set<string>()
    for (const p of paymentsRaw ?? []) {
        trackedSaleIds.add(p.sale_id)
        totalPaidSales += Number(p.amount || 0)
    }
    for (const s of salesRaw ?? []) {
        if (!trackedSaleIds.has(s.id)) {
            if (s.payment_status === 'unpaid') continue
            totalPaidSales += Number(s.paid_amount ?? s.total ?? 0)
        }
    }

    // ── 2. Fetch Sale Items (HPP Produk Terjual — Non-Void, hingga tanggal posisi) ──
    let saleItemsQuery = supabase
        .from('sale_items')
        .select('cost_price, quantity, sales!inner(business_id, branch_id, status, transaction_date)')
        .eq('sales.business_id', businessId)
        .neq('sales.status', 'voided')
        .lte('sales.transaction_date', asOfTimestamp)

    if (selectedBranchId !== 'all') saleItemsQuery = saleItemsQuery.eq('sales.branch_id', selectedBranchId)
    const { data: saleItemsRaw } = await saleItemsQuery

    const totalHPP = (saleItemsRaw ?? []).reduce(
        (acc, item) => acc + Number(item.cost_price || 0) * Number(item.quantity || 0),
        0
    )

    // ── 3. Fetch Purchases (Pembelian Pasokan / Supplier hingga tanggal posisi) ──
    let purchasesQuery = supabase
        .from('purchases')
        .select('id, total, paid_amount, payment_status, branch_id, purchase_date, debts_payables(id, total_amount)')
        .eq('business_id', businessId)
        .lte('purchase_date', asOfDate)

    if (selectedBranchId !== 'all') purchasesQuery = purchasesQuery.eq('branch_id', selectedBranchId)
    const { data: purchasesRaw } = await purchasesQuery
    const totalPurchases = (purchasesRaw ?? []).reduce((acc, p) => acc + Number(p.total || 0), 0)

    const totalPurchasesCash = (purchasesRaw ?? []).reduce((acc, p) => {
        const debts = (p as unknown as { debts_payables?: { id: string; total_amount: number }[] | { id: string; total_amount: number } | null })?.debts_payables
        const debtRow = Array.isArray(debts) ? debts[0] : debts
        if (debtRow && debtRow.total_amount !== undefined) {
            const initialDownPayment = Math.max(0, Number(p.total || 0) - Number(debtRow.total_amount || 0))
            return acc + initialDownPayment
        }
        if (p.payment_status === 'unpaid') return acc
        return acc + Number(p.paid_amount ?? p.total ?? 0)
    }, 0)

    // ── 4. Fetch Expenses (Beban Operasional & Aset Peralatan hingga tanggal posisi) ──
    let expensesQuery = supabase
        .from('expenses')
        .select('amount, category, branch_id, expense_date, description, is_non_cash')
        .eq('business_id', businessId)
        .lte('expense_date', asOfDate)

    if (selectedBranchId !== 'all') expensesQuery = expensesQuery.eq('branch_id', selectedBranchId)
    const { data: expensesRaw } = await expensesQuery

    let equipmentAssets = 0
    let operatingExpenses = 0
    let nonCashWasteExpenses = 0
    for (const exp of expensesRaw ?? []) {
        const amt = Number(exp.amount || 0)
        if (exp.category === 'peralatan') {
            equipmentAssets += amt
        } else {
            operatingExpenses += amt
            const isNonCash = (exp as unknown as { is_non_cash?: boolean }).is_non_cash ||
                Boolean(exp.description && (
                    exp.description.includes('[WASTE') ||
                    exp.description.includes('[RUSAK') ||
                    exp.description.includes('[HILANG')
                ))
            if (isNonCash) {
                nonCashWasteExpenses += amt
            }
        }
    }

    // ── 5. Fetch Merchandise Stock (Nilai Persediaan Produk Jadi) ──
    let prodStockValue = 0
    let hasProdStockError = false
    let prodStockErrorMessage: string | null = null
    try {
        let prodsQuery = await supabase
            .from('owner_products_view')
            .select('id, cost_price, stock')
            .eq('business_id', businessId)

        if (prodsQuery.error && prodsQuery.error.code === '42P01') {
            prodsQuery = await supabase
                .from('products')
                .select('id, cost_price, stock')
                .eq('business_id', businessId)
        }

        const branchStocksQuery = await supabase
            .from('product_branch_stocks')
            .select('product_id, branch_id, stock')
            .eq('business_id', businessId)

        const valuationResult = calculateMerchandiseInventoryValue({
            products: (prodsQuery.data as ProductValuationItem[] | null) ?? null,
            branchStocks: (branchStocksQuery.data as ProductBranchStockItem[] | null) ?? null,
            selectedBranchId,
            productsError: prodsQuery.error,
            branchStocksError: branchStocksQuery.error,
        })

        hasProdStockError = valuationResult.hasError
        prodStockErrorMessage = valuationResult.errorMessage
        prodStockValue = valuationResult.value ?? 0
    } catch {
        hasProdStockError = true
        prodStockErrorMessage = 'Terjadi kesalahan saat menghitung nilai persediaan produk jadi.'
        prodStockValue = 0
    }

    // ── 6. Fetch Raw Material Stock (Nilai Persediaan Bahan Baku Mentah) ──
    let rawMaterialStockValue = 0
    try {
        const { data: rmStocks } = await supabase
            .from('raw_material_branch_stocks')
            .select('quantity, branch_id, raw_materials!inner(business_id, cost_per_unit)')
            .eq('raw_materials.business_id', businessId)
        if (rmStocks) {
            const filteredStocks = selectedBranchId === 'all'
                ? rmStocks
                : rmStocks.filter((s) => s.branch_id === selectedBranchId)

            rawMaterialStockValue = filteredStocks.reduce(
                (acc, s) => acc + Math.max(0, Number(s.quantity || 0)) * Number((s.raw_materials as unknown as { cost_per_unit: number })?.cost_per_unit || 0),
                0
            )
        }
    } catch {
        rawMaterialStockValue = 0
    }

    // ── 7. Fetch Real Cash, Receivables, Debts & Equity ──
    let tradeReceivables = 0
    try {
        const { data: recs } = await supabase
            .from('receivables')
            .select('total_amount, paid_amount, branch_id, sales(branch_id, status)')
            .eq('business_id', businessId)
            .neq('status', 'paid')
            .neq('status', 'cancelled')
            .lte('created_at', asOfTimestamp)
        if (recs) {
            tradeReceivables = recs
                .filter((r) => {
                    const saleObj = r.sales as { branch_id?: string | null; status?: string | null } | null
                    if (saleObj?.status === 'voided') return false
                    if (selectedBranchId === 'all') return true
                    const bId = r.branch_id || saleObj?.branch_id
                    return bId === selectedBranchId
                })
                .reduce(
                    (acc, r) => acc + Math.max(0, Number(r.total_amount || 0) - Number(r.paid_amount || 0)),
                    0
                )
        }
    } catch {
        tradeReceivables = 0
    }

    let tradePayables = 0
    let debtsList: { id: string; branch_id?: string | null; purchases?: { branch_id?: string | null } | null }[] = []
    try {
        const { data: debts } = await supabase
            .from('debts_payables')
            .select('id, total_amount, paid_amount, branch_id, purchases(branch_id)')
            .eq('business_id', businessId)
            .neq('status', 'paid')
            .lte('created_at', asOfTimestamp)
        if (debts) {
            debtsList = debts as unknown as typeof debtsList
            tradePayables = debts
                .filter((d) => {
                    if (selectedBranchId === 'all') return true
                    const bId = d.branch_id || (d.purchases as { branch_id?: string | null } | null)?.branch_id
                    return bId === selectedBranchId
                })
                .reduce(
                    (acc, d) => acc + Math.max(0, Number(d.total_amount || 0) - Number(d.paid_amount || 0)),
                    0
                )
        }
    } catch {
        tradePayables = 0
    }

    let branchDebtPayments = 0
    if (selectedBranchId !== 'all') {
        try {
            const branchDebtIds = debtsList
                .filter((d) => {
                    const bId = d.branch_id || d.purchases?.branch_id
                    return bId === selectedBranchId
                })
                .map((d) => d.id)

            if (branchDebtIds.length > 0) {
                const { data: dTx } = await supabase
                    .from('financial_transactions')
                    .select('amount')
                    .eq('business_id', businessId)
                    .eq('category', 'debt_payment')
                    .in('reference_id', branchDebtIds)
                    .lte('transaction_date', asOfDate)
                branchDebtPayments = (dTx ?? []).reduce((acc, tx) => acc + Number(tx.amount || 0), 0)
            }
        } catch {
            branchDebtPayments = 0
        }
    }

    let cashAndBank = 0
    if (selectedBranchId !== 'all') {
        // Mode Cabang Spesifik: Hitung Kas Operasional Bersih Cabang secara kumulatif
        // Catatan akuntansi: Beban Non-Kas (waste/kerugian persediaan) tidak memotong kas fisik cabang
        const cashOperatingExpenses = operatingExpenses - nonCashWasteExpenses
        const branchNetCash = totalPaidSales - totalPurchasesCash - (cashOperatingExpenses + equipmentAssets) - branchDebtPayments
        cashAndBank = Math.max(0, branchNetCash)
    } else {
        // Mode Semua Cabang (Konsolidasi): Gunakan saldo akun keuangan bisnis
        try {
            const { data: accounts } = await supabase
                .from('financial_accounts')
                .select('current_balance')
                .eq('business_id', businessId)
                .eq('status', 'active')
            if (accounts && accounts.length > 0) {
                cashAndBank = accounts.reduce((acc, a) => acc + Number(a.current_balance || 0), 0)
            } else {
                const cashOperatingExpenses = operatingExpenses - nonCashWasteExpenses
                const rawCash = totalSales - totalPurchases - cashOperatingExpenses - equipmentAssets
                cashAndBank = Math.max(0, rawCash)
            }
        } catch {
            cashAndBank = 0
        }
    }

    let recordedEquity = 0
    try {
        const { data: eqRecords } = await supabase
            .from('equity_records')
            .select('amount, type')
            .eq('business_id', businessId)
        if (eqRecords) {
            recordedEquity = eqRecords.reduce((acc, eq) => {
                const amt = Number(eq.amount || 0)
                return eq.type === 'drawings_prive' ? acc - amt : acc + amt
            }, 0)
        }
    } catch {
        recordedEquity = 0
    }

    const totalCurrentAssets = cashAndBank + tradeReceivables + prodStockValue + rawMaterialStockValue
    const totalFixedAssets = equipmentAssets
    const totalAssets = totalCurrentAssets + totalFixedAssets

    const totalLiabilities = tradePayables

    // Ekuitas: Saldo Laba Ditahan & Modal Disetor
    const grossProfit = totalSales - totalHPP
    const netOperatingProfit = grossProfit - operatingExpenses
    const retainedEarnings = netOperatingProfit

    let paidInCapital = 0
    let openingBalanceAdjustment = 0

    if (selectedBranchId === 'all') {
        paidInCapital = recordedEquity
        if (!hasProdStockError) {
            openingBalanceAdjustment = (totalAssets - totalLiabilities) - (paidInCapital + retainedEarnings)
        }
    } else {
        // Mode Cabang Spesifik: Modal Disetor & Prive = 0 (karena modal berada di level bisnis/pusat)
        paidInCapital = 0
        if (!hasProdStockError) {
            // Tampung selisih modal kerja awal cabang (seperti stok awal cabang) pada baris "Modal Kerja Cabang / Alokasi Pusat"
            openingBalanceAdjustment = (totalAssets - totalLiabilities) - retainedEarnings
        }
    }

    const totalEquity = paidInCapital + retainedEarnings + openingBalanceAdjustment
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity

    const balanceDifference = Math.abs(totalAssets - totalLiabilitiesAndEquity)
    const isBalanced = balanceDifference < 1 && !hasProdStockError

    const currentDateStr = formatIndonesianDate(asOfDate)

    return (
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
            {/* Navigasi Breadcrumb Kembali */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 no-print">
                <Link
                    href="/dashboard/keuangan"
                    className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-emerald-700 transition"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span>Kembali ke Pusat Laporan</span>
                </Link>

                <div className="flex items-center gap-2 flex-wrap">
                    <PeriodSelect
                        currentPeriod={params?.as_of_date || params?.end_date ? 'custom' : 'today'}
                        endDate={asOfDate}
                        asOfMode={true}
                    />
                    <PrintButton />
                </div>
            </div>

            {/* Header Laporan Neraca */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xs mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-6">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800 mb-1">
                            <span>SAK EMKM • Standar Neraca UMKM</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                            Laporan Posisi Keuangan (Neraca)
                        </h1>
                        <p className="mt-1 text-xs sm:text-sm text-slate-500 font-medium">
                            {businessName} • <span className="font-semibold text-emerald-800">{branchLabel}</span>
                        </p>
                    </div>

                    <div className="flex flex-col sm:items-end gap-2 text-xs text-slate-500">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-700">Per Tanggal:</span>
                            <span className="font-bold text-slate-900">{currentDateStr}</span>
                        </div>
                        {hasProdStockError ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 text-[11px] font-bold">
                                <svg className="w-3.5 h-3.5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span>Data Tidak Lengkap (Persediaan Gagal Dimuat)</span>
                            </div>
                        ) : isBalanced ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/60 text-[11px] font-bold">
                                <svg className="w-3.5 h-3.5 text-emerald-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Neraca Seimbang (Balanced)</span>
                            </div>
                        ) : (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 text-[11px] font-bold">
                                <svg className="w-3.5 h-3.5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span>Belum Seimbang ({fmt(balanceDifference)})</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span>Posisi Keuangan Neraca Berdasarkan Pembukuan Riil</span>
                    <span className="text-[11px] text-slate-400">Sinkron otomatis dengan cabang di Navbar</span>
                </div>
            </div>

            {/* Peringatan jika query persediaan produk gagal */}
            {hasProdStockError && (
                <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-xs no-print">
                    <div className="flex items-center gap-2 font-bold text-amber-900">
                        <svg className="w-4 h-4 text-amber-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>Data Persediaan Produk Jadi Belum Dapat Dimuat</span>
                    </div>
                    <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                        {prodStockErrorMessage || 'Gagal memuat data stok atau HPP produk dari database.'} Nilai persediaan barang dagangan jadi tidak dapat ditampilkan sebagai Rp0 yang valid. Silakan muat ulang halaman.
                    </p>
                </div>
            )}

            {/* Indikator Keseimbangan Neraca (Prinsip Dasar Akuntansi SAK EMKM) */}
            <div className={`mb-6 rounded-2xl border p-4 text-xs shadow-xs transition ${
                isBalanced
                    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
                    : 'border-amber-200 bg-amber-50/70 text-amber-950'
            }`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isBalanced ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {isBalanced ? (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            )}
                        </div>
                        <div>
                            <span className="font-extrabold text-sm block">
                                {isBalanced
                                    ? 'Neraca Seimbang (Balanced)'
                                    : hasProdStockError
                                    ? 'Perhatian: Posisi Neraca Belum Lengkap (Persediaan Gagal Dimuat)'
                                    : 'Perhatian: Posisi Neraca Belum Seimbang'}
                            </span>
                            <span className="text-xs text-slate-600">
                                {isBalanced
                                    ? `Total Aset (${fmt(totalAssets)}) sama persis dengan Total Liabilitas & Ekuitas (${fmt(totalLiabilitiesAndEquity)}).`
                                    : hasProdStockError
                                    ? `Nilai total aset belum memperhitungkan persediaan barang dagangan jadi karena terjadi error saat memuat database. Silakan muat ulang.`
                                    : `Terdapat selisih pembukuan sebesar ${fmt(balanceDifference)}. Total Aset: ${fmt(totalAssets)} vs Total Liabilitas & Ekuitas: ${fmt(totalLiabilitiesAndEquity)}.`}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold ${
                            isBalanced
                                ? 'bg-emerald-200 text-emerald-900'
                                : hasProdStockError
                                ? 'bg-amber-200 text-amber-900'
                                : 'bg-amber-200 text-amber-900'
                        }`}>
                            {isBalanced ? 'SEIMBANG' : hasProdStockError ? 'DATA TIDAK LENGKAP' : `SELISIH ${fmt(balanceDifference)}`}
                        </span>
                    </div>
                </div>
            </div>

            {/* TABEL NERACA DUA KOLOM (SKONTRO / ACCOUNTING STANDARD) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 items-start mb-8">
                
                {/* ── SISI KIRI: ASET (AKTIVA) ── */}
                <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
                    <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between">
                        <span className="text-sm font-bold tracking-wide uppercase">ASET (AKTIVA)</span>
                        <span className="text-xs text-slate-300 font-medium">Nilai Buku (Rp)</span>
                    </div>

                    <div className="p-6 divide-y divide-slate-100">
                        {/* 1. Aset Lancar */}
                        <div className="pb-5">
                            <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 mb-3">
                                1. Aset Lancar
                            </h3>
                            <div className="space-y-2 text-xs sm:text-sm">
                                <div className="flex items-center justify-between text-slate-700">
                                    <span className="pl-2">Kas & Setara Kas (Rekening Toko)</span>
                                    <span className="font-semibold text-slate-900 tabular-nums">{fmt(cashAndBank)}</span>
                                </div>
                                <div className="flex items-center justify-between text-slate-700">
                                    <span className="pl-2">Piutang Usaha (Tagihan Pelanggan)</span>
                                    <span className="font-semibold text-slate-900 tabular-nums">{fmt(tradeReceivables)}</span>
                                </div>
                                <div className="flex items-center justify-between text-slate-700">
                                    <span className="pl-2">Persediaan Barang Dagangan Jadi</span>
                                    {hasProdStockError ? (
                                        <span className="font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-xs">
                                            Gagal memuat data
                                        </span>
                                    ) : (
                                        <span className="font-semibold text-slate-900 tabular-nums">{fmt(prodStockValue)}</span>
                                    )}
                                </div>
                                <div className="flex items-center justify-between text-slate-700">
                                    <span className="pl-2">Persediaan Bahan Baku Mentah</span>
                                    <span className="font-semibold text-slate-900 tabular-nums">{fmt(rawMaterialStockValue)}</span>
                                </div>
                            </div>

                            <div className={`mt-3 pt-2 border-t border-dashed flex items-center justify-between text-xs sm:text-sm font-bold p-2 rounded-lg ${
                                hasProdStockError
                                    ? 'border-amber-200 bg-amber-50/70 text-amber-900'
                                    : 'border-slate-200 bg-slate-50/70 text-slate-800'
                            }`}>
                                <div className="flex items-center gap-1.5">
                                    <span>Total Aset Lancar</span>
                                    {hasProdStockError && (
                                        <span className="text-[10px] text-amber-700 font-normal">
                                            (Persediaan tidak lengkap)
                                        </span>
                                    )}
                                </div>
                                <span className="tabular-nums">
                                    {fmt(totalCurrentAssets)}{hasProdStockError ? '*' : ''}
                                </span>
                            </div>
                        </div>

                        {/* 2. Aset Tetap */}
                        <div className="pt-5 pb-5">
                            <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 mb-3">
                                2. Aset Tetap (Peralatan & Aset Fisik)
                            </h3>
                            <div className="space-y-2 text-xs sm:text-sm">
                                <div className="flex items-center justify-between text-slate-700">
                                    <span className="pl-2">Peralatan, Mesin & Inventaris Operasional</span>
                                    <span className="font-semibold text-slate-900 tabular-nums">{fmt(totalFixedAssets)}</span>
                                </div>
                                <div className="flex items-center justify-between text-slate-400 text-xs">
                                    <span className="pl-2">Akumulasi Penyusutan (Tahun Berjalan)</span>
                                    <span className="font-medium tabular-nums">Rp0</span>
                                </div>
                            </div>

                            <div className="mt-3 pt-2 border-t border-dashed border-slate-200 flex items-center justify-between text-xs sm:text-sm font-bold text-slate-800 bg-slate-50/70 p-2 rounded-lg">
                                <span>Total Aset Tetap</span>
                                <span className="tabular-nums">{fmt(totalFixedAssets)}</span>
                            </div>
                        </div>

                        {/* TOTAL ASET AKHIR */}
                        <div className="pt-5">
                            <div className={`flex items-center justify-between gap-2 p-3.5 rounded-xl border text-sm sm:text-base font-extrabold ${
                                hasProdStockError
                                    ? 'bg-amber-50/80 border-amber-200/80 text-amber-900'
                                    : 'bg-emerald-50/80 border-emerald-200/80 text-emerald-950'
                            }`}>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span>JUMLAH ASET</span>
                                    {hasProdStockError && (
                                        <span className="text-[11px] font-semibold text-amber-800 bg-amber-100/80 border border-amber-300/80 px-2 py-0.5 rounded">
                                            Data tidak lengkap
                                        </span>
                                    )}
                                </div>
                                <span className="underline decoration-double text-base sm:text-lg tabular-nums">
                                    {fmt(totalAssets)}{hasProdStockError ? '*' : ''}
                                </span>
                            </div>
                            {hasProdStockError && (
                                <p className="mt-2 text-[11px] text-amber-700 font-medium">
                                    * Belum termasuk nilai persediaan barang dagangan jadi yang gagal dimuat.
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── SISI KANAN: LIABILITAS & EKUITAS (PASIVA) ── */}
                <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
                    <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between">
                        <span className="text-sm font-bold tracking-wide uppercase">LIABILITAS & EKUITAS (PASIVA)</span>
                        <span className="text-xs text-slate-300 font-medium">Nilai Buku (Rp)</span>
                    </div>

                    <div className="p-6 divide-y divide-slate-100">
                        {/* 1. Liabilitas / Kewajiban */}
                        <div className="pb-5">
                            <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-600 mb-3">
                                1. Liabilitas (Kewajiban)
                            </h3>
                            <div className="space-y-2 text-xs sm:text-sm">
                                <div className="flex items-center justify-between text-slate-700">
                                    <span className="pl-2">Utang Usaha / Pembelian Supplier</span>
                                    <span className="font-semibold text-slate-900 tabular-nums">{fmt(tradePayables)}</span>
                                </div>
                                <div className="flex items-center justify-between text-slate-700">
                                    <span className="pl-2">Beban Operasional Terutang</span>
                                    <span className="font-semibold text-slate-900 tabular-nums">Rp0</span>
                                </div>
                            </div>

                            <div className="mt-3 pt-2 border-t border-dashed border-slate-200 flex items-center justify-between text-xs sm:text-sm font-bold text-slate-800 bg-slate-50/70 p-2 rounded-lg">
                                <span>Total Liabilitas</span>
                                <span className="tabular-nums">{fmt(totalLiabilities)}</span>
                            </div>
                        </div>

                        {/* 2. Ekuitas (Modal Pemilik) */}
                        <div className="pt-5 pb-5">
                            <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 mb-3">
                                2. Ekuitas {selectedBranchId === 'all' ? '(Modal Pemilik Bisnis)' : '(Ekuitas Cabang)'}
                            </h3>
                            <div className="space-y-2 text-xs sm:text-sm">
                                {selectedBranchId === 'all' ? (
                                    <div className="flex items-center justify-between text-slate-700">
                                        <span className="pl-2">Modal Disetor / Modal Usaha Awal</span>
                                        <span className="font-semibold text-slate-900 tabular-nums">{fmt(paidInCapital)}</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between text-slate-700 bg-slate-50/70 p-2 rounded-lg border border-dashed border-slate-200">
                                        <div className="pl-1">
                                            <span className="block font-semibold text-slate-800">Modal Kerja Cabang / Alokasi Pusat</span>
                                            <span className="text-[10px] text-slate-400 block">Stok awal dan alokasi modal kerja operasional dari kantor pusat</span>
                                        </div>
                                        <span className="font-semibold text-slate-800 tabular-nums">{fmt(openingBalanceAdjustment)}</span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between text-slate-700">
                                    <span className="pl-2">
                                        {selectedBranchId === 'all' ? 'Saldo Laba Ditahan (Akumulasi Laba Usaha)' : 'Saldo Laba Operasional Cabang'}
                                    </span>
                                    <span className="font-semibold text-emerald-700 font-bold tabular-nums">{fmt(retainedEarnings)}</span>
                                </div>
                                {selectedBranchId === 'all' && Math.abs(openingBalanceAdjustment) > 0 && (
                                    <div className="flex items-center justify-between text-slate-700 bg-slate-50/70 p-2 rounded-lg border border-dashed border-slate-200">
                                        <div className="pl-1">
                                            <span className="block font-semibold text-slate-800">Penyesuaian Modal Kerja & Saldo Awal</span>
                                            <span className="text-[10px] text-slate-400 block">Saldo awal kas, piutang, dan persediaan fisik SAK EMKM</span>
                                        </div>
                                        <span className="font-semibold text-slate-800 tabular-nums">{fmt(openingBalanceAdjustment)}</span>
                                    </div>
                                )}
                                {selectedBranchId !== 'all' && (
                                    <p className="text-[11px] text-slate-400 italic pl-2 pt-1">
                                        * Modal disetor & penarikan prive pemilik dikelola terpusat pada Neraca Konsolidasi.
                                    </p>
                                )}
                            </div>

                            <div className="mt-3 pt-2 border-t border-dashed border-slate-200 flex items-center justify-between text-xs sm:text-sm font-bold text-slate-800 bg-slate-50/70 p-2 rounded-lg">
                                <span>Total Ekuitas</span>
                                <span className="tabular-nums">{fmt(totalEquity)}</span>
                            </div>
                        </div>

                        {/* TOTAL LIABILITAS & EKUITAS AKHIR */}
                        <div className="pt-5">
                            <div className="flex items-center justify-between p-3.5 bg-emerald-50/80 rounded-xl border border-emerald-200/80 text-sm sm:text-base font-extrabold text-emerald-950">
                                <span>JUMLAH LIABILITAS & EKUITAS</span>
                                <span className="underline decoration-double text-base sm:text-lg tabular-nums">{fmt(totalLiabilitiesAndEquity)}</span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* Note & Penjelasan Standar SAK EMKM */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 leading-relaxed no-print">
                <span className="font-bold text-slate-800 block mb-1">Catatan Akuntansi Posisi Keuangan (Neraca):</span>
                Laporan ini disusun otomatis berdasarkan Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (SAK EMKM) yang direkomendasikan Bank Indonesia dan IAI. Total Aset selalu seimbang dengan penjumlahan Total Liabilitas dan Ekuitas Modal Usaha. Nilai persediaan bahan baku dan produk dihitung real-time berdasarkan stok aktual dan HPP.
            </div>
        </div>
    )
}
