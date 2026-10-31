import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveBranchId } from '@/lib/active-branch'
import { getIndonesianPeriodRange, formatIndonesianDate, parseCustomOrPeriodRange } from '@/lib/date-utils'
import { resolveEffectiveBranchFilter } from '@/lib/inventory-valuation'
import PeriodSelect from '../period-select'

function fmt(n: number) {
    return 'Rp' + Math.round(n).toLocaleString('id-ID')
}

const CATEGORY_LABEL: Record<string, { label: string; icon: string }> = {
    gaji: { label: 'Penggajian Karyawan', icon: '👤' },
    listrik: { label: 'Listrik & Utilitas', icon: '⚡' },
    air: { label: 'Air / PDAM', icon: '💧' },
    sewa: { label: 'Sewa Tempat & Bangunan', icon: '🏠' },
    gas: { label: 'Gas Operasional', icon: '🔥' },
    transportasi: { label: 'BBM & Transportasi', icon: '🚗' },
    marketing: { label: 'Promosi & Pemasaran', icon: '📢' },
    packaging: { label: 'Kemasan & Plastik', icon: '📦' },
    peralatan: { label: 'Peralatan & Perlengkapan', icon: '🔧' },
    lainnya: { label: 'Biaya Lain-Lain', icon: '🗂️' },
}

