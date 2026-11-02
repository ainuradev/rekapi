import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveBranchId } from '@/lib/active-branch'
import { getIndonesianPeriodRange, formatIndonesianDate, parseCustomOrPeriodRange } from '@/lib/date-utils'
import { resolveEffectiveBranchFilter } from '@/lib/inventory-valuation'
import { checkModuleAccess } from '@/lib/subscription-access'
import PlanFeatureGate from '@/components/plan-feature-gate'
import PeriodSelect from '../period-select'

function fmt(n: number) {
    return 'Rp' + Math.round(n).toLocaleString('id-ID')
}

export default async function ArusKasPage({
    searchParams,
}: {
    searchParams: Promise<{
        period?: string
        branch?: string
        start_date?: string
        end_date?: string
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
        'cash_flow_report'
    )

    if (!moduleAccess.allowed) {
        return (
            <PlanFeatureGate
                module="cash_flow_report"
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
    const { dateFrom, dateTo, timestampFrom, timestampTo, period, isCustom, label: periodLabel } = parseCustomOrPeriodRange(
        params.period,
        params.start_date,
        params.end_date,
        'month'
    )

    const activeBranchId = await getActiveBranchId()
    const candidateBranchId = (activeBranchId && activeBranchId !== 'all')
        ? activeBranchId
        : (params.branch && params.branch !== 'all' ? params.branch : 'all')

    // Branches filter (scoped strictly to user's business)
    const { data: branches } = await supabase
        .from('branches')
        .select('id, name')
        .eq('business_id', businessId)
        .order('name')

    const branchList = branches ?? []
    const { selectedBranchId, branchLabel } = resolveEffectiveBranchFilter(candidateBranchId, branchList)

    // Fetch queries: Arus kas masuk hanya dari pembayaran kas/digital aktual (bukan total penjualan kredit fiktif)
    let paymentsQuery = supabase
        .from('sale_payments')
        .select('sale_id, amount, payment_method, payment_date, sales!inner(status, branch_id)')
        .eq('business_id', businessId)
        .neq('sales.status', 'voided')
        .gte('payment_date', timestampFrom)
        .lte('payment_date', timestampTo)

    let legacySalesQuery = supabase
        .from('sales')
        .select('id, total, paid_amount, payment_status, payment_method, transaction_date, status')
        .eq('business_id', businessId)
        .neq('status', 'voided')
        .gte('transaction_date', timestampFrom)
        .lte('transaction_date', timestampTo)

    let purchasesQuery = supabase
        .from('purchases')
        .select('id, total, paid_amount, payment_status, purchase_date, debts_payables(id, total_amount)')
        .eq('business_id', businessId)
        .gte('purchase_date', dateFrom)
        .lte('purchase_date', dateTo)

    let expensesQuery = supabase
        .from('expenses')
        .select('amount, expense_date')
        .eq('business_id', businessId)
        .gte('expense_date', dateFrom)
        .lte('expense_date', dateTo)

    const financingTxQuery = supabase
        .from('financial_transactions')
        .select('category, amount, type, reference_id, transaction_date')
        .eq('business_id', businessId)
        .gte('transaction_date', dateFrom)
        .lte('transaction_date', dateTo)
        .in('category', ['equity_deposit', 'equity_withdraw', 'debt_payment'])

    if (selectedBranchId !== 'all') {
        paymentsQuery = paymentsQuery.eq('sales.branch_id', selectedBranchId)
        legacySalesQuery = legacySalesQuery.eq('branch_id', selectedBranchId)
        purchasesQuery = purchasesQuery.eq('branch_id', selectedBranchId)
        expensesQuery = expensesQuery.eq('branch_id', selectedBranchId)
    }

    // Ambil daftar ID utang milik cabang aktif untuk mengisolasi pembayaran utang (debt_payment)
    const branchDebtsQuery = selectedBranchId !== 'all'
        ? supabase
            .from('debts_payables')
            .select('id, branch_id, purchases(branch_id)')
            .eq('business_id', businessId)
        : null

    const [
        { data: paymentsRaw },
        { data: salesRaw },
        { data: purchasesRaw },
        { data: expensesRaw },
        { data: financingTxRaw },
        branchDebtsRes,
    ] = await Promise.all([
        paymentsQuery,
        legacySalesQuery,
        purchasesQuery,
        expensesQuery,
        financingTxQuery,
        branchDebtsQuery,
    ])

    const branchDebtIds = new Set<string>()
    if (selectedBranchId !== 'all' && branchDebtsRes?.data) {
        for (const d of branchDebtsRes.data) {
            const bId = d.branch_id || (d.purchases as { branch_id?: string | null } | null)?.branch_id
            if (bId === selectedBranchId) {
                branchDebtIds.add(d.id)
            }
        }
    }

    let cashSales = 0
    let digitalSales = 0

    // Set of sale IDs that have explicit payment entries in sale_payments
    const trackedSaleIds = new Set<string>()

    for (const p of paymentsRaw ?? []) {
        trackedSaleIds.add(p.sale_id)
        const amt = Number(p.amount || 0)
        const pm = (p.payment_method || '').toLowerCase()
        if (pm === 'cash' || pm === 'tunai') {
            cashSales += amt
        } else {
            digitalSales += amt
        }
    }

    // Kompatibilitas data lama: Untuk transaksi yang belum tercatat di sale_payments
    for (const s of salesRaw ?? []) {
        if (!trackedSaleIds.has(s.id)) {
            // Jika kredit unpaid (belum ada DP), uang masuk = 0 (mencegah penerimaan kas fiktif)
            if (s.payment_status === 'unpaid') continue

            const amt = Number(s.paid_amount ?? s.total ?? 0)
            if (amt <= 0) continue

            const pm = (s.payment_method || '').toLowerCase()
            if (pm === 'cash' || pm === 'tunai') {
                cashSales += amt
            } else {
                digitalSales += amt
            }
        }
    }

    let equityDeposits = 0
    let equityWithdraws = 0
    let debtPayments = 0

    if (selectedBranchId === 'all') {
        for (const tx of financingTxRaw ?? []) {
            const amt = Number(tx.amount || 0)
            if (tx.category === 'equity_deposit') {
                equityDeposits += amt
            } else if (tx.category === 'equity_withdraw') {
                equityWithdraws += amt
            } else if (tx.category === 'debt_payment') {
                debtPayments += amt
            }
        }
    } else {
        // Mode Cabang Spesifik: Modal dan Prive = 0 (dikelola terpusat di level bisnis)
        equityDeposits = 0
        equityWithdraws = 0
        for (const tx of financingTxRaw ?? []) {
            const amt = Number(tx.amount || 0)
            if (tx.category === 'debt_payment') {
                // Hanya hitung pembayaran utang yang terkait dengan utang cabang ini
                if (tx.reference_id && branchDebtIds.has(tx.reference_id)) {
                    debtPayments += amt
                }
            }
        }
    }

    const totalCashIn = cashSales + digitalSales + equityDeposits
    const totalPurchases = (purchasesRaw ?? []).reduce((acc, p) => {
        // Hilangkan double counting: jika pembelian mencatat utang, kas keluar saat pembelian
        // HANYA uang muka (DP awal). Pembayaran cicilan/pelunasan berikutnya dicatat via debt_payment.
        const debts = (p as unknown as { debts_payables?: { id: string; total_amount: number }[] | { id: string; total_amount: number } | null })?.debts_payables
        const debtRow = Array.isArray(debts) ? debts[0] : debts
        if (debtRow && debtRow.total_amount !== undefined) {
            const initialDownPayment = Math.max(0, Number(p.total || 0) - Number(debtRow.total_amount || 0))
            return acc + initialDownPayment
        }
        if (p.payment_status === 'unpaid') {
            return acc
        }
        return acc + Number(p.paid_amount ?? p.total ?? 0)
    }, 0)
    const totalExpenses = (expensesRaw ?? []).reduce((acc, e) => acc + Number(e.amount || 0), 0)
    const totalCashOut = totalPurchases + totalExpenses + debtPayments + equityWithdraws
    const netCashFlow = totalCashIn - totalCashOut


    const PERIOD_LABELS = {
        today: 'Hari Ini',
        week: 'Minggu Ini',
        month: 'Bulan Ini',
    }

    const dateRangeStr = isCustom
        ? (dateFrom === dateTo ? formatIndonesianDate(dateFrom) : `${formatIndonesianDate(dateFrom)} – ${formatIndonesianDate(dateTo)}`)
        : period === 'today'
        ? formatIndonesianDate(dateFrom)
        : `${formatIndonesianDate(dateFrom)} – ${formatIndonesianDate(dateTo)}`

    return (
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-12">
            {/* Navigasi Breadcrumb Kembali & Dropdown Periode */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
                <Link
                    href="/dashboard/keuangan"
                    className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-emerald-800 transition"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span>Kembali ke Pusat Laporan</span>
                </Link>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className="text-xs font-medium text-slate-500">Periode:</span>
                    <PeriodSelect
                        currentPeriod={period}
                        startDate={params.start_date}
                        endDate={params.end_date}
                    />
                </div>
            </div>

            {/* Header Laporan Arus Kas */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xs mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-6">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800 mb-1">
                            <span>Cash Flow Statement • Arus Kas Nyata</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                            Laporan Arus Kas
                        </h1>
                        <p className="mt-1 text-xs sm:text-sm text-slate-500 font-medium">
                            {businessName} • <span className="font-semibold text-emerald-800">{branchLabel}</span>
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className={`px-3 py-1.5 rounded-full text-xs font-bold border tabular-nums ${
                            netCashFlow >= 0
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                            {netCashFlow >= 0 ? `Kas Bersih: +${fmt(netCashFlow)}` : `Arus Kas Negatif: ${fmt(netCashFlow)}`}
                        </span>
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span>Rentang Tanggal: <strong>{dateRangeStr}</strong></span>
                    <span className="text-[11px] text-slate-400">Sinkron otomatis dengan cabang di Navbar</span>
                </div>
            </div>

            {/* TABEL ARUS KAS */}
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden mb-8">
                <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
                    <span className="text-sm font-bold tracking-wide uppercase">Aktivitas Operasi Kas</span>
                    <span className="text-xs text-slate-300 font-medium">Periode: {dateRangeStr}</span>
                </div>

                <div className="p-6 sm:p-8 space-y-6">
                    {/* 1. Arus Kas Masuk */}
                    <div>
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-sm font-bold text-slate-900">
                            <span>1. ARUS KAS MASUK (OPERASIONAL & PENDANAAN)</span>
                            <span className="text-emerald-700">+{fmt(totalCashIn)}</span>
                        </div>
                        <div className="pt-2 pl-4 space-y-2 text-xs sm:text-sm text-slate-600">
                            <div className="flex items-center justify-between">
                                <span>Penerimaan Kas Tunai (Cash)</span>
                                <span className="font-semibold text-slate-800">{fmt(cashSales)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>Penerimaan Kas Digital (QRIS, Debit, Transfer)</span>
                                <span className="font-semibold text-slate-800">{fmt(digitalSales)}</span>
                            </div>
                            {equityDeposits > 0 && (
                                <div className="flex items-center justify-between text-blue-700 bg-blue-50/60 px-2 py-1 rounded-md">
                                    <span>Setoran & Tambahan Modal Pemilik (Equity Inflow)</span>
                                    <span className="font-semibold font-mono">{fmt(equityDeposits)}</span>
                                </div>
                            )}
                            {selectedBranchId !== 'all' && (
                                <p className="text-[11px] text-slate-400 italic">
                                    * Setoran modal usaha dikelola terpusat pada tingkat bisnis.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* 2. Arus Kas Keluar */}
                    <div>
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-sm font-bold text-slate-900">
                            <span>2. ARUS KAS KELUAR (OPERASIONAL, UTANG & PRIVE)</span>
                            <span className="text-rose-600">-{fmt(totalCashOut)}</span>
                        </div>
                        <div className="pt-2 pl-4 space-y-2 text-xs sm:text-sm text-slate-600">
                            <div className="flex items-center justify-between">
                                <span>Pembayaran Belanja Bahan Baku ke Supplier</span>
                                <span className="font-semibold text-slate-800">{fmt(totalPurchases)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>Pembayaran Beban Operasional (Gaji, Listrik, Sewa, dsb.)</span>
                                <span className="font-semibold text-slate-800">{fmt(totalExpenses)}</span>
                            </div>
                            {debtPayments > 0 && (
                                <div className="flex items-center justify-between text-amber-800 bg-amber-50/60 px-2 py-1 rounded-md">
                                    <span>Pembayaran Cicilan / Pelunasan Utang Usaha</span>
                                    <span className="font-semibold font-mono">{fmt(debtPayments)}</span>
                                </div>
                            )}
                            {equityWithdraws > 0 && (
                                <div className="flex items-center justify-between text-purple-800 bg-purple-50/60 px-2 py-1 rounded-md">
                                    <span>Penarikan Prive Pemilik (Owner Withdrawals)</span>
                                    <span className="font-semibold font-mono">{fmt(equityWithdraws)}</span>
                                </div>
                            )}
                            {selectedBranchId !== 'all' && (
                                <p className="text-[11px] text-slate-400 italic">
                                    * Penarikan dana pribadi (prive) dikelola terpusat pada tingkat bisnis.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* 3. Saldo Arus Kas Bersih */}
                    <div className="pt-4 border-t-2 border-slate-900">
                        <div className={`p-4 rounded-xl flex items-center justify-between text-base sm:text-lg font-black ${
                            netCashFlow >= 0
                                ? 'bg-teal-50 text-teal-950 border border-teal-300'
                                : 'bg-rose-50 text-rose-950 border border-rose-300'
                        }`}>
                            <div>
                                <span className="block text-xs uppercase tracking-wider font-extrabold opacity-75">
                                    Hasil Bersih Kas Nyata
                                </span>
                                <span>ARUS KAS BERSIH (NET CASH FLOW)</span>
                            </div>
                            <span className="underline decoration-double text-xl sm:text-2xl">
                                {netCashFlow >= 0 ? '+' : ''}{fmt(netCashFlow)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
