'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export interface DashboardMetricData {
    omzet: number
    omzetChangePct: number
    isOmzetUp: boolean
    omzetSparkline: number[]

    netProfit: number
    profitChangePct: number
    isProfitUp: boolean
    profitSparkline: number[]

    totalTransactions: number
    transChangePct: number
    isTransUp: boolean
    transSparkline: number[]

    lowStockCount: number
    lowStockSummary: string

    // Metrik kasir operasional (khusus Pegawai / Kasir)
    cashSalesCount?: number
    cashSalesTotal?: number
    nonCashSalesCount?: number
    nonCashSalesTotal?: number
    creditSalesCount?: number
    creditSalesTotal?: number
}

export interface ChartPoint {
    date: string
    label: string
    income: number
    profit: number
    transactions: number
}

export interface RecentSaleItem {
    id: string
    displayCode: string
    timeFormatted: string
    channel: string
    paymentMethod: string
    total: number
    status: string
}

export interface QuickNotificationItem {
    id: string
    type: 'stock' | 'receivable' | 'subscription'
    title: string
    description: string
    linkHref: string
}

export interface FinancialSummaryData {
    currentCash: number
    totalReceivables: number
    totalDebts: number
    initialCapital: number
}

export interface ActivityTimelineItem {
    id: string
    type: 'purchase' | 'sale' | 'stock'
    title: string
    detail: string
    timeFormatted: string
    amountFormatted?: string
}

export interface DashboardClientProps {
    userName: string
    isOwner: boolean
    activeBranchName?: string
    currentDateDisplay: string
    dateRangeLabel: string
    dateRangeCode: string
    startDateStr: string
    endDateStr: string
    metrics: DashboardMetricData
    chartData: ChartPoint[]
    recentSales: RecentSaleItem[]
    notifications: QuickNotificationItem[]
    financials: FinancialSummaryData
    recentActivities: ActivityTimelineItem[]
}

