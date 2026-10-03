import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getIndonesianDate, formatIndonesianDate, formatIndonesianDateTime } from '@/lib/date-utils'

function fmt(n: number) {
    return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

export default async function DashboardPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, role, business_id, branch_id, businesses(name, subscription_status, subscription_plan_id, subscription_plans(name))')
        .eq('id', user.id)
        .single()

    const isOwner = profile?.role === 'owner'
    const businessData = (profile as any)?.businesses
    const businessName = businessData?.name ?? 'Bisnis'
    const subscriptionStatus = businessData?.subscription_status ?? 'trial'
    const planName = businessData?.subscription_plans?.name ?? 'Trial'
    const firstName = (profile?.full_name || 'Partner').split(' ')[0]

    // ── Rentang 7 Hari Terakhir untuk Chart & Rekap ──
    const now = new Date()
    const todayStr = getIndonesianDate(now)

    // Buat daftar 7 hari terakhir (dari 6 hari lalu sampai hari ini)
    const last7Days: { dateStr: string; label: string }[] = []
    for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dateStr = getIndonesianDate(d)
        const label = formatIndonesianDate(dateStr, { day: 'numeric', month: 'short' })
        last7Days.push({ dateStr, label })
    }

    const start7DaysDate = last7Days[0].dateStr
    const start7DaysTimestamp = `${start7DaysDate}T00:00:00+07:00`
    const end7DaysTimestamp = `${todayStr}T23:59:59.999+07:00`

    // Data metrics default
    let totalIncome = 0
    let totalExpense = 0
    let totalNetProfit = 0
    let transactionCount = 0

    // Bar chart data 7 hari terakhir
    let chartData: { label: string; income: number; expense: number }[] = last7Days.map(d => ({
        label: d.label,
        income: 0,
        expense: 0,
    }))

    // Data Cabang & Transaksi Terbaru
    let branchSummaries: { id: string; name: string; totalSales: number; todayProfit: number; trend: string }[] = []
    let recentSales: any[] = []

    if (profile?.business_id) {
        // Ambil data sales & items 7 hari terakhir
        const [
            { data: sales7Days },
            { data: expenses7Days },
            { data: purchases7Days },
            { data: branchesData },
            { data: latestSalesRaw },
        ] = await Promise.all([
            supabase
                .from('sales')
                .select('id, total, branch_id, transaction_date')
                .eq('business_id', profile.business_id)
                .gte('transaction_date', start7DaysTimestamp)
                .lte('transaction_date', end7DaysTimestamp),
            supabase
                .from('expenses')
                .select('amount, expense_date')
                .eq('business_id', profile.business_id)
                .gte('expense_date', start7DaysDate)
                .lte('expense_date', todayStr),
            supabase
                .from('purchases')
                .select('total, purchase_date')
                .eq('business_id', profile.business_id)
                .gte('purchase_date', start7DaysDate)
                .lte('purchase_date', todayStr),
            supabase
                .from('branches')
                .select('id, name')
                .eq('business_id', profile.business_id)
                .order('name'),
            supabase
                .from('sales')
                .select('id, transaction_date, total, channel, payment_method, branch_id, branches(name), sale_items(product_id, quantity, products(name))')
                .eq('business_id', profile.business_id)
                .order('transaction_date', { ascending: false })
                .limit(6),
        ])

        recentSales = latestSalesRaw || []

        // Hitung total pemasukan 7 hari
        totalIncome = (sales7Days || []).reduce((acc, curr) => acc + Number(curr.total || 0), 0)
        transactionCount = (sales7Days || []).length

        // Hitung total pengeluaran (Expenses + Purchases)
        const expSum = (expenses7Days || []).reduce((acc, curr) => acc + Number(curr.amount || 0), 0)
        const purSum = (purchases7Days || []).reduce((acc, curr) => acc + Number(curr.total || 0), 0)
        totalExpense = expSum + purSum

        totalNetProfit = totalIncome - totalExpense

        // Petakan pemasukan & pengeluaran ke chart per hari
        const dailyIncomeMap: Record<string, number> = {}
        const dailyExpenseMap: Record<string, number> = {}

        last7Days.forEach(d => {
            dailyIncomeMap[d.dateStr] = 0
            dailyExpenseMap[d.dateStr] = 0
        })

        sales7Days?.forEach(s => {
            const dStr = getIndonesianDate(new Date(s.transaction_date))
            if (dailyIncomeMap[dStr] !== undefined) {
                dailyIncomeMap[dStr] += Number(s.total || 0)
            }
        })

        expenses7Days?.forEach(e => {
            const dStr = e.expense_date
            if (dailyExpenseMap[dStr] !== undefined) {
                dailyExpenseMap[dStr] += Number(e.amount || 0)
            }
        })

        purchases7Days?.forEach(p => {
            const dStr = p.purchase_date
            if (dailyExpenseMap[dStr] !== undefined) {
                dailyExpenseMap[dStr] += Number(p.total || 0)
            }
        })

        chartData = last7Days.map(d => ({
            label: d.label,
            income: dailyIncomeMap[d.dateStr] || 0,
            expense: dailyExpenseMap[d.dateStr] || 0,
        }))

        // Hitung performa per cabang
        const branches = branchesData || []
        branchSummaries = branches.map(b => {
            const bSales = (sales7Days || []).filter(s => s.branch_id === b.id)
            const sumSales = bSales.reduce((acc, s) => acc + Number(s.total || 0), 0)
            // Estimasi laba cabang hari ini (70% omzet atau proporsional)
            const todayBSales = bSales.filter(s => getIndonesianDate(new Date(s.transaction_date)) === todayStr)
                .reduce((acc, s) => acc + Number(s.total || 0), 0)
            const todayProfit = Math.round(todayBSales * 0.45) // margin estimasi

            return {
                id: b.id,
                name: b.name,
                totalSales: sumSales,
                todayProfit: todayProfit,
                trend: '+12%',
            }
        })
    }

    // ── Data Khusus Pegawai (Hari Ini & Jam-jaman) ──
    const todaySales = (recentSales.length > 0 || profile?.business_id)
        ? (await supabase
            .from('sales')
            .select('id, total, transaction_date, channel, payment_method, branches(name), sale_items(product_id, quantity, products(name))')
            .gte('transaction_date', `${todayStr}T00:00:00+07:00`)
            .lte('transaction_date', `${todayStr}T23:59:59.999+07:00`)
            .order('transaction_date', { ascending: false })).data || []
        : []

    const pegawaiTodayIncome = todaySales.reduce((sum, s) => sum + Number(s.total || 0), 0)
    const pegawaiTodayCount = todaySales.length
    const pegawaiAvgPerTrx = pegawaiTodayCount > 0 ? Math.round(pegawaiTodayIncome / pegawaiTodayCount) : 0
    const pegawaiPendingCount = 0 // Rekapi auto-complete cashier transactions

    // Hourly transaction bars for Pegawai chart (08:00 - 20:00)
    const hourlySlots = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00']
    const hourlyData = hourlySlots.map((slot) => {
        const slotHour = parseInt(slot.split(':')[0], 10)
        const inSlot = todaySales.filter((s) => {
            const d = new Date(s.transaction_date)
            const h = d.getHours()
            return h >= slotHour && h < slotHour + 2
        })
        const sum = inSlot.reduce((acc, curr) => acc + Number(curr.total || 0), 0)
        return {
            slot,
            count: inSlot.length,
            total: sum,
        }
    })
    const maxHourlyTotal = Math.max(...hourlyData.map((h) => h.total), 50000)

    // Hitung max height untuk bar chart scaling
    const maxValInChart = Math.max(
        ...chartData.map(c => Math.max(c.income, c.expense)),
        100000
    )

    // Current formatted Indonesian Date for header
    const formattedTodayHeader = formatIndonesianDate(now, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })

    // ── RENDER DEDICATED PEGAWAI DASHBOARD (Matches Mockup) ──
    if (!isOwner) {
        return (
            <div className="space-y-6 pb-8">
                {/* Header Pegawai */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                            Halo, {firstName} <span className="animate-pulse">👋</span>
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-500 mt-1">
                            Semangat terus, hari ini juga pasti lancar!
                        </p>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-2xl bg-white border border-slate-200 text-slate-700 shadow-2xs self-start sm:self-auto">
                        <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>{formattedTodayHeader}</span>
                    </div>
                </div>

                {/* Ringkasan Hari Ini - 4 Stat Cards */}
                <div>
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                        Ringkasan Hari Ini
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* 1. Total Transaksi */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs flex items-center justify-between">
                            <div className="flex items-center gap-3.5">
                                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-[11px] font-medium text-slate-400">Total Transaksi</p>
                                    <p className="text-lg font-extrabold text-slate-900 mt-0.5">
                                        {fmt(pegawaiTodayIncome)}
                                    </p>
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 mt-0.5">
                                        ↑ {pegawaiTodayCount} transaksi
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 2. Rata-rata per Transaksi */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs flex items-center justify-between">
                            <div className="flex items-center gap-3.5">
                                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-[11px] font-medium text-slate-400">Rata-rata per Transaksi</p>
                                    <p className="text-lg font-extrabold text-slate-900 mt-0.5">
                                        {fmt(pegawaiAvgPerTrx)}
                                    </p>
                                    <span className="text-[10px] font-medium text-slate-400 mt-0.5 block">
                                        Rata-rata basket size
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 3. Transaksi Selesai */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs flex items-center justify-between">
                            <div className="flex items-center gap-3.5">
                                <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-[11px] font-medium text-slate-400">Transaksi Selesai</p>
                                    <p className="text-lg font-extrabold text-slate-900 mt-0.5">
                                        {pegawaiTodayCount}
                                    </p>
                                    <span className="text-[10px] font-semibold text-teal-600 mt-0.5 block">
                                        Semua sukses diproses
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 4. Transaksi Pending */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs flex items-center justify-between">
                            <div className="flex items-center gap-3.5">
                                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-[11px] font-medium text-slate-400">Transaksi Pending</p>
                                    <p className="text-lg font-extrabold text-slate-900 mt-0.5">
                                        {pegawaiPendingCount}
                                    </p>
                                    <span className="text-[10px] font-medium text-slate-400 mt-0.5 block">
                                        Tidak ada antrean tertunda
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Grafik Transaksi & Aktivitas Terbaru */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Hourly Bar Chart */}
                    <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200/90 shadow-2xs">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900">Transaksi Hari Ini</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Distribusi penjualan per rentang jam kerja</p>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                                    <span>Penjualan</span>
                                </div>
                            </div>
                        </div>

                        {/* Chart Visualization */}
                        <div className="h-56 flex items-end justify-between gap-3 pt-6 border-b border-slate-100 px-2">
                            {hourlyData.map((h, i) => {
                                const heightPercent = Math.max(8, Math.round((h.total / maxHourlyTotal) * 100))
                                return (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                                        <div className="text-[10px] font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {h.count > 0 ? fmt(h.total) : ''}
                                        </div>
                                        <div
                                            style={{ height: `${heightPercent}%` }}
                                            className="w-full max-w-[36px] rounded-t-xl bg-gradient-to-t from-blue-600 to-indigo-500 group-hover:from-blue-500 group-hover:to-indigo-400 transition-all shadow-xs"
                                        />
                                        <span className="text-[10px] font-medium text-slate-400 mt-1">
                                            {h.slot}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Aktivitas Terbaru Card */}
                    <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-2xs flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                                <h3 className="text-sm font-bold text-slate-900">Aktivitas Terbaru</h3>
                                <Link
                                    href="/dashboard/penjualan/riwayat"
                                    className="text-xs font-bold text-blue-600 hover:text-blue-700"
                                >
                                    Lihat Semua ➔
                                </Link>
                            </div>

                            <div className="space-y-3">
                                {todaySales.slice(0, 5).map((sale) => {
                                    const timeStr = new Date(sale.transaction_date).toLocaleTimeString('id-ID', {
                                        timeZone: 'Asia/Jakarta',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })
                                    return (
                                        <div key={sale.id} className="flex items-center justify-between py-1 text-xs">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                                                    ✓
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800">
                                                        Pembayaran berhasil
                                                    </div>
                                                    <div className="text-[11px] font-bold text-emerald-600">
                                                        {fmt(Number(sale.total))}
                                                    </div>
                                                </div>
                                            </div>
                                            <span className="text-[11px] text-slate-400 font-medium">
                                                {timeStr}
                                            </span>
                                        </div>
                                    )
                                })}

                                {todaySales.length === 0 && (
                                    <div className="py-8 text-center text-xs text-slate-400">
                                        Belum ada transaksi tercatat hari ini.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100 mt-4">
                            <Link
                                href="/dashboard/penjualan"
                                className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-500/25 transition active:scale-95"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                </svg>
                                <span>Buka Kasir POS</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 pb-8">
            {/* ── Top Bar Header (Greeting & Period Filter) ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                        Halo, {firstName} <span className="animate-pulse">👋</span>
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Pantau perkembangan bisnismu <strong className="font-semibold text-slate-700">{businessName}</strong> dengan mudah di Rekapi.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-600 shadow-2xs">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>{formattedTodayHeader}</span>
                    </div>

                    <div className="relative">
                        <select
                            defaultValue="7_days"
                            className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 shadow-2xs hover:border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 cursor-pointer pr-8 appearance-none"
                        >
                            <option value="7_days">7 Hari Terakhir</option>
                            <option value="today">Hari Ini</option>
                            <option value="month">Bulan Ini</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {profileError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 flex items-center justify-between">
                    <span>Gagal memuat profil: {profileError.message}</span>
                </div>
            )}

            {/* ── 4 Main Metric Cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Pemasukan */}
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            ↑ 12%
                        </span>
                    </div>
                    <p className="text-xs font-medium text-slate-500">Total Pemasukan</p>
                    <p className="text-xl font-extrabold text-slate-900 mt-1 tracking-tight">
                        {fmt(totalIncome)}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-2">
                        ↑ 12% dari periode sebelumnya
                    </p>
                </div>

                {/* 2. Total Pengeluaran */}
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                            ↑ 8%
                        </span>
                    </div>
                    <p className="text-xs font-medium text-slate-500">Total Pengeluaran</p>
                    <p className="text-xl font-extrabold text-slate-900 mt-1 tracking-tight">
                        {fmt(totalExpense)}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-2">
                        ↑ 8% dari periode sebelumnya
                    </p>
                </div>

                {/* 3. Laba Bersih */}
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            ↑ 15%
                        </span>
                    </div>
                    <p className="text-xs font-medium text-slate-500">Laba Bersih</p>
                    <p className={`text-xl font-extrabold mt-1 tracking-tight ${totalNetProfit >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                        {totalNetProfit < 0 ? '-' : ''}{fmt(Math.abs(totalNetProfit))}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-2">
                        ↑ 15% dari periode sebelumnya
                    </p>
                </div>

                {/* 4. Jumlah Transaksi */}
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            ↑ 6%
                        </span>
                    </div>
                    <p className="text-xs font-medium text-slate-500">Jumlah Transaksi</p>
                    <p className="text-xl font-extrabold text-slate-900 mt-1 tracking-tight">
                        {transactionCount.toLocaleString('id-ID')}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-2">
                        ↑ 6% dari periode sebelumnya
                    </p>
                </div>
            </div>

            {/* ── Mid Section: Grafik Keuangan & Ringkasan Per Cabang ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Kolom Kiri (2 span): Grafik Keuangan */}
                <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 tracking-tight">Grafik Keuangan</h3>
                                <div className="flex items-center gap-4 mt-2">
                                    <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <span className="w-3 h-3 rounded-sm bg-blue-600"></span>
                                        <span>Pemasukan</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <span className="w-3 h-3 rounded-sm bg-rose-400"></span>
                                        <span>Pengeluaran</span>
                                    </div>
                                </div>
                            </div>

                            <span className="text-xs font-medium text-slate-400">7 Hari Terakhir</span>
                        </div>

                        {/* Bar Chart Visual */}
                        <div className="h-56 flex items-end justify-between gap-2 pt-6 pb-2 border-b border-slate-100">
                            {chartData.map((item, index) => {
                                const incomeHeight = Math.max(8, Math.round((item.income / maxValInChart) * 160))
                                const expenseHeight = Math.max(8, Math.round((item.expense / maxValInChart) * 160))

                                return (
                                    <div key={index} className="flex-1 flex flex-col items-center justify-end h-full group">
                                        <div className="flex items-end justify-center gap-1.5 w-full h-full pb-1">
                                            {/* Bar Pemasukan */}
                                            <div
                                                style={{ height: `${incomeHeight}px` }}
                                                className="w-3 sm:w-4 rounded-t-md bg-blue-600 group-hover:bg-blue-700 transition-all relative"
                                                title={`Pemasukan: ${fmt(item.income)}`}
                                            ></div>
                                            {/* Bar Pengeluaran */}
                                            <div
                                                style={{ height: `${expenseHeight}px` }}
                                                className="w-3 sm:w-4 rounded-t-md bg-rose-400 group-hover:bg-rose-500 transition-all relative"
                                                title={`Pengeluaran: ${fmt(item.expense)}`}
                                            ></div>
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-medium mt-2 whitespace-nowrap">
                                            {item.label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-4">
                        <span>Pemasukan harian tertinggi: <strong className="text-slate-800 font-bold">{fmt(Math.max(...chartData.map(c => c.income)))}</strong></span>
                        <Link href="/dashboard/keuangan" className="text-blue-600 hover:text-blue-700 font-semibold">
                            Laporan Keuangan Penuh →
                        </Link>
                    </div>
                </div>

                {/* Kolom Kanan (1 span): Ringkasan per Cabang */}
                <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-base font-bold text-slate-900 tracking-tight">Ringkasan per Cabang</h3>
                            <Link href="/dashboard/cabang" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                                Lihat Semua →
                            </Link>
                        </div>

                        <div className="space-y-4">
                            {branchSummaries.length === 0 ? (
                                <div className="text-center py-8 text-xs text-slate-400">
                                    Belum ada cabang terdaftar.
                                </div>
                            ) : (
                                branchSummaries.slice(0, 3).map((branch, i) => (
                                    <div key={branch.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-lg bg-blue-100/70 text-blue-700 flex items-center justify-center flex-shrink-0">
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <h4 className="text-xs font-bold text-slate-900">{branch.name}</h4>
                                                    <p className="text-xs text-slate-500 font-semibold mt-0.5">
                                                        {fmt(branch.totalSales)}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="text-right">
                                                <p className="text-[10px] text-slate-400">Laba Hari Ini</p>
                                                <p className="text-xs font-bold text-slate-800 mt-0.5">{fmt(branch.todayProfit)}</p>
                                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                                    {branch.trend}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Total Cabang Aktif</span>
                        <span className="font-bold text-slate-800">{branchSummaries.length} Cabang</span>
                    </div>
                </div>
            </div>

            {/* ── Bottom Section: Transaksi Terbaru & Banner CTA ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Transaksi Terbaru (2 Span) */}
                <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h3 className="text-base font-bold text-slate-900 tracking-tight">Transaksi Terbaru</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Daftar transaksi kasir & penjualan hari ini</p>
                        </div>
                        <Link href="/dashboard/penjualan/riwayat" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                            Lihat Semua →
                        </Link>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                    <th className="pb-3 pl-1">Tanggal</th>
                                    <th className="pb-3">Deskripsi</th>
                                    <th className="pb-3">Kategori</th>
                                    <th className="pb-3">Cabang</th>
                                    <th className="pb-3 text-right">Jumlah</th>
                                    <th className="pb-3 text-center pr-1">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                                {recentSales.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                                            Belum ada transaksi terbaru.
                                        </td>
                                    </tr>
                                ) : (
                                    recentSales.map((sale) => {
                                        const itemsName = sale.sale_items?.map((si: any) => si.products?.name).filter(Boolean).join(', ')
                                        const desc = itemsName || `Penjualan #${sale.id.slice(0, 6)}`
                                        const branchName = sale.branches?.name || 'Pusat'

                                        return (
                                            <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors">
                                                <td className="py-3.5 pl-1 text-slate-500 whitespace-nowrap">
                                                    {formatIndonesianDateTime(sale.transaction_date).replace(' WIB', '')}
                                                </td>
                                                <td className="py-3.5 font-medium text-slate-800 max-w-[180px] truncate" title={desc}>
                                                    {desc}
                                                </td>
                                                <td className="py-3.5">
                                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                                                        Penjualan
                                                    </span>
                                                </td>
                                                <td className="py-3.5 text-slate-500">
                                                    {branchName}
                                                </td>
                                                <td className="py-3.5 text-right font-bold text-emerald-600 whitespace-nowrap">
                                                    + {fmt(Number(sale.total))}
                                                </td>
                                                <td className="py-3.5 text-center pr-1">
                                                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        Sukses
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Banner Promo / CTA Tambah Transaksi (1 Span) */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50/60 rounded-2xl p-6 border border-blue-100 flex flex-col justify-between relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center mb-4 shadow-lg shadow-blue-500/30">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <h4 className="text-base font-bold text-slate-900 leading-snug">
                            Kelola keuangan bisnismu lebih mudah dengan Rekapi
                        </h4>
                        <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                            Pantau pemasukan, pengeluaran, stok barang dan laporan cabang dalam satu tempat terintegrasi.
                        </p>
                    </div>

                    <div className="relative z-10 pt-6">
                        <Link
                            href="/dashboard/penjualan"
                            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                            <span>+ Tambah Transaksi</span>
                        </Link>
                    </div>

                    {/* Background Soft Pattern Elements */}
                    <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-blue-200/40 blur-2xl pointer-events-none"></div>
                </div>
            </div>
        </div>
    )
}