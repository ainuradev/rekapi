import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ExpenseForm from './expense-form'
import BranchFilter from './branch-filter'
import ExportButton from './export-button'
import { deleteExpense } from './actions'
import { getIndonesianPeriodRange, formatIndonesianDate } from '@/lib/date-utils'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function fmt(n: number) {
    return 'Rp' + n.toLocaleString('id-ID')
}

const CATEGORY_LABEL: Record<string, { label: string; icon: string }> = {
    gaji: { label: 'Penggajian', icon: '👤' },
    listrik: { label: 'Listrik', icon: '⚡' },
    air: { label: 'Air / PDAM', icon: '💧' },
    sewa: { label: 'Sewa Tempat', icon: '🏠' },
    gas: { label: 'Gas', icon: '🔥' },
    transportasi: { label: 'Transportasi', icon: '🚗' },
    marketing: { label: 'Marketing', icon: '📢' },
    packaging: { label: 'Packaging', icon: '📦' },
    peralatan: { label: 'Peralatan', icon: '🔧' },
    lainnya: { label: 'Lainnya', icon: '🗂️' },
}

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────
export default async function KeuanganPage({
    searchParams,
}: {
    searchParams: Promise<{ period?: string; branch?: string }>
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, business_id, businesses(name)')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'owner') redirect('/dashboard')

    const businessName = (profile as any)?.businesses?.name ?? 'Bisnis'

    const params = await searchParams
    const period = (['today', 'week', 'month'].includes(params.period ?? '')
        ? params.period
        : 'today') as 'today' | 'week' | 'month'

    const selectedBranchId = params.branch && params.branch !== 'all' ? params.branch : 'all'

    // Gunakan rentang waktu & kalender Indonesia (WIB)
    const { dateFrom, dateTo, timestampFrom, timestampTo } = getIndonesianPeriodRange(period)

    // ── Build filtered queries ──
    let salesQuery = supabase
        .from('sales')
        .select('total, transaction_date')
        .eq('business_id', profile.business_id)
        .gte('transaction_date', timestampFrom)
        .lte('transaction_date', timestampTo)

    let saleItemsQuery = supabase
        .from('sale_items')
        .select('cost_price, quantity, sale_id, sales!inner(business_id, transaction_date, branch_id)')
        .eq('sales.business_id', profile.business_id)
        .gte('sales.transaction_date', timestampFrom)
        .lte('sales.transaction_date', timestampTo)

    let purchasesQuery = supabase
        .from('purchases')
        .select('id, total, purchase_date, supplier, branch_id, branches(name)')
        .eq('business_id', profile.business_id)
        .gte('purchase_date', dateFrom)
        .lte('purchase_date', dateTo)
        .order('purchase_date', { ascending: false })

    let expensesQuery = supabase
        .from('expenses')
        .select('id, category, amount, description, expense_date, branch_id, branches(name)')
        .eq('business_id', profile.business_id)
        .gte('expense_date', dateFrom)
        .lte('expense_date', dateTo)
        .order('expense_date', { ascending: false })

    if (selectedBranchId !== 'all') {
        salesQuery = salesQuery.eq('branch_id', selectedBranchId)
        saleItemsQuery = saleItemsQuery.eq('sales.branch_id', selectedBranchId)
        purchasesQuery = purchasesQuery.eq('branch_id', selectedBranchId)
        expensesQuery = expensesQuery.eq('branch_id', selectedBranchId)
    }

    // ── Parallel data fetching ──
    const [
        { data: branches },
        { data: salesRaw },
        { data: saleItemsRaw },
        { data: purchasesRaw },
        { data: expensesRaw },
    ] = await Promise.all([
        supabase
            .from('branches')
            .select('id, name')
            .eq('business_id', profile.business_id)
            .order('name'),
        salesQuery,
        saleItemsQuery,
        purchasesQuery,
        expensesQuery,
    ])

    const branchList = branches ?? []
    const selectedBranch = branchList.find((b) => b.id === selectedBranchId)
    const branchLabel = selectedBranch ? `Cabang ${selectedBranch.name}` : 'Semua Cabang'

    // ── Calculations ──
    const totalRevenue = (salesRaw ?? []).reduce((s, r) => s + Number(r.total), 0)
    const totalHPP = (saleItemsRaw ?? []).reduce(
        (s, i) => s + Number(i.cost_price) * Number(i.quantity),
        0
    )
    const totalPurchases = (purchasesRaw ?? []).reduce((s, r) => s + Number(r.total), 0)
    const totalExpenses = (expensesRaw ?? []).reduce((s, r) => s + Number(r.amount), 0)
    const grossProfit = totalRevenue - totalHPP
    const netProfit = grossProfit - totalPurchases - totalExpenses

    // ── Period labels ──
    const PERIOD_LABELS = {
        today: 'Hari Ini',
        week: 'Minggu Ini',
        month: 'Bulan Ini',
    }

    const dateRangeStr =
        period === 'today'
            ? formatIndonesianDate(dateFrom)
            : `${formatIndonesianDate(dateFrom)} – ${formatIndonesianDate(dateTo)}`

    // Data siap export
    const formattedExpenses = (expensesRaw ?? []).map((e: any) => ({
        id: e.id,
        category: e.category,
        categoryLabel: CATEGORY_LABEL[e.category]?.label ?? e.category,
        amount: Number(e.amount),
        description: e.description,
        expense_date: e.expense_date,
        branchName: e.branches?.name ?? null,
    }))

    const formattedPurchases = (purchasesRaw ?? []).map((p: any) => ({
        id: p.id,
        supplier: p.supplier,
        total: Number(p.total),
        purchase_date: p.purchase_date,
        branchName: p.branches?.name ?? null,
    }))

    return (
        <div className="mx-auto max-w-2xl px-4 py-8 sm:py-16">
            {/* Header Cetak / Print Khusus Dokumen PDF */}
            <div className="hidden print:block mb-6 border-b border-gray-300 pb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold uppercase tracking-wider text-gray-900">{businessName}</h1>
                        <p className="text-sm font-semibold text-gray-700">Laporan Keuangan — {branchLabel}</p>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                        <p>Periode: <strong>{PERIOD_LABELS[period]}</strong> ({dateRangeStr})</p>
                        <p>Dicetak: {new Date().toLocaleString('id-ID')}</p>
                    </div>
                </div>
            </div>

            {/* Header Tampilan Web */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-gray-900">Keuangan</h1>
                        {selectedBranch && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700">
                                🏢 {selectedBranch.name}
                            </span>
                        )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                        Ringkasan keuangan bisnis dan pencatatan pengeluaran.
                    </p>
                </div>

                {/* Tombol Export Laporan */}
                <div className="no-print">
                    <ExportButton
                        businessName={businessName}
                        branchLabel={branchLabel}
                        periodLabel={PERIOD_LABELS[period]}
                        dateRangeStr={dateRangeStr}
                        summary={{
                            totalRevenue,
                            totalHPP,
                            grossProfit,
                            totalPurchases,
                            totalExpenses,
                            netProfit,
                        }}
                        expenses={formattedExpenses}
                        purchases={formattedPurchases}
                    />
                </div>
            </div>

            {/* Branch Filter (Hidden on Print) */}
            <div className="no-print">
                <BranchFilter
                    branches={branchList}
                    selectedBranchId={selectedBranchId}
                    period={period}
                />
            </div>

            {/* Period Filter (Hidden on Print) */}
            <div className="no-print mb-6 flex items-center gap-2">
                {(['today', 'week', 'month'] as const).map((p) => (
                    <a
                        key={p}
                        href={`/dashboard/keuangan?period=${p}${selectedBranchId !== 'all' ? `&branch=${selectedBranchId}` : ''}`}
                        className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                            period === p
                                ? 'bg-black text-white shadow-sm'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        {PERIOD_LABELS[p]}
                    </a>
                ))}
                <span className="ml-auto text-xs text-gray-400">
                    {dateRangeStr}
                </span>
            </div>

            {/* Summary Cards */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryCard
                    icon="💰"
                    label="Pendapatan Penjualan"
                    value={fmt(totalRevenue)}
                    valueClass="text-gray-900"
                    sub={branchLabel}
                />
                <SummaryCard
                    icon="📦"
                    label="HPP / Bahan Terjual"
                    value={fmt(totalHPP)}
                    valueClass="text-gray-700"
                    sub={`Margin: ${fmt(grossProfit)}`}
                />
                <SummaryCard
                    icon="🛒"
                    label="Belanja Bahan Baku"
                    value={fmt(totalPurchases)}
                    valueClass="text-amber-700"
                    sub={branchLabel}
                />
                <SummaryCard
                    icon="💸"
                    label="Pengeluaran Operasional"
                    value={fmt(totalExpenses)}
                    valueClass="text-red-700"
                    sub={branchLabel}
                />
            </div>

            {/* Net Profit Banner */}
            <div
                className={`mb-8 rounded-2xl p-5 text-center shadow-sm ${
                    netProfit >= 0
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-red-50 border border-red-200'
                }`}
            >
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Laba Bersih {PERIOD_LABELS[period]} — {branchLabel}
                </p>
                <p
                    className={`mt-1 text-3xl font-extrabold ${
                        netProfit >= 0 ? 'text-green-700' : 'text-red-600'
                    }`}
                >
                    {netProfit < 0 ? '−' : ''}
                    {fmt(Math.abs(netProfit))}
                </p>
                <p className="mt-1.5 text-xs text-gray-500">
                    Pendapatan {fmt(totalRevenue)} − HPP {fmt(totalHPP)} − Belanja Bahan {fmt(totalPurchases)} − Pengeluaran {fmt(totalExpenses)}
                </p>
            </div>

            {/* Expense Form (Hidden on Print) */}
            <div className="no-print">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                    Catat Pengeluaran
                </h2>
                <ExpenseForm
                    branches={branchList}
                    initialBranchId={selectedBranchId !== 'all' ? selectedBranchId : undefined}
                />
            </div>

            {/* Expense List */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                        Riwayat Pengeluaran ({(expensesRaw ?? []).length} entri)
                    </h2>
                    {selectedBranchId !== 'all' && (
                        <span className="text-xs text-indigo-600 font-medium no-print">
                            Menampilkan khusus {branchLabel}
                        </span>
                    )}
                </div>

                {(expensesRaw ?? []).length === 0 && (
                    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-400">
                        Belum ada pengeluaran tercatat di periode dan cabang ini.
                    </div>
                )}

                {(expensesRaw ?? []).map((exp: any) => {
                    const catInfo = CATEGORY_LABEL[exp.category] ?? { label: exp.category, icon: '🗂️' }
                    return (
                        <div
                            key={exp.id}
                            className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-xl">{catInfo.icon}</span>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-gray-900">
                                            {catInfo.label}
                                        </span>
                                        {exp.branches?.name ? (
                                            <span className="inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                                                🏢 {exp.branches.name}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                                                Umum
                                            </span>
                                        )}
                                    </div>
                                    {exp.description && (
                                        <div className="text-xs text-gray-500">{exp.description}</div>
                                    )}
                                    <div className="text-[11px] text-gray-400">
                                        {formatIndonesianDate(exp.expense_date)}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-red-600">
                                    −{fmt(Number(exp.amount))}
                                </span>
                                <form
                                    action={async () => {
                                        'use server'
                                        await deleteExpense(exp.id)
                                    }}
                                    className="no-print"
                                >
                                    <button
                                        type="submit"
                                        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-600 cursor-pointer"
                                        title="Hapus pengeluaran ini"
                                    >
                                        🗑
                                    </button>
                                </form>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function SummaryCard({
    icon,
    label,
    value,
    valueClass,
    sub,
}: {
    icon: string
    label: string
    value: string
    valueClass: string
    sub?: string
}) {
    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5">
                <span className="text-xl">{icon}</span>
                <span className="text-[11px] font-medium leading-tight text-gray-500">{label}</span>
            </div>
            <p className={`text-base font-extrabold ${valueClass}`}>{value}</p>
            {sub && <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>}
        </div>
    )
}
