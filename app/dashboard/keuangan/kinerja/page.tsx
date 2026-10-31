import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveBranchId } from '@/lib/active-branch'
import { getIndonesianPeriodRange, formatIndonesianDate } from '@/lib/date-utils'
import { resolveEffectiveBranchFilter } from '@/lib/inventory-valuation'
import ExportButton from '../export-button'
import PeriodSelect from '../period-select'
import { canAccessAdvancedReports } from '@/lib/subscription-access'

function fmt(n: number) {
    return 'Rp' + Math.round(n).toLocaleString('id-ID')
}

export default async function KinerjaPage({
    searchParams,
}: {
    searchParams: Promise<{ period?: string; branch?: string }>
}) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, business_id, businesses(name, subscription_status, subscription_expires_at, trial_ends_at, subscription_plans(code, can_advanced_reports, can_api_access))')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner' || !profile.business_id) {
        redirect('/dashboard')
    }

    const businessId = profile.business_id
    const businessData = profile.businesses as unknown as {
        name: string | null
        subscription_status: string | null
        subscription_expires_at: string | null
        trial_ends_at: string | null
        subscription_plans?: {
            code: string
            can_advanced_reports: boolean
            can_api_access: boolean
        } | null
    } | null

    const businessName = businessData?.name || 'Bisnis Anda'
    const subscriptionStatus = (businessData?.subscription_status || 'trial') as 'trial' | 'active' | 'expired'
    const planRow = businessData?.subscription_plans

    const { allowed: canExport, reason: exportReason } = canAccessAdvancedReports({
        status: subscriptionStatus,
        planCode: planRow?.code || null,
        expiresAt: businessData?.subscription_expires_at || null,
        trialEndsAt: businessData?.trial_ends_at || null,
        planFeatures: planRow
            ? {
                  can_advanced_reports: !!planRow.can_advanced_reports,
                  can_api_access: !!planRow.can_api_access,
              }
            : null,
    })

    const params = await searchParams
    const period = (['today', 'week', 'month'].includes(params.period ?? '')
        ? params.period
        : 'month') as 'today' | 'week' | 'month'

    const activeBranchId = await getActiveBranchId()
    const candidateBranchId = (activeBranchId && activeBranchId !== 'all')
        ? activeBranchId
        : (params.branch && params.branch !== 'all' ? params.branch : 'all')
    const { dateFrom, dateTo, timestampFrom, timestampTo } = getIndonesianPeriodRange(period)

    // Branches (scoped strictly to user's business)
    const { data: branches } = await supabase
        .from('branches')
        .select('id, name')
        .eq('business_id', businessId)
        .order('name')

    const branchList = branches ?? []
    const { selectedBranchId, branchLabel } = resolveEffectiveBranchFilter(candidateBranchId, branchList)

    // Sales query (hanya transaksi yang tidak di-void)
    let salesQuery = supabase
        .from('sales')
        .select('id, total, channel, payment_method, branch_id, branches(name)')
        .eq('business_id', businessId)
        .neq('status', 'voided')
        .gte('transaction_date', timestampFrom)
        .lte('transaction_date', timestampTo)

    let saleItemsQuery = supabase
        .from('sale_items')
        .select('quantity, price, cost_price, product_id, products(name, category, unit), sales!inner(business_id, transaction_date, branch_id, status)')
        .eq('sales.business_id', businessId)
        .neq('sales.status', 'voided')
        .gte('sales.transaction_date', timestampFrom)
        .lte('sales.transaction_date', timestampTo)


    let purchasesQuery = supabase
        .from('purchases')
        .select('id, total, purchase_date, supplier, branch_id, branches(name)')
        .eq('business_id', businessId)
        .gte('purchase_date', dateFrom)
        .lte('purchase_date', dateTo)

    let expensesQuery = supabase
        .from('expenses')
        .select('id, category, amount, description, expense_date, branch_id, branches(name)')
        .eq('business_id', businessId)
        .gte('expense_date', dateFrom)
        .lte('expense_date', dateTo)

    if (selectedBranchId !== 'all') {
        salesQuery = salesQuery.eq('branch_id', selectedBranchId)
        saleItemsQuery = saleItemsQuery.eq('sales.branch_id', selectedBranchId)
        purchasesQuery = purchasesQuery.eq('branch_id', selectedBranchId)
        expensesQuery = expensesQuery.eq('branch_id', selectedBranchId)
    }

    const [
        { data: salesRaw },
        { data: saleItemsRaw },
        { data: purchasesRaw },
        { data: expensesRaw },
    ] = await Promise.all([
        salesQuery,
        saleItemsQuery,
        purchasesQuery,
        expensesQuery,
    ])

    const sales = salesRaw ?? []
    const saleItems = saleItemsRaw ?? []
    const purchases = purchasesRaw ?? []
    const expenses = expensesRaw ?? []

    const totalRevenue = sales.reduce((s, r) => s + Number(r.total || 0), 0)
    const totalTransactions = sales.length
    const totalHPP = saleItems.reduce((s, i) => s + Number(i.cost_price || 0) * Number(i.quantity || 0), 0)
    const grossProfit = totalRevenue - totalHPP
    const totalPurchases = purchases.reduce((s, p) => s + Number(p.total || 0), 0)
    let operatingExpenses = 0
    let _equipmentCapex = 0
    for (const exp of expenses) {
        const amt = Number(exp.amount || 0)
        if (exp.category === 'peralatan') {
            _equipmentCapex += amt
        } else {
            operatingExpenses += amt
        }
    }
    const totalExpenses = operatingExpenses
    const netProfit = grossProfit - operatingExpenses

    // Product performance
    interface ProductStats {
        name: string
        category: string
        quantity: number
        revenue: number
        unit: string
    }

    const productMap = new Map<string, ProductStats>()
    let totalItemsSold = 0

    for (const item of saleItems) {
        const prod = item.products as unknown as { name?: string; category?: string; unit?: string } | null
        const name = prod?.name || 'Item Terhapus'
        const cat = prod?.category || 'Umum'
        const unit = prod?.unit || 'pcs'
        const qty = Number(item.quantity || 0)
        const rev = Number(item.price || 0) * qty

        totalItemsSold += qty
        const existing = productMap.get(name)
        if (existing) {
            existing.quantity += qty
            existing.revenue += rev
        } else {
            productMap.set(name, {
                name,
                category: cat,
                quantity: qty,
                revenue: rev,
                unit,
            })
        }
    }

    const topProducts = Array.from(productMap.values()).sort((a, b) => b.quantity - a.quantity)

    // Branch performance
    const branchStatsMap = new Map<string, { name: string; revenue: number; count: number }>()
    for (const s of sales) {
        const bName = (s.branches as unknown as { name: string } | null)?.name || 'Cabang Utama'
        const amt = Number(s.total || 0)
        const cur = branchStatsMap.get(bName) || { name: bName, revenue: 0, count: 0 }
        cur.revenue += amt
        cur.count += 1
        branchStatsMap.set(bName, cur)
    }
    const branchPerformance = Array.from(branchStatsMap.values()).sort((a, b) => b.revenue - a.revenue)

    const PERIOD_LABELS = {
        today: 'Hari Ini',
        week: 'Minggu Ini',
        month: 'Bulan Ini',
    }

    const dateRangeStr =
        period === 'today'
            ? formatIndonesianDate(dateFrom)
            : `${formatIndonesianDate(dateFrom)} – ${formatIndonesianDate(dateTo)}`

    return (
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
            {/* Navigasi Breadcrumb Kembali & Action Toolbar */}
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

                <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-slate-500">Periode:</span>
                        <PeriodSelect currentPeriod={period} />
                    </div>
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
                        expenses={expenses.map((e) => ({
                            id: e.id,
                            category: e.category,
                            categoryLabel: e.category,
                            amount: Number(e.amount),
                            description: e.description ?? null,
                            expense_date: e.expense_date,
                            branchName: (e.branches as unknown as { name: string } | null)?.name ?? null,
                        }))}
                        purchases={purchases.map((p) => ({
                            id: p.id,
                            supplier: p.supplier ?? null,
                            total: Number(p.total),
                            purchase_date: p.purchase_date,
                            branchName: (p.branches as unknown as { name: string } | null)?.name ?? null,
                        }))}
                        canExport={canExport}
                        upgradeMessage={exportReason}
                    />
                </div>
            </div>

            {/* Header Laporan Kinerja */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xs mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-6">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800 mb-1">
                            <span>Business Intelligence • Analisis Penjualan</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                            Laporan Kinerja Penjualan & Produk
                        </h1>
                        <p className="mt-1 text-xs sm:text-sm text-slate-500 font-medium">
                            {businessName} • <span className="font-semibold text-emerald-800">{branchLabel}</span>
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 tabular-nums">
                            {totalTransactions} Transaksi • {totalItemsSold} Item Terjual
                        </span>
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span>Rentang Tanggal: <strong>{dateRangeStr}</strong></span>
                    <span className="text-[11px] text-slate-400">Sinkron otomatis dengan cabang di Navbar</span>
                </div>
            </div>

            {/* Top Products Leaderboard */}
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden mb-8">
                <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
                    <span className="text-sm font-bold tracking-wide uppercase">Peringkat Produk Terlaris (Top Selling)</span>
                    <span className="text-xs text-slate-300 font-medium">Berdasarkan Volume Terjual</span>
                </div>

                <div className="divide-y divide-slate-100">
                    {topProducts.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-400">
                            Belum ada produk yang terjual pada periode ini.
                        </div>
                    ) : (
                        topProducts.map((p, idx) => {
                            const pct = totalRevenue > 0 ? Math.round((p.revenue / totalRevenue) * 100) : 0
                            return (
                                <div key={p.name} className="p-4 sm:px-6 flex items-center justify-between hover:bg-slate-50 transition">
                                    <div className="flex items-center gap-3">
                                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold ${
                                            idx === 0
                                                ? 'bg-amber-100 text-amber-800'
                                                : idx === 1
                                                ? 'bg-slate-200 text-slate-700'
                                                : idx === 2
                                                ? 'bg-orange-100 text-orange-800'
                                                : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            {idx + 1}
                                        </span>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">{p.name}</p>
                                            <p className="text-xs text-slate-400">{p.category} • {pct}% dari total omzet</p>
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        <p className="text-sm font-extrabold text-slate-900">{p.quantity} {p.unit}</p>
                                        <p className="text-xs text-emerald-600 font-semibold">{fmt(p.revenue)}</p>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Branch Performance Comparison */}
            {branchPerformance.length > 1 && (
                <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
                        Perbandingan Omzet Antar Cabang
                    </h2>
                    <div className="space-y-3">
                        {branchPerformance.map((b) => {
                            const pct = totalRevenue > 0 ? Math.round((b.revenue / totalRevenue) * 100) : 0
                            return (
                                <div key={b.name} className="p-3 rounded-xl border border-slate-100 bg-slate-50/60">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-xs font-bold text-slate-900">{b.name} ({b.count} tx)</span>
                                        <span className="text-xs font-extrabold text-blue-700">{fmt(b.revenue)} ({pct}%)</span>
                                    </div>
                                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
