import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveBranchId } from '@/lib/active-branch'
import { resolveEffectiveBranchFilter } from '@/lib/inventory-valuation'
import ExpenseForm from '../expense-form'
import PeriodSelect from '../period-select'
import { deleteExpense } from '../actions'
import { getIndonesianPeriodRange, formatIndonesianDate, parseCustomOrPeriodRange } from '@/lib/date-utils'

function fmt(n: number) {
    return 'Rp' + Math.round(n).toLocaleString('id-ID')
}

const CATEGORY_LABEL: Record<string, { label: string }> = {
    gaji: { label: 'Penggajian / Upah' },
    listrik: { label: 'Listrik' },
    air: { label: 'Air / PDAM' },
    sewa: { label: 'Sewa Tempat' },
    gas: { label: 'Gas' },
    transportasi: { label: 'Transportasi' },
    marketing: { label: 'Marketing' },
    packaging: { label: 'Packaging' },
    peralatan: { label: 'Peralatan' },
    lainnya: { label: 'Lainnya' },
}

export default async function BebanPage({
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
        .select('role, business_id, businesses(name)')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner' || !profile.business_id) {
        redirect('/dashboard')
    }

    const businessId = profile.business_id
    const businessName = (profile.businesses as unknown as { name: string } | null)?.name || 'Bisnis Anda'

    const params = await searchParams
    const { dateFrom, dateTo, period, isCustom, label: periodLabel } = parseCustomOrPeriodRange(
        params.period,
        params.start_date,
        params.end_date,
        'month'
    )

    const activeBranchId = await getActiveBranchId()
    const candidateBranchId = (activeBranchId && activeBranchId !== 'all')
        ? activeBranchId
        : (params.branch && params.branch !== 'all' ? params.branch : 'all')

    // Branches (scoped strictly to user's business)
    const { data: branches } = await supabase
        .from('branches')
        .select('id, name')
        .eq('business_id', businessId)
        .order('name')

    const branchList = branches ?? []
    const { selectedBranchId, branchLabel } = resolveEffectiveBranchFilter(candidateBranchId, branchList)

    // Financial Accounts (Kas & Bank)
    const { data: accountsRaw } = await supabase
        .from('financial_accounts')
        .select('id, name, type, bank_name, account_number, current_balance, is_default_cash, is_default_bank')
        .eq('business_id', businessId)
        .eq('status', 'active')
        .order('name')

    const accountList = (accountsRaw ?? []).map((a) => ({
        ...a,
        current_balance: Number(a.current_balance || 0),
    }))

    // Expenses query
    let expensesQuery = supabase
        .from('expenses')
        .select('id, category, amount, description, expense_date, branch_id, branches(name)')
        .eq('business_id', businessId)
        .gte('expense_date', dateFrom)
        .lte('expense_date', dateTo)
        .order('expense_date', { ascending: false })

    if (selectedBranchId !== 'all') {
        expensesQuery = expensesQuery.eq('branch_id', selectedBranchId)
    }

    const { data: expensesRaw } = await expensesQuery
    const expenses = expensesRaw ?? []

    // Fetch linked payment accounts from financial_transactions
    const expenseIds = expenses.map((e) => e.id)
    const expenseAccountMap = new Map<string, { name: string; type: string }>()

    if (expenseIds.length > 0) {
        const { data: expenseTxs } = await supabase
            .from('financial_transactions')
            .select('reference_id, financial_accounts(name, type)')
            .eq('business_id', businessId)
            .eq('category', 'expense')
            .in('reference_id', expenseIds)

        if (expenseTxs) {
            for (const tx of expenseTxs) {
                if (tx.reference_id && tx.financial_accounts) {
                    const accInfo = tx.financial_accounts as unknown as { name: string; type: string }
                    expenseAccountMap.set(tx.reference_id, accInfo)
                }
            }
        }
    }

    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)
    const nonCashWasteTotal = expenses.reduce((s, e) => {
        const isNonCash = (e as unknown as { is_non_cash?: boolean }).is_non_cash ||
            Boolean(e.description && (
                e.description.includes('[WASTE') ||
                e.description.includes('[RUSAK') ||
                e.description.includes('[HILANG')
            ))
        return isNonCash ? s + Number(e.amount || 0) : s
    }, 0)

    // Grouping by category
    const categoryTotals: Record<string, number> = {}
    for (const e of expenses) {
        const cat = e.category || 'lainnya'
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(e.amount || 0)
    }

    const PERIOD_LABELS: Record<string, string> = {
        today: 'Hari Ini',
        week: 'Minggu Ini',
        month: 'Bulan Ini',
        custom: 'Periode Kustom',
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

            {/* Header Laporan Beban Usaha */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xs mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-6">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-600 mb-1">
                            <span>Cost Structure • Analisis Beban Usaha</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                            Laporan Beban Usaha & Pengeluaran
                        </h1>
                        <p className="mt-1 text-xs sm:text-sm text-slate-500 font-medium">
                            {businessName} • <span className="font-semibold text-emerald-800">{branchLabel}</span>
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {nonCashWasteTotal > 0 && (
                            <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 tabular-nums">
                                Beban Non-Kas: {fmt(nonCashWasteTotal)}
                            </span>
                        )}
                        <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 tabular-nums">
                            Total Beban: {fmt(totalExpenses)}
                        </span>
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span>Rentang Tanggal: <strong>{dateRangeStr}</strong></span>
                    <span className="text-[11px] text-slate-400">Sinkron otomatis dengan cabang di Navbar</span>
                </div>
            </div>

            {/* Struktur Beban (Cost Breakdown Cards) */}
            <div className="mb-8 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
                    Struktur Porsi Biaya Operasional ({dateRangeStr})
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(CATEGORY_LABEL).map(([catKey, catInfo]) => {
                        const amt = categoryTotals[catKey] || 0
                        const pct = totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0
                        return (
                            <div key={catKey} className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                                    <div>
                                        <p className="text-xs font-bold text-slate-800">{catInfo.label}</p>
                                        <p className="text-[10px] text-slate-400">{pct}% dari total beban</p>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-slate-900">{fmt(amt)}</span>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Form Catat Pengeluaran Baru */}
            <div className="mb-8 no-print">
                <ExpenseForm
                    branches={branchList}
                    accounts={accountList}
                    initialBranchId={selectedBranchId !== 'all' ? selectedBranchId : undefined}
                />
            </div>

            {/* Daftar Riwayat Pengeluaran */}
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
                <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
                    <span className="text-sm font-bold tracking-wide uppercase">Rincian Catatan Pengeluaran</span>
                    <span className="text-xs text-slate-300 font-medium">{expenses.length} Transaksi Tercatat</span>
                </div>

                <div className="divide-y divide-slate-100">
                    {expenses.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-400">
                            Tidak ada catatan pengeluaran pada periode {(PERIOD_LABELS[period] || dateRangeStr).toLowerCase()}.
                        </div>
                    ) : (
                        expenses.map((e) => {
                            const cat = CATEGORY_LABEL[e.category] || { label: e.category }
                            const branchName = (e.branches as unknown as { name: string } | null)?.name || 'Semua Cabang'
                            const paymentAcc = expenseAccountMap.get(e.id)
                            return (
                                <div key={e.id} className="p-4 sm:px-6 flex items-center justify-between hover:bg-slate-50 transition">
                                    <div className="flex items-center gap-3">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-xs font-bold text-slate-900">{cat.label}</span>
                                                <span className="text-[10px] text-slate-400">• {formatIndonesianDate(e.expense_date)}</span>
                                                <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-medium">{branchName}</span>
                                                {paymentAcc ? (
                                                    <span className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200/70 px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-1">
                                                        <span>{paymentAcc.type === 'cash' ? 'Kas' : paymentAcc.type === 'e_wallet' ? 'E-Wallet' : 'Bank'}:</span>
                                                        <span>{paymentAcc.name}</span>
                                                    </span>
                                                ) : (
                                                    (e.description?.includes('[WASTE') || e.description?.includes('[RUSAK') || e.description?.includes('[HILANG')) && (
                                                        <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded font-semibold inline-flex items-center">
                                                            Beban Non-Kas (Waste Stok)
                                                        </span>
                                                    )
                                                )}
                                            </div>
                                            {e.description && (
                                                <p className="text-xs text-slate-500 mt-0.5">{e.description}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-bold text-slate-900">{fmt(Number(e.amount))}</span>
                                        <form action={async () => {
                                            'use server'
                                            await deleteExpense(e.id)
                                        }}>
                                            <button
                                                type="submit"
                                                className="text-slate-400 hover:text-rose-600 transition p-1 rounded cursor-pointer text-xs font-semibold"
                                                title="Hapus Pengeluaran"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </div>
    )
}