function fmt(n: number) {
    return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

// Generate smooth cubic bezier SVG path
function generateSplinePath(points: { x: number; y: number }[]): string {
    if (points.length === 0) return ''
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
    if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`

    let d = `M ${points[0].x} ${points[0].y}`
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i === 0 ? 0 : i - 1]
        const p1 = points[i]
        const p2 = points[i + 1]
        const p3 = points[i + 2 < points.length ? i + 2 : i + 1]

        const cp1x = p1.x + (p2.x - p0.x) / 6
        const cp1y = p1.y + (p2.y - p0.y) / 6
        const cp2x = p2.x - (p3.x - p1.x) / 6
        const cp2y = p2.y - (p3.y - p1.y) / 6

        d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
    }
    return d
}


export default function DashboardClient({
    userName,
    isOwner,
    activeBranchName,
    currentDateDisplay,
    dateRangeLabel,
    dateRangeCode,
    startDateStr,
    endDateStr,
    metrics,
    chartData,
    recentSales,
    notifications,
    financials,
    recentActivities,
}: DashboardClientProps) {
    const router = useRouter()
    const [chartMetric, setChartMetric] = useState<'income' | 'profit' | 'transactions'>('income')
    const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null)
    const [dateMenuOpen, setDateMenuOpen] = useState(false)
    const [customModalOpen, setCustomModalOpen] = useState(false)
    const [inputStart, setInputStart] = useState(startDateStr)
    const [inputEnd, setInputEnd] = useState(endDateStr)

    const rawName = userName || 'Partner'
    const cleanName = rawName.includes('@') ? rawName.split('@')[0] : rawName
    const firstName = cleanName ? cleanName.split(' ')[0] : 'Partner'

    // Handle preset select
    const handlePresetChange = (rangeKey: string) => {
        setDateMenuOpen(false)
        if (rangeKey === 'custom') {
            setCustomModalOpen(true)
            return
        }
        router.push(`/dashboard?range=${rangeKey}`)
    }

    const handleApplyCustomDate = (e: React.FormEvent) => {
        e.preventDefault()
        if (!inputStart || !inputEnd) return
        setCustomModalOpen(false)
        router.push(`/dashboard?range=custom&start=${inputStart}&end=${inputEnd}`)
    }

    // Chart dimensions
    const svgWidth = 640
    const svgHeight = 220
    const padX = 24
    const padTop = 16
    const padBottom = 28

    // Chart scaling
    const maxIncome = Math.max(...chartData.map((d) => d.income), 100000)
    const maxProfit = Math.max(...chartData.map((d) => d.profit), 50000)
    const maxTrans = Math.max(...chartData.map((d) => d.transactions), 5)

    // Axis max ceiling rounded up
    let axisMax = Math.max(maxIncome, maxProfit)
    if (chartMetric === 'transactions') {
        axisMax = Math.ceil(maxTrans * 1.2)
    } else {
        // Round to nice ceiling e.g. 8.000.000
        const magnitude = Math.pow(10, Math.floor(Math.log10(axisMax)))
        axisMax = Math.ceil((axisMax * 1.2) / magnitude) * magnitude
    }

    const usableWidth = svgWidth - padX * 2
    const usableHeight = svgHeight - padTop - padBottom

    const getX = (idx: number) => {
        if (chartData.length <= 1) return svgWidth / 2
        return padX + (idx / (chartData.length - 1)) * usableWidth
    }

    const getY = (val: number, maxVal: number) => {
        const normalized = Math.max(0, val) / (maxVal || 1)
        return padTop + usableHeight - normalized * usableHeight
    }

    // Points for Omzet
    const incomePoints = chartData.map((d, i) => ({
        x: getX(i),
        y: getY(d.income, axisMax),
    }))
    const incomePath = generateSplinePath(incomePoints)
    const incomeAreaPath =
        incomePoints.length > 0
            ? `${incomePath} L ${incomePoints[incomePoints.length - 1].x} ${padTop + usableHeight} L ${incomePoints[0].x} ${padTop + usableHeight} Z`
            : ''

    // Points for Laba Bersih
    const profitPoints = chartData.map((d, i) => ({
        x: getX(i),
        y: getY(d.profit, axisMax),
    }))
    const profitPath = generateSplinePath(profitPoints)

    // Points for Transactions
    const _transPoints = chartData.map((d, i) => ({
        x: getX(i),
        y: getY(d.transactions, axisMax),
    }))

    // Y Axis levels
    const yAxisTicks = [
        axisMax,
        axisMax * 0.75,
        axisMax * 0.5,
        axisMax * 0.25,
        0,
    ]

    return (
        <div className="space-y-6 pb-12 font-sans">
            {/* ── Top Welcome & Date Filter Row ── */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
                <div className="min-w-0">
                    <h1 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight break-words">
                        <span className="truncate max-w-full">Selamat datang, {firstName}!</span>
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1 truncate max-w-full">
                        Berikut ringkasan bisnis kamu {activeBranchName && activeBranchName !== 'Semua Cabang' ? `di ${activeBranchName}` : 'seluruh cabang'} {dateRangeLabel === 'Hari ini' ? 'hari ini.' : `periode ${dateRangeLabel.toLowerCase()}.`}
                    </p>
                </div>

                {/* Right Date Badge & Filter Dropdown */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                    {/* Current calendar date pill */}
                    <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white border border-slate-200/80 text-[11px] sm:text-xs font-medium text-slate-700 shadow-2xs">
                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>{currentDateDisplay}</span>
                    </div>

                    {/* Date filter dropdown */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setDateMenuOpen(!dateMenuOpen)}
                            className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white border border-slate-200/80 hover:bg-slate-50 text-[11px] sm:text-xs font-semibold text-slate-800 transition cursor-pointer shadow-2xs"
                        >
                            <span>{dateRangeLabel}</span>
                            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {dateMenuOpen && (
                            <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
                                <button
                                    type="button"
                                    onClick={() => handlePresetChange('today')}
                                    className={`w-full text-left px-3.5 py-2 text-xs font-medium transition cursor-pointer flex items-center justify-between ${
                                        dateRangeCode === 'today' ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <span>Hari ini</span>
                                    {dateRangeCode === 'today' && <span className="text-emerald-600">✓</span>}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePresetChange('7days')}
                                    className={`w-full text-left px-3.5 py-2 text-xs font-medium transition cursor-pointer flex items-center justify-between ${
                                        dateRangeCode === '7days' ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <span>7 hari terakhir</span>
                                    {dateRangeCode === '7days' && <span className="text-emerald-600">✓</span>}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePresetChange('30days')}
                                    className={`w-full text-left px-3.5 py-2 text-xs font-medium transition cursor-pointer flex items-center justify-between ${
                                        dateRangeCode === '30days' ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <span>30 hari terakhir</span>
                                    {dateRangeCode === '30days' && <span className="text-emerald-600">✓</span>}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePresetChange('month')}
                                    className={`w-full text-left px-3.5 py-2 text-xs font-medium transition cursor-pointer flex items-center justify-between ${
                                        dateRangeCode === 'month' ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <span>Bulan ini</span>
                                    {dateRangeCode === 'month' && <span className="text-emerald-600">✓</span>}
                                </button>
                                <div className="border-t border-slate-100 my-1" />
                                <button
                                    type="button"
                                    onClick={() => handlePresetChange('custom')}
                                    className={`w-full text-left px-3.5 py-2 text-xs font-medium transition cursor-pointer flex items-center justify-between ${
                                        dateRangeCode === 'custom' ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-emerald-700 hover:bg-emerald-50/60'
                                    }`}
                                >
                                    <span>Pilih Tanggal Sendiri...</span>
                                    <span className="text-slate-400">📅</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Custom Date Range Modal (Owner Pick Dates) ── */}
            {customModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-900">Pilih Rentang Tanggal</h3>
                            <button
                                type="button"
                                onClick={() => setCustomModalOpen(false)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>
                        <form onSubmit={handleApplyCustomDate} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Tanggal Mulai
                                    </label>
                                    <input
                                        type="date"
                                        value={inputStart}
                                        onChange={(e) => setInputStart(e.target.value)}
                                        required
                                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Tanggal Selesai
                                    </label>
                                    <input
                                        type="date"
                                        value={inputEnd}
                                        onChange={(e) => setInputEnd(e.target.value)}
                                        required
                                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setCustomModalOpen(false)}
                                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition cursor-pointer"
                                >
                                    Terapkan Filter
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── 4 Top KPI Cards (Clean & Compact 2-Kolom Mobile, 4-Kolom Desktop) ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
                {/* 1. Omzet Penjualan */}
                <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 shadow-2xs hover:border-slate-300 transition min-w-0">
                    <p className="text-xs font-medium text-slate-500 truncate">Omzet Penjualan</p>
                    <h3 className="text-base sm:text-xl font-bold tabular-nums text-slate-900 mt-1 truncate">
                        {fmt(metrics.omzet)}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1 truncate flex items-center gap-1">
                        <span className={`font-semibold ${metrics.isOmzetUp ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {metrics.isOmzetUp ? '↑' : '↓'} {Math.abs(metrics.omzetChangePct)}%
                        </span>
                        <span className="text-slate-400 truncate">
                            {dateRangeCode === 'today' ? 'dari kemarin' : 'vs lalu'}
                        </span>
                    </p>
                </div>

                {/* 2. Laba Bersih (Khusus Owner) / Transaksi Tunai (Khusus Pegawai) */}
                {isOwner ? (
                    <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 shadow-2xs hover:border-slate-300 transition min-w-0">
                        <p className="text-xs font-medium text-slate-500 truncate">Laba Bersih</p>
                        <h3 className="text-base sm:text-xl font-bold tabular-nums text-slate-900 mt-1 truncate">
                            {fmt(metrics.netProfit)}
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-1 truncate flex items-center gap-1">
                            <span className={`font-semibold ${metrics.isProfitUp ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {metrics.isProfitUp ? '↑' : '↓'} {Math.abs(metrics.profitChangePct)}%
                            </span>
                            <span className="text-slate-400 truncate">
                                {dateRangeCode === 'today' ? 'dari kemarin' : 'vs lalu'}
                            </span>
                        </p>
                    </div>
                ) : (
                    <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 shadow-2xs hover:border-slate-300 transition min-w-0">
                        <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-medium text-slate-500 truncate">Penjualan Tunai</p>
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0 uppercase">
                                Kasir
                            </span>
                        </div>
                        <h3 className="text-base sm:text-xl font-bold tabular-nums text-slate-900 mt-1 truncate">
                            {fmt(metrics.cashSalesTotal || 0)}
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-1 truncate">
                            {metrics.cashSalesCount || 0} tunai • Non: {fmt(metrics.nonCashSalesTotal || 0)}
                        </p>
                    </div>
                )}

                {/* 3. Total Transaksi */}
                <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 shadow-2xs hover:border-slate-300 transition min-w-0">
                    <p className="text-xs font-medium text-slate-500 truncate">Total Transaksi</p>
                    <h3 className="text-base sm:text-xl font-bold tabular-nums text-slate-900 mt-1 truncate">
                        {metrics.totalTransactions} <span className="text-xs font-normal text-slate-400">order</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1 truncate flex items-center gap-1">
                        <span className={`font-semibold ${metrics.isTransUp ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {metrics.isTransUp ? '↑' : '↓'} {Math.abs(metrics.transChangePct)}%
                        </span>
                        <span className="text-slate-400 truncate">
                            {dateRangeCode === 'today' ? 'dari kemarin' : 'vs lalu'}
                        </span>
                    </p>
                </div>

                {/* 4. Stok Menipis */}
                <Link
                    href="/dashboard/produk"
                    className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 shadow-2xs hover:border-amber-300 transition block group min-w-0"
                >
                    <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-medium text-slate-500 truncate">Stok Menipis</p>
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    </div>
                    <h3 className="text-base sm:text-xl font-bold tabular-nums text-slate-900 mt-1 truncate">
                        {metrics.lowStockCount} <span className="text-xs font-normal text-slate-400">item</span>
                    </h3>
                    <p className="text-[11px] text-rose-600 font-medium mt-1 truncate flex items-center gap-1">
                        <span>{metrics.lowStockCount > 0 ? 'Perlu restock' : 'Semua aman'}</span>
                    </p>
                </Link>
            </div>

            {/* ── Row 1: Left 2/3 Grafik Penjualan & Laba Bersih | Right 1/3 Transaksi Terbaru ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left 8 Cols: Chart */}
                <div className="lg:col-span-8 bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-2xs">
                    {/* Chart Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 mb-4 sm:mb-5">
                        <h3 className="text-sm sm:text-base font-bold text-slate-900">
                            {isOwner ? 'Grafik Penjualan & Laba Bersih' : 'Grafik Penjualan Cabang'}
                        </h3>
                        <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-xl bg-slate-50 border border-slate-200 text-[11px] sm:text-xs font-medium text-slate-600">
                            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>{chartData.length > 0 ? `${chartData[0].label} - ${chartData[chartData.length - 1].label}` : dateRangeLabel}</span>
                        </div>
                    </div>

                    {/* Chart Action Tabs & Legends */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 mb-4 sm:mb-6">
                        {/* Tabs */}
                        <div className="inline-flex p-1 bg-slate-100/80 rounded-xl gap-1 overflow-x-auto">
                            <button
                                type="button"
                                onClick={() => setChartMetric('income')}
                                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition cursor-pointer ${
                                    chartMetric === 'income'
                                        ? 'bg-[#06281b] text-white shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                Penjualan
                            </button>
                            {isOwner && (
                                <button
                                    type="button"
                                    onClick={() => setChartMetric('profit')}
                                    className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition cursor-pointer ${
                                        chartMetric === 'profit'
                                            ? 'bg-[#06281b] text-white shadow-xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    Laba Bersih
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setChartMetric('transactions')}
                                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition cursor-pointer ${
                                    chartMetric === 'transactions'
                                        ? 'bg-[#06281b] text-white shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                Transaksi
                            </button>
                        </div>

                        {/* Legends */}
                        <div className="flex items-center gap-3 sm:gap-4 text-[11px] sm:text-xs font-medium text-slate-600">
                            <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#059669]"></span>
                                <span>Omzet</span>
                            </div>
                            {isOwner && (
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-[#34d399]"></span>
                                    <span>Laba Bersih</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* SVG Area Chart Container */}
                    <div className="relative w-full h-[200px] sm:h-[230px]">
                        {/* Y-axis Labels on Left */}
                        <div className="absolute inset-y-0 left-0 w-14 sm:w-24 flex flex-col justify-between text-[9px] sm:text-[11px] text-slate-400 select-none pb-7 pt-2 pr-1.5 sm:pr-2 text-right">
                            {yAxisTicks.map((val, idx) => (
                                <span key={idx}>
                                    {chartMetric === 'transactions' ? Math.round(val) : fmt(val)}
                                </span>
                            ))}
                        </div>

                        {/* Chart SVG with Gridlines and Curves */}
                        <div className="absolute inset-0 pl-14 sm:pl-24">
                            <svg
                                className="w-full h-full overflow-visible"
                                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                                preserveAspectRatio="none"
                            >
                                <defs>
                                    <linearGradient id="omzetGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#059669" stopOpacity="0.18" />
                                        <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
                                    </linearGradient>
                                </defs>

                                {/* Horizontal Grid lines */}
                                {yAxisTicks.map((val, idx) => {
                                    const y = getY(val, axisMax)
                                    return (
                                        <line
                                            key={idx}
                                            x1={padX}
                                            y1={y}
                                            x2={svgWidth - padX}
                                            y2={y}
                                            stroke="#f1f5f9"
                                            strokeWidth={1}
                                        />
                                    )
                                })}

                                {/* Area Fill */}
                                {incomeAreaPath && (
                                    <path d={incomeAreaPath} fill="url(#omzetGradient)" />
                                )}

                                {/* Curve: Omzet */}
                                {incomePath && (
                                    <path
                                        d={incomePath}
                                        fill="none"
                                        stroke="#059669"
                                        strokeWidth={2.5}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                )}

                                {/* Curve: Laba Bersih */}
                                {profitPath && (
                                    <path
                                        d={profitPath}
                                        fill="none"
                                        stroke="#34d399"
                                        strokeWidth={2}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                )}

                                {/* Circles on points for Omzet */}
                                {incomePoints.map((pt, i) => (
                                    <g key={i}>
                                        <circle
                                            cx={pt.x}
                                            cy={pt.y}
                                            r={hoveredPointIdx === i ? 5 : 3.5}
                                            fill="#059669"
                                            stroke="#ffffff"
                                            strokeWidth={2}
                                            className="transition-all cursor-pointer"
                                            onMouseEnter={() => setHoveredPointIdx(i)}
                                            onMouseLeave={() => setHoveredPointIdx(null)}
                                        />
                                    </g>
                                ))}

                                {/* Circles on points for Laba Bersih */}
                                {profitPoints.map((pt, i) => (
                                    <circle
                                        key={i}
                                        cx={pt.x}
                                        cy={pt.y}
                                        r={hoveredPointIdx === i ? 4.5 : 3}
                                        fill="#34d399"
                                        stroke="#ffffff"
                                        strokeWidth={1.5}
                                        className="transition-all cursor-pointer"
                                        onMouseEnter={() => setHoveredPointIdx(i)}
                                        onMouseLeave={() => setHoveredPointIdx(null)}
                                    />
                                ))}

                                {/* X-axis Date labels */}
                                {chartData.map((d, i) => {
                                    const x = getX(i)
                                    return (
                                        <text
                                            key={i}
                                            x={x}
                                            y={svgHeight - 4}
                                            textAnchor="middle"
                                            className="text-[10px] fill-slate-400 font-medium"
                                        >
                                            {d.label}
                                        </text>
                                    )
                                })}
                            </svg>

                            {/* Hover Tooltip */}
                            {hoveredPointIdx !== null && chartData[hoveredPointIdx] && (
                                <div
                                    className="absolute -top-12 transform -translate-x-1/2 bg-slate-900/95 text-white text-[11px] rounded-xl px-3 py-1.5 shadow-xl pointer-events-none z-20 whitespace-nowrap border border-slate-800"
                                    style={{
                                        left: `${(getX(hoveredPointIdx) / svgWidth) * 100}%`,
                                    }}
                                >
                                    <p className="font-bold text-slate-300">{chartData[hoveredPointIdx].label}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-emerald-400 font-semibold">Omzet: {fmt(chartData[hoveredPointIdx].income)}</span>
                                        <span className="text-slate-400">•</span>
                                        <span className="text-teal-300 font-semibold">Laba: {fmt(chartData[hoveredPointIdx].profit)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right 4 Cols: Transaksi Terbaru */}
                <div className="lg:col-span-4 bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-2xs flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm sm:text-base font-bold text-slate-900">Transaksi Terbaru</h3>
                            <Link
                                href="/dashboard/penjualan/riwayat"
                                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
                            >
                                Lihat Semua →
                            </Link>
                        </div>

                        {/* List 5 Recent Transactions */}
                        <div className="divide-y divide-slate-100">
                            {recentSales.map((sale) => (
                                <div
                                    key={sale.id}
                                    className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 group"
                                >
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold font-mono text-slate-900 group-hover:text-emerald-800 transition truncate">
                                            {sale.displayCode}
                                        </p>
                                        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                                            <span>{sale.timeFormatted}</span>
                                            <span>•</span>
                                            <span className="text-slate-600 font-medium">{sale.paymentMethod}</span>
                                        </p>
                                    </div>

                                    <div className="text-right shrink-0 ml-3">
                                        <p className="text-xs font-bold text-slate-900 tabular-nums">
                                            {fmt(sale.total)}
                                        </p>
                                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                            sale.status === 'credit'
                                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                        }`}>
                                            {sale.status === 'credit' ? 'Tempo' : 'Selesai'}
                                        </span>
                                    </div>
                                </div>
                            ))}

                            {recentSales.length === 0 && (
                                <div className="text-center py-8 text-xs text-slate-400">
                                    Belum ada transaksi pada periode ini.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Row 2: Left 2/3 Aksi Cepat | Right 1/3 Pengingat & Notifikasi ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
                {/* Left 8 Cols: Aksi Cepat */}
                <div className="lg:col-span-8 bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-2xs">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-3 sm:mb-4">Aksi Cepat</h3>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3.5">
                        {/* 1. Transaksi Penjualan */}
                        <Link
                            href="/dashboard/penjualan"
                            className="p-3 sm:p-4 rounded-xl border border-slate-100 hover:border-emerald-300 hover:bg-emerald-50/20 transition group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3"
                        >
                            <div className="flex items-center gap-2.5 sm:gap-3">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-slate-900 line-clamp-1">Mulai Kasir</h4>
                                    <p className="text-[10px] sm:text-[11px] text-slate-400 line-clamp-1">Catat struk POS</p>
                                </div>
                            </div>
                            <span className="hidden sm:inline text-slate-300 group-hover:text-emerald-600 transition">→</span>
                        </Link>

                        {/* 2. Riwayat Transaksi (Akses Cepat Kasir) */}
                        <Link
                            href="/dashboard/penjualan/riwayat"
                            className="p-3 sm:p-4 rounded-xl border border-slate-100 hover:border-emerald-300 hover:bg-emerald-50/20 transition group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3"
                        >
                            <div className="flex items-center gap-2.5 sm:gap-3">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-slate-900 line-clamp-1">Riwayat Transaksi</h4>
                                    <p className="text-[10px] sm:text-[11px] text-slate-400 line-clamp-1">Cek struk & rekap</p>
                                </div>
                            </div>
                            <span className="hidden sm:inline text-slate-300 group-hover:text-emerald-600 transition">→</span>
                        </Link>

                        {/* 3. Pembelian Bahan (Khusus Owner) */}
                        {isOwner && (
                            <Link
                                href="/dashboard/bahan-baku?tab=pembelian"
                                className="p-3 sm:p-4 rounded-xl border border-slate-100 hover:border-emerald-300 hover:bg-emerald-50/20 transition group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3"
                            >
                                <div className="flex items-center gap-2.5 sm:gap-3">
                                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-xs font-bold text-slate-900 line-clamp-1">Pembelian Bahan</h4>
                                        <p className="text-[10px] sm:text-[11px] text-slate-400 line-clamp-1">Catat belanja</p>
                                    </div>
                                </div>
                                <span className="hidden sm:inline text-slate-300 group-hover:text-purple-600 transition">→</span>
                            </Link>
                        )}

                        {/* 4. Stok Barang */}
                        <Link
                            href="/dashboard/produk"
                            className="p-3 sm:p-4 rounded-xl border border-slate-100 hover:border-amber-300 hover:bg-amber-50/20 transition group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3"
                        >
                            <div className="flex items-center gap-2.5 sm:gap-3">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-slate-900 line-clamp-1">Stok Produk</h4>
                                    <p className="text-[10px] sm:text-[11px] text-slate-400 line-clamp-1">Cek persediaan</p>
                                </div>
                            </div>
                            <span className="hidden sm:inline text-slate-300 group-hover:text-amber-600 transition">→</span>
                        </Link>

                        {/* 5. Laporan Keuangan (Khusus Owner) */}
                        {isOwner && (
                            <Link
                                href="/dashboard/keuangan"
                                className="p-3 sm:p-4 rounded-xl border border-slate-100 hover:border-emerald-300 hover:bg-emerald-50/20 transition group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3"
                            >
                                <div className="flex items-center gap-2.5 sm:gap-3">
                                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                        </svg>
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-xs font-bold text-slate-900 line-clamp-1">Laporan Keuangan</h4>
                                        <p className="text-[10px] sm:text-[11px] text-slate-400 line-clamp-1">Lihat laporan</p>
                                    </div>
                                </div>
                                <span className="hidden sm:inline text-slate-300 group-hover:text-emerald-600 transition">→</span>
                            </Link>
                        )}

                        {/* 6. Data Pelanggan */}
                        <Link
                            href="/dashboard/pelanggan"
                            className="p-3 sm:p-4 rounded-xl border border-slate-100 hover:border-emerald-300 hover:bg-emerald-50/20 transition group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3"
                        >
                            <div className="flex items-center gap-2.5 sm:gap-3">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-slate-900 line-clamp-1">Data Pelanggan</h4>
                                    <p className="text-[10px] sm:text-[11px] text-slate-400 line-clamp-1">Kelola pelanggan</p>
                                </div>
                            </div>
                            <span className="hidden sm:inline text-slate-300 group-hover:text-emerald-600 transition">→</span>
                        </Link>

                        {/* 7. Tambah Cabang (Khusus Owner) */}
                        {isOwner && (
                            <Link
                                href="/dashboard/cabang"
                                className="p-3 sm:p-4 rounded-xl border border-slate-100 hover:border-purple-300 hover:bg-purple-50/20 transition group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3"
                            >
                                <div className="flex items-center gap-2.5 sm:gap-3">
                                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                        </svg>
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-xs font-bold text-slate-900 line-clamp-1">Tambah Cabang</h4>
                                        <p className="text-[10px] sm:text-[11px] text-slate-400 line-clamp-1">Buat cabang baru</p>
                                    </div>
                                </div>
                                <span className="hidden sm:inline text-slate-300 group-hover:text-purple-600 transition">→</span>
                            </Link>
                        )}
                    </div>
                </div>

                {/* Right 4 Cols: Pengingat & Notifikasi */}
                <div className="lg:col-span-4 bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-2xs">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm sm:text-base font-bold text-slate-900">Pengingat & Notifikasi</h3>
                        <Link
                            href={isOwner ? '/dashboard/keuangan' : '/dashboard/produk'}
                            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
                        >
                            Lihat Semua →
                        </Link>
                    </div>

                    <div className="space-y-3.5">
                        {notifications.map((notif) => (
                            <div
                                key={notif.id}
                                className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-slate-50 transition"
                            >
                                <div className="flex items-start gap-3 min-w-0">
                                    <div
                                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                                            notif.type === 'stock'
                                                ? 'bg-rose-50 text-rose-500'
                                                : notif.type === 'receivable'
                                                ? 'bg-amber-50 text-amber-500'
                                                : 'bg-blue-50 text-blue-500'
                                        }`}
                                    >
                                        {notif.type === 'stock' ? (
                                            <span className="text-sm font-bold">▲</span>
                                        ) : notif.type === 'receivable' ? (
                                            <span className="text-sm font-bold">⏱</span>
                                        ) : (
                                            <span className="text-sm font-bold">ⓘ</span>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-800 leading-snug">
                                            {notif.title}
                                        </p>
                                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                            {notif.description}
                                        </p>
                                    </div>
                                </div>

                                <Link
                                    href={notif.linkHref}
                                    className="px-3 py-1 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition shrink-0"
                                >
                                    Lihat
                                </Link>
                            </div>
                        ))}

                        {notifications.length === 0 && (
                            <div className="text-center py-6 text-xs text-slate-400">
                                Tidak ada pengingat mendesak saat ini.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Row 3: Ringkasan Keuangan (Khusus Owner) & Aktivitas Terakhir ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left 8 Cols: Ringkasan Keuangan (Hanya Owner) */}
                {isOwner && (
                    <div className="lg:col-span-8 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs">
                        <div className="flex items-center gap-1.5 mb-4">
                            <h3 className="text-base font-bold text-slate-900">Ringkasan Keuangan</h3>
                            <span
                                title="Posisi saldo riil kas, piutang, hutang, dan modal usaha"
                                className="text-xs text-slate-400 cursor-help"
                            >
                                ⓘ
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                            {/* 1. Kas Saat Ini */}
                            <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-emerald-600">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                    </span>
                                    <span className="text-xs text-slate-500 font-medium">Kas Saat Ini</span>
                                </div>
                                <h4 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                                    {fmt(financials.currentCash)}
                                </h4>
                            </div>

                            {/* 2. Piutang */}
                            <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-emerald-600">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    </span>
                                    <span className="text-xs text-slate-500 font-medium">Piutang</span>
                                </div>
                                <h4 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                                    {fmt(financials.totalReceivables)}
                                </h4>
                            </div>

                            {/* 3. Hutang */}
                            <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-slate-400">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </span>
                                    <span className="text-xs text-slate-500 font-medium">Hutang</span>
                                </div>
                                <h4 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                                    {fmt(financials.totalDebts)}
                                </h4>
                            </div>

                            {/* 4. Modal Awal */}
                            <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-emerald-600">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                                        </svg>
                                    </span>
                                    <span className="text-xs text-slate-500 font-medium">Modal Awal</span>
                                </div>
                                <h4 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                                    {fmt(financials.initialCapital)}
                                </h4>
                            </div>
                        </div>
                    </div>
                )}

                {/* Right 4 Cols (Owner) or 12 Cols (Pegawai): Aktivitas Terakhir */}
                <div className={`${isOwner ? 'lg:col-span-4' : 'lg:col-span-12'} bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs`}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-bold text-slate-900">Aktivitas Terakhir</h3>
                        <Link
                            href="/dashboard/penjualan/riwayat"
                            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
                        >
                            Lihat Semua →
                        </Link>
                    </div>

                    <div className="space-y-3.5">
                        {recentActivities.map((act) => (
                            <div key={act.id} className="flex items-center gap-3">
                                <div
                                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                        act.type === 'purchase'
                                            ? 'bg-purple-50 text-purple-600'
                                            : act.type === 'sale'
                                            ? 'bg-emerald-50 text-emerald-600'
                                            : 'bg-amber-50 text-amber-600'
                                    }`}
                                >
                                    {act.type === 'purchase' ? (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                        </svg>
                                    ) : act.type === 'sale' ? (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                        </svg>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-slate-800 truncate">
                                        {act.title}
                                    </p>
                                    <p className="text-[10px] text-slate-400 truncate">
                                        {act.timeFormatted} {act.amountFormatted ? `• ${act.amountFormatted}` : ''}
                                    </p>
                                </div>
                            </div>
                        ))}

                        {recentActivities.length === 0 && (
                            <div className="text-center py-6 text-xs text-slate-400">
                                Belum ada aktivitas tercatat.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