export default async function LabaRugiPage({
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
    const { dateFrom, dateTo, timestampFrom, timestampTo, period, isCustom, label: periodLabel } = parseCustomOrPeriodRange(
        params.period,
        params.start_date,
        params.end_date,
        'month'
    )

    const activeBranchId = await getActiveBranchId()
    const candidateBranchId = params.branch
        ? (params.branch !== 'all' ? params.branch : 'all')
        : (activeBranchId && activeBranchId !== 'all' ? activeBranchId : 'all')

    // Branches filter (scoped strictly to user's business)
    const { data: branches } = await supabase
        .from('branches')
        .select('id, name')
        .eq('business_id', businessId)
        .order('name')

    const branchList = branches ?? []
    const { selectedBranchId, branchLabel } = resolveEffectiveBranchFilter(candidateBranchId, branchList)

    // Queries: Pendapatan & HPP hanya dari transaksi sah (non-voided)
    let salesQuery = supabase
        .from('sales')
        .select('total, transaction_date')
        .eq('business_id', businessId)
        .neq('status', 'voided')
        .gte('transaction_date', timestampFrom)
        .lte('transaction_date', timestampTo)

    let saleItemsQuery = supabase
        .from('sale_items')
        .select('cost_price, quantity, sales!inner(business_id, transaction_date, branch_id, status)')
        .eq('sales.business_id', businessId)
        .neq('sales.status', 'voided')
        .gte('sales.transaction_date', timestampFrom)
        .lte('sales.transaction_date', timestampTo)


    let expensesQuery = supabase
        .from('expenses')
        .select('id, category, amount, description, expense_date')
        .eq('business_id', businessId)
        .gte('expense_date', dateFrom)
        .lte('expense_date', dateTo)

    if (selectedBranchId !== 'all') {
        salesQuery = salesQuery.eq('branch_id', selectedBranchId)
        saleItemsQuery = saleItemsQuery.eq('sales.branch_id', selectedBranchId)
        expensesQuery = expensesQuery.eq('branch_id', selectedBranchId)
    }

    const [{ data: salesRaw }, { data: saleItemsRaw }, { data: expensesRaw }] = await Promise.all([
        salesQuery,
        saleItemsQuery,
        expensesQuery,
    ])

    const totalRevenue = (salesRaw ?? []).reduce((s, r) => s + Number(r.total || 0), 0)
    const totalHPP = (saleItemsRaw ?? []).reduce(
        (s, i) => s + Number(i.cost_price || 0) * Number(i.quantity || 0),
        0
    )
    const grossProfit = totalRevenue - totalHPP

    // Group expenses by category (peralatan dikapitalisasi sebagai aset tetap CapEx, tidak memotong laba operasional)
    const expenseBreakdown: Record<string, number> = {}
    let totalExpenses = 0
    let equipmentCapex = 0
    for (const exp of expensesRaw ?? []) {
        const cat = exp.category || 'lainnya'
        const amt = Number(exp.amount || 0)
        if (cat === 'peralatan') {
            equipmentCapex += amt
        } else {
            expenseBreakdown[cat] = (expenseBreakdown[cat] || 0) + amt
            totalExpenses += amt
        }
    }

    const netProfit = grossProfit - totalExpenses

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

            {/* Header Laporan Laba Rugi */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xs mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-6">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800 mb-1">
                            <span>Income Statement • Standar Akuntansi</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                            Laporan Laba Rugi & Saldo Laba
                        </h1>
                        <p className="mt-1 text-xs sm:text-sm text-slate-500 font-medium">
                            {businessName} • <span className="font-semibold text-emerald-800">{branchLabel}</span>
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className={`px-3 py-1.5 rounded-full text-xs font-bold border tabular-nums ${
                            netProfit >= 0
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                            {netProfit >= 0 ? `Laba Bersih: ${fmt(netProfit)}` : `Rugi Bersih: ${fmt(Math.abs(netProfit))}`}
                        </span>
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span>Rentang Tanggal: <strong>{dateRangeStr}</strong></span>
                    <span className="text-[11px] text-slate-400">Sinkron otomatis dengan cabang di Navbar</span>
                </div>
            </div>

            {/* TABEL RINCIAN LABA RUGI (FINANCIAL LEDGER SHEET) */}
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden mb-8">
                <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
                    <span className="text-sm font-bold tracking-wide uppercase">Pos Akun Laba Rugi</span>
                    <span className="text-xs text-slate-300 font-medium">Periode: {dateRangeStr}</span>
                </div>

                <div className="p-6 sm:p-8 space-y-6">
                    {/* 1. Pendapatan Penjualan */}
                    <div>
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-sm font-bold text-slate-900">
                            <span>1. PENDAPATAN OPERASIONAL</span>
                            <span className="tabular-nums">{fmt(totalRevenue)}</span>
                        </div>
                        <div className="pt-2 pl-4 flex items-center justify-between text-xs sm:text-sm text-slate-600">
                            <span>Penjualan Bersih Kasir POS (Dine-in, Takeaway, Delivery)</span>
                            <span className="font-semibold text-slate-800 tabular-nums">{fmt(totalRevenue)}</span>
                        </div>
                    </div>

                    {/* 2. Harga Pokok Penjualan (HPP) */}
                    <div>
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-sm font-bold text-slate-900">
                            <span>2. HARGA POKOK PENJUALAN (HPP)</span>
                            <span className="text-red-600 tabular-nums">({fmt(totalHPP)})</span>
                        </div>
                        <div className="pt-2 pl-4 flex items-center justify-between text-xs sm:text-sm text-slate-600">
                            <span>Biaya Pokok Bahan Baku & Barang Terjual</span>
                            <span className="font-semibold text-slate-800 tabular-nums">{fmt(totalHPP)}</span>
                        </div>

                        {/* SUB TOTAL LABA KOTOR */}
                        <div className="mt-3 p-3 bg-emerald-50/70 rounded-xl border border-emerald-200/80 flex items-center justify-between text-sm font-extrabold text-emerald-950">
                            <span>LABA KOTOR (GROSS PROFIT)</span>
                            <span className="tabular-nums">{fmt(grossProfit)}</span>
                        </div>
                    </div>

                    {/* 3. Beban Usaha / Beban Operasional */}
                    <div>
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-sm font-bold text-slate-900">
                            <span>3. BEBAN OPERASIONAL USAHA</span>
                            <span className="text-red-600 tabular-nums">({fmt(totalExpenses)})</span>
                        </div>

                        <div className="pt-3 pl-4 space-y-2.5 text-xs sm:text-sm text-slate-600">
                            {Object.entries(CATEGORY_LABEL).map(([catKey, catInfo]) => {
                                const amt = expenseBreakdown[catKey] || 0
                                if (amt === 0) return null
                                return (
                                    <div key={catKey} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span>{catInfo.icon}</span>
                                            <span>{catInfo.label}</span>
                                        </div>
                                        <span className="font-semibold text-slate-800 tabular-nums">{fmt(amt)}</span>
                                    </div>
                                )
                            })}
                            {totalExpenses === 0 && (
                                <p className="text-xs text-slate-400 italic">Belum ada catatan pengeluaran operasional pada periode ini.</p>
                            )}
                        </div>

                        {/* SUB TOTAL BEBAN */}
                        <div className="mt-3 p-2.5 bg-slate-50 rounded-lg flex items-center justify-between text-xs sm:text-sm font-bold text-slate-800">
                            <span>Total Beban Operasional</span>
                            <span className="text-red-600 tabular-nums">{fmt(totalExpenses)}</span>
                        </div>

                        {/* Catatan Belanja Modal / Aset Tetap (CapEx) */}
                        {equipmentCapex > 0 && (
                            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
                                <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-slate-900">
                                    <div className="flex items-center gap-1.5">
                                        <span>🔧</span>
                                        <span>Belanja Modal Peralatan (Aset Tetap / CapEx)</span>
                                    </div>
                                    <span className="font-mono tabular-nums">{fmt(equipmentCapex)}</span>
                                </div>
                                <p className="mt-1 text-[11px] text-slate-600">
                                    Sesuai standar akuntansi, pengeluaran pembelian peralatan toko tidak memotong laba bersih operasional, melainkan dikapitalisasi dan dicatat sebagai <strong>Aset Tetap Toko</strong> pada Laporan Neraca.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* 4. LABA BERSIH AKHIR */}
                    <div className="pt-4 border-t-2 border-slate-900">
                        <div className={`p-4 rounded-xl flex items-center justify-between text-base sm:text-lg font-black ${netProfit >= 0
                            ? 'bg-emerald-50 text-emerald-950 border border-emerald-300'
                            : 'bg-rose-50 text-rose-950 border border-rose-300'
                            }`}>
                            <div>
                                <span className="block text-xs uppercase tracking-wider font-extrabold opacity-75">
                                    Hasil Bersih Periode Berjalan
                                </span>
                                <span>{netProfit >= 0 ? 'LABA BERSIH (NET PROFIT)' : 'RUGI BERSIH'}</span>
                            </div>
                            <span className="underline decoration-double text-xl sm:text-2xl tabular-nums">
                                {fmt(netProfit)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
