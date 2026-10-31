import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getIndonesianDate, formatIndonesianDate } from '@/lib/date-utils'
import { getActiveBranchId } from '@/lib/active-branch'
import DashboardClient, {
    DashboardMetricData,
    ChartPoint,
    RecentSaleItem,
    QuickNotificationItem,
    FinancialSummaryData,
    ActivityTimelineItem,
} from './dashboard-client'

interface ProfileDashboardData {
    full_name: string | null
    role: string | null
    business_id: string | null
    branch_id: string | null
    branches?: { name: string } | null
    businesses?: {
        name: string | null
        subscription_status: string | null
        trial_ends_at: string | null
        subscription_expires_at: string | null
        subscription_plan_id: string | null
        subscription_plans: { name: string; max_branches: number } | null
    } | null
}

interface SaleItemData {
    quantity?: number | null
    cost_price?: number | null
    products?: { name: string } | null
}

interface SaleRowData {
    id: string
    total: number
    transaction_date: string
    channel?: string | null
    payment_method?: string | null
    payment_status?: string | null
    status?: string | null
    branch_id?: string | null
    branches?: { name: string } | null
    sale_items?: SaleItemData[] | null
}

function fmt(n: number) {
    return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

export default async function DashboardPage(props: {
    searchParams?: Promise<{ range?: string; start?: string; end?: string; branch?: string }>
}) {
    const searchParams = props.searchParams ? await props.searchParams : {}
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, business_id, branch_id, branches(name), businesses(name, subscription_status, trial_ends_at, subscription_expires_at, subscription_plan_id, subscription_plans(name, max_branches))')
        .eq('id', user.id)
        .single()

    const prof = profile as unknown as ProfileDashboardData | null
    const isOwner = prof?.role === 'owner'
    const userName = prof?.full_name || user.email || 'Partner'
    const businessData = prof?.businesses
    const planName = businessData?.subscription_plans?.name || (businessData?.subscription_status === 'active' ? 'Pro' : 'Trial')
    const subscriptionExpiresAt = businessData?.subscription_expires_at || businessData?.trial_ends_at || null

    // ── 0. Active Branch Resolution (from Cookie / Fixed Profile) ──
    const cookieBranchId = await getActiveBranchId()
    const activeBranchId = (!isOwner && prof?.branch_id)
        ? prof.branch_id
        : (searchParams.branch || cookieBranchId || 'all')

    let activeBranchName = 'Semua Cabang'
    if (activeBranchId !== 'all') {
        const { data: bData } = await supabase
            .from('branches')
            .select('name')
            .eq('id', activeBranchId)
            .maybeSingle()
        if (bData) activeBranchName = bData.name
    }

    // ── 1. Calculate Active Date Range & Comparison Period ──
    const now = new Date()
    const todayStr = getIndonesianDate(now)

    const range = searchParams.range || '7days'
    let startDateStr = ''
    let endDateStr = todayStr
    let dateRangeLabel = '7 hari terakhir'
    let dateRangeCode = range

    if (range === 'today') {
        startDateStr = todayStr
        endDateStr = todayStr
        dateRangeLabel = 'Hari ini'
    } else if (range === '30days') {
        const d = new Date()
        d.setDate(d.getDate() - 29)
        startDateStr = getIndonesianDate(d)
        dateRangeLabel = '30 hari terakhir'
    } else if (range === 'month') {
        const [year, month] = todayStr.split('-')
        startDateStr = `${year}-${month}-01`
        dateRangeLabel = 'Bulan ini'
    } else if (range === 'custom' && searchParams.start && searchParams.end) {
        startDateStr = searchParams.start
        endDateStr = searchParams.end
        dateRangeCode = 'custom'
        dateRangeLabel = `${formatIndonesianDate(startDateStr, { day: 'numeric', month: 'short' })} - ${formatIndonesianDate(endDateStr, { day: 'numeric', month: 'short' })}`
    } else {
        // default 7 days
        const d = new Date()
        d.setDate(d.getDate() - 6)
        startDateStr = getIndonesianDate(d)
        dateRangeCode = '7days'
        dateRangeLabel = '7 hari terakhir'
    }

    // Previous Comparison Period
    const currentStartMs = new Date(`${startDateStr}T00:00:00+07:00`).getTime()
    const currentEndMs = new Date(`${endDateStr}T23:59:59.999+07:00`).getTime()
    const diffMs = Math.max(86400000, currentEndMs - currentStartMs)

    const prevEndMs = currentStartMs - 1
    const prevStartMs = prevEndMs - diffMs

    const prevStartDateStr = getIndonesianDate(new Date(prevStartMs))
    const prevEndDateStr = getIndonesianDate(new Date(prevEndMs))

    const currentStartTimestamp = `${startDateStr}T00:00:00+07:00`
    const currentEndTimestamp = `${endDateStr}T23:59:59.999+07:00`
    const prevStartTimestamp = `${prevStartDateStr}T00:00:00+07:00`
    const prevEndTimestamp = `${prevEndDateStr}T23:59:59.999+07:00`

    // Build Chart Dates (ensure at least 7 points for smooth dual spline)
    const chartStartMs = Math.min(
        currentStartMs,
        new Date(`${endDateStr}T00:00:00+07:00`).getTime() - 6 * 86400000
    )
    const chartDateList: { dateStr: string; label: string }[] = []
    const dayStepMs = 86400000
    const totalDays = Math.max(1, Math.round((currentEndMs - chartStartMs) / dayStepMs))
    const step = totalDays > 30 ? Math.ceil(totalDays / 20) : 1

    for (let t = chartStartMs; t <= currentEndMs; t += step * dayStepMs) {
        const dStr = getIndonesianDate(new Date(t))
        const label = formatIndonesianDate(dStr, { day: 'numeric', month: 'short' })
        chartDateList.push({ dateStr: dStr, label })
    }
    const lastChartDate = getIndonesianDate(new Date(currentEndMs))
    if (!chartDateList.some((c) => c.dateStr === lastChartDate)) {
        chartDateList.push({
            dateStr: lastChartDate,
            label: formatIndonesianDate(lastChartDate, { day: 'numeric', month: 'short' }),
        })
    }

    const chartDateMap: Record<string, { income: number; hpp: number; expense: number; transactions: number }> = {}
    chartDateList.forEach((c) => {
        chartDateMap[c.dateStr] = { income: 0, hpp: 0, expense: 0, transactions: 0 }
    })

    // ── 2. Query Real Data from Supabase with Branch Filter ──
    let salesCurrent: SaleRowData[] = []
    let salesPrev: SaleRowData[] = []
    let expensesCurrent: { amount: number; expense_date: string }[] = []
    let expensesPrev: { amount: number }[] = []
    let recentSalesList: RecentSaleItem[] = []
    let lowStockProducts: { name: string; stock: number; unit?: string }[] = []
    let lowStockMaterials: { name: string; stock: number; unit?: string }[] = []
    let accountsData: { id: string; name: string; type: string; current_balance: number }[] = []
    let receivablesData: { id: string; debtor_name: string; total_amount: number; paid_amount: number; due_date: string | null; sale_id?: string | null; sales?: { branch_id?: string } | null }[] = []
    let debtsData: { id: string; creditor_name: string; total_amount: number; paid_amount: number; due_date: string | null }[] = []
    let equityData: { id: string; amount: number; type: string }[] = []
    let purchasesData: { id: string; total: number; purchase_date: string; branch_id?: string | null; suppliers?: { name: string } | null; purchase_items?: { item_name: string }[] | null }[] = []

    if (prof?.business_id) {
        // Construct branch-aware queries
        let sCurrQuery = supabase
            .from('sales')
            .select('id, total, transaction_date, channel, payment_method, status, payment_status, branch_id, branches(name), sale_items(product_id, quantity, cost_price, products(name))')
            .eq('business_id', prof.business_id)
            .neq('status', 'voided')
            .gte('transaction_date', currentStartTimestamp)
            .lte('transaction_date', currentEndTimestamp)
            .order('transaction_date', { ascending: false })

        let sPrevQuery = supabase
            .from('sales')
            .select('id, total, transaction_date, branch_id, sale_items(quantity, cost_price)')
            .eq('business_id', prof.business_id)
            .neq('status', 'voided')
            .gte('transaction_date', prevStartTimestamp)
            .lte('transaction_date', prevEndTimestamp)

        let expCurrQuery = supabase
            .from('expenses')
            .select('amount, expense_date, branch_id')
            .eq('business_id', prof.business_id)
            .gte('expense_date', startDateStr)
            .lte('expense_date', endDateStr)

        let expPrevQuery = supabase
            .from('expenses')
            .select('amount, branch_id')
            .eq('business_id', prof.business_id)
            .gte('expense_date', prevStartDateStr)
            .lte('expense_date', prevEndDateStr)

        let purchQuery = supabase
            .from('purchases')
            .select('id, total, purchase_date, branch_id, suppliers(name), purchase_items(item_name)')
            .eq('business_id', prof.business_id)
            .order('purchase_date', { ascending: false })
            .limit(5)

        if (activeBranchId !== 'all') {
            sCurrQuery = sCurrQuery.eq('branch_id', activeBranchId)
            sPrevQuery = sPrevQuery.eq('branch_id', activeBranchId)
            expCurrQuery = expCurrQuery.eq('branch_id', activeBranchId)
            expPrevQuery = expPrevQuery.eq('branch_id', activeBranchId)
            purchQuery = purchQuery.eq('branch_id', activeBranchId)
        }

        const [
            sCurrRes,
            sPrevRes,
            expCurrRes,
            expPrevRes,
            prodRes,
            rawRes,
            accRes,
            recRes,
            debtRes,
            eqRes,
            purchRes,
        ] = await Promise.all([
            sCurrQuery,
            sPrevQuery,
            expCurrQuery,
            expPrevQuery,
            supabase
                .from('products')
                .select('id, name, stock, min_stock, unit')
                .eq('business_id', prof.business_id)
                .eq('status', 'aktif'),
            supabase
                .from('raw_materials')
                .select('id, name, min_stock, unit, stock')
                .eq('business_id', prof.business_id)
                .eq('status', 'active'),
            supabase
                .from('financial_accounts')
                .select('id, name, type, current_balance')
                .eq('business_id', prof.business_id)
                .eq('status', 'active'),
            supabase
                .from('receivables')
                .select('id, debtor_name, total_amount, paid_amount, due_date, sale_id, branch_id, sales(branch_id)')
                .eq('business_id', prof.business_id)
                .in('status', ['unpaid', 'partial'])
                .order('due_date', { ascending: true }),
            supabase
                .from('debts_payables')
                .select('id, creditor_name, total_amount, paid_amount, due_date, branch_id, purchases(branch_id)')
                .eq('business_id', prof.business_id)
                .in('status', ['unpaid', 'partial'])
                .order('due_date', { ascending: true }),
            supabase
                .from('equity_records')
                .select('id, amount, type')
                .eq('business_id', prof.business_id),
            purchQuery,
        ])

        salesCurrent = (sCurrRes.data || []) as unknown as SaleRowData[]
        salesPrev = (sPrevRes.data || []) as unknown as SaleRowData[]
        expensesCurrent = expCurrRes.data || []
        expensesPrev = expPrevRes.data || []
        accountsData = accRes.data || []
        receivablesData = (recRes.data || []) as unknown as typeof receivablesData
        debtsData = debtRes.data || []
        equityData = eqRes.data || []
        purchasesData = (purchRes.data || []) as unknown as typeof purchasesData

        // Filter receivables & debts by active branch if specific
        if (activeBranchId !== 'all') {
            receivablesData = receivablesData.filter((r) => {
                const bId = (r as unknown as { branch_id?: string | null; sales?: { branch_id?: string | null } | null }).branch_id || r.sales?.branch_id
                return bId === activeBranchId
            })
            debtsData = (debtsData as unknown as { id: string; creditor_name: string; total_amount: number; paid_amount: number; due_date: string | null; branch_id?: string | null; purchases?: { branch_id?: string | null } | null }[]).filter((d) => {
                const bId = d.branch_id || d.purchases?.branch_id
                return bId === activeBranchId
            })
        }

        // Resolusi stok per cabang spesifik jika cabang dipilih
        const branchProductStockMap = new Map<string, number>()
        const branchMaterialStockMap = new Map<string, number>()

        if (activeBranchId !== 'all') {
            const [pStockRes, rmStockRes] = await Promise.all([
                supabase.from('product_branch_stocks').select('product_id, stock').eq('branch_id', activeBranchId),
                supabase.from('raw_material_branch_stocks').select('raw_material_id, quantity').eq('branch_id', activeBranchId),
            ])
            if (pStockRes.data) {
                pStockRes.data.forEach((ps: { product_id: string; stock: number }) => {
                    branchProductStockMap.set(ps.product_id, Number(ps.stock || 0))
                })
            }
            if (rmStockRes.data) {
                rmStockRes.data.forEach((rs: { raw_material_id: string; quantity: number }) => {
                    branchMaterialStockMap.set(rs.raw_material_id, Number(rs.quantity || 0))
                })
            }
        }

        // Filter low stock products & materials
        if (prodRes.data) {
            lowStockProducts = prodRes.data
                .map((p: { id?: string; name: string; stock: number; min_stock?: number; unit?: string }) => {
                    const effectiveStock = (activeBranchId !== 'all' && p.id && branchProductStockMap.has(p.id))
                        ? branchProductStockMap.get(p.id)!
                        : Number(p.stock || 0)
                    return { ...p, stock: effectiveStock }
                })
                .filter((p: { stock: number; min_stock?: number }) => {
                    const threshold = (p.min_stock && p.min_stock > 0) ? p.min_stock : 5
                    return p.stock <= threshold
                })
        }
        if (rawRes.data) {
            lowStockMaterials = rawRes.data
                .map((m: { id?: string; name: string; stock?: number; min_stock?: number; unit?: string }) => {
                    const effectiveStock = (activeBranchId !== 'all' && m.id && branchMaterialStockMap.has(m.id))
                        ? branchMaterialStockMap.get(m.id)!
                        : Number(m.stock || 0)
                    return { ...m, stock: effectiveStock }
                })
                .filter((m: { stock: number; min_stock?: number }) => {
                    const threshold = (m.min_stock && m.min_stock > 0) ? m.min_stock : 5
                    return m.stock <= threshold
                })
        }

        // Format recent sales (top 5)
        recentSalesList = salesCurrent.slice(0, 5).map((s) => {
            const d = new Date(s.transaction_date)
            const timeFormatted = `${formatIndonesianDate(d, { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
            const code = `#TRX-${s.id.replace(/-/g, '').slice(0, 5).toUpperCase()}`

            let methodLabel = 'Tunai'
            if (s.payment_method === 'qris') methodLabel = 'QRIS'
            else if (s.payment_method === 'transfer') methodLabel = 'Transfer Bank'
            else if (s.payment_method === 'credit' || s.payment_method === 'tempo') methodLabel = 'Kredit'

            return {
                id: s.id,
                displayCode: code,
                timeFormatted,
                channel: s.channel || 'offline',
                paymentMethod: methodLabel,
                total: Number(s.total || 0),
                status: s.status || 'completed',
            }
        })
    }

    // ── 3. Calculate Core Metrics ──
    const omzet = salesCurrent.reduce((acc, s) => acc + Number(s.total || 0), 0)
    const prevOmzet = salesPrev.reduce((acc, s) => acc + Number(s.total || 0), 0)
    const omzetChangePct = prevOmzet > 0 ? Math.round(((omzet - prevOmzet) / prevOmzet) * 100) : (omzet > 0 ? 100 : 0)
    const isOmzetUp = omzet >= prevOmzet

    let currentHPP = 0
    salesCurrent.forEach((s) => {
        const items = s.sale_items || []
        items.forEach((it) => {
            currentHPP += Number(it.cost_price || 0) * Number(it.quantity || 0)
        })
    })

    let prevHPP = 0
    salesPrev.forEach((s) => {
        const items = s.sale_items || []
        items.forEach((it) => {
            prevHPP += Number(it.cost_price || 0) * Number(it.quantity || 0)
        })
    })

    const currentExpenses = expensesCurrent.reduce((acc, e) => acc + Number(e.amount || 0), 0)
    const prevExpenses = expensesPrev.reduce((acc, e) => acc + Number(e.amount || 0), 0)

    const netProfit = omzet - currentHPP - currentExpenses
    const prevNetProfit = prevOmzet - prevHPP - prevExpenses
    const profitChangePct =
        prevNetProfit !== 0
            ? Math.round(((netProfit - prevNetProfit) / Math.abs(prevNetProfit)) * 100)
            : netProfit > 0
            ? 100
            : 0
    const isProfitUp = netProfit >= prevNetProfit

    const totalTransactions = salesCurrent.length
    const prevTrans = salesPrev.length
    const transChangePct = prevTrans > 0 ? Math.round(((totalTransactions - prevTrans) / prevTrans) * 100) : (totalTransactions > 0 ? 100 : 0)
    const isTransUp = totalTransactions >= prevTrans

    const lowStockCount = lowStockProducts.length + lowStockMaterials.length

    // Operasional Kasir (Breakdown Pembayaran Kasir)
    const cashSales = salesCurrent.filter((s) => s.payment_method === 'cash')
    const cashSalesCount = cashSales.length
    const cashSalesTotal = cashSales.reduce((acc, s) => acc + Number(s.total || 0), 0)

    const nonCashSales = salesCurrent.filter((s) => s.payment_method !== 'cash')
    const nonCashSalesCount = nonCashSales.length
    const nonCashSalesTotal = nonCashSales.reduce((acc, s) => acc + Number(s.total || 0), 0)

    const creditSales = salesCurrent.filter((s) => s.status === 'credit' || s.payment_status === 'partial' || s.payment_status === 'unpaid')
    const creditSalesCount = creditSales.length
    const creditSalesTotal = creditSales.reduce((acc, s) => acc + Number(s.total || 0), 0)

    // ── 4. Populate Chart Points ──
    salesCurrent.forEach((s) => {
        const dStr = getIndonesianDate(new Date(s.transaction_date))
        if (chartDateMap[dStr]) {
            chartDateMap[dStr].income += Number(s.total || 0)
            chartDateMap[dStr].transactions += 1
            const items = s.sale_items || []
            items.forEach((it) => {
                chartDateMap[dStr].hpp += Number(it.cost_price || 0) * Number(it.quantity || 0)
            })
        }
    })

    expensesCurrent.forEach((e) => {
        const dStr = e.expense_date
        if (chartDateMap[dStr]) {
            chartDateMap[dStr].expense += Number(e.amount || 0)
        }
    })

    const chartPoints: ChartPoint[] = chartDateList.map((c) => {
        const bucket = chartDateMap[c.dateStr] || { income: 0, hpp: 0, expense: 0, transactions: 0 }
        const profit = bucket.income - bucket.hpp - bucket.expense
        return {
            date: c.dateStr,
            label: c.label,
            income: Math.round(bucket.income),
            profit: Math.round(profit),
            transactions: bucket.transactions,
        }
    })

    // Sparklines (7 points)
    const omzetSparkline = chartPoints.slice(-7).map((p) => p.income)
    const profitSparkline = chartPoints.slice(-7).map((p) => p.profit)
    const transSparkline = chartPoints.slice(-7).map((p) => p.transactions)

    const metrics: DashboardMetricData = {
        omzet,
        omzetChangePct,
        isOmzetUp,
        omzetSparkline,

        netProfit,
        profitChangePct,
        isProfitUp,
        profitSparkline,

        totalTransactions,
        transChangePct,
        isTransUp,
        transSparkline,

        lowStockCount,
        lowStockSummary: `${lowStockCount} item perlu restock`,

        cashSalesCount,
        cashSalesTotal,
        nonCashSalesCount,
        nonCashSalesTotal,
        creditSalesCount,
        creditSalesTotal,
    }

    // ── 5. Quick Notifications ──
    const notifications: QuickNotificationItem[] = []

    // Low stock notification
    const firstLow = lowStockProducts[0] || lowStockMaterials[0]
    if (firstLow) {
        notifications.push({
            id: 'low-stock-alert',
            type: 'stock',
            title: 'Stok hampir habis',
            description: `${firstLow.name} tinggal ${firstLow.stock} ${firstLow.unit || 'pcs'}`,
            linkHref: '/dashboard/produk',
        })
    }

    // Receivables due notification
    const dueRec = receivablesData[0]
    if (dueRec) {
        const unpaid = dueRec.total_amount - dueRec.paid_amount
        const dueText = dueRec.due_date
            ? `jatuh tempo ${formatIndonesianDate(dueRec.due_date, { day: 'numeric', month: 'short' })}`
            : 'belum lunas'
        notifications.push({
            id: 'receivable-alert',
            type: 'receivable',
            title: 'Piutang jatuh tempo',
            description: `${dueRec.debtor_name} (${fmt(unpaid)}) ${dueText}`,
            linkHref: '/dashboard/keuangan/utang-piutang',
        })
    }

    // Subscription status notification
    let formattedExpiry = '23 Nov 2026'
    if (subscriptionExpiresAt) {
        try {
            const d = new Date(subscriptionExpiresAt)
            formattedExpiry = formatIndonesianDate(d, { day: 'numeric', month: 'short', year: 'numeric' })
        } catch {
            formattedExpiry = '23 Nov 2026'
        }
    }
    notifications.push({
        id: 'subscription-alert',
        type: 'subscription',
        title: 'Langganan aktif',
        description: `Paket ${planName} akan berakhir pada ${formattedExpiry}`,
        linkHref: '/dashboard/subscription',
    })

    // ── 6. Ringkasan Keuangan ──
    const currentCash = accountsData.reduce((acc, a) => acc + Number(a.current_balance || 0), 0)
    const totalReceivables = receivablesData.reduce((acc, r) => acc + (Number(r.total_amount || 0) - Number(r.paid_amount || 0)), 0)
    const totalDebts = debtsData.reduce((acc, d) => acc + (Number(d.total_amount || 0) - Number(d.paid_amount || 0)), 0)
    const initialCapital = equityData
        .filter((e) => e.type === 'initial_capital' || !e.type)
        .reduce((acc, e) => acc + Number(e.amount || 0), 0)

    const financials: FinancialSummaryData = {
        currentCash,
        totalReceivables,
        totalDebts,
        initialCapital: initialCapital > 0 ? initialCapital : 10000000,
    }

    // ── 7. Recent Activities Timeline ──
    const recentActivities: ActivityTimelineItem[] = []

    purchasesData.slice(0, 2).forEach((p) => {
        const d = new Date(p.purchase_date)
        const items = p.purchase_items?.map((it) => it.item_name).join(', ') || p.suppliers?.name || 'Bahan Baku'
        recentActivities.push({
            id: `purch-${p.id}`,
            type: 'purchase',
            title: `Pembelian bahan baku (${items})`,
            detail: p.suppliers?.name || 'Supplier',
            timeFormatted: `${formatIndonesianDate(d, { day: 'numeric', month: 'short' })} • ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
            amountFormatted: fmt(p.total),
        })
    })

    salesCurrent.slice(0, 2).forEach((s) => {
        const d = new Date(s.transaction_date)
        const count = s.sale_items?.length || 1
        recentActivities.push({
            id: `sale-${s.id}`,
            type: 'sale',
            title: `Penjualan ${count} item (${s.branches?.name || 'Kasir'})`,
            detail: s.payment_method || 'Kasir',
            timeFormatted: `${formatIndonesianDate(d, { day: 'numeric', month: 'short' })} • ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
            amountFormatted: fmt(s.total),
        })
    })

    if (recentActivities.length === 0) {
        recentActivities.push({
            id: 'mock-act-1',
            type: 'purchase',
            title: 'Pembelian bahan baku',
            detail: 'Supplier',
            timeFormatted: `${formatIndonesianDate(now, { day: 'numeric', month: 'short' })} • 10:12`,
            amountFormatted: fmt(650000),
        })
    }

    // Current formatted date string e.g. "Selasa, 21 Oktober 2025"
    const currentDateDisplay = formatIndonesianDate(now, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })

    return (
        <DashboardClient
            userName={userName}
            isOwner={isOwner}
            activeBranchName={activeBranchName}
            currentDateDisplay={currentDateDisplay}
            dateRangeLabel={dateRangeLabel}
            dateRangeCode={dateRangeCode}
            startDateStr={startDateStr}
            endDateStr={endDateStr}
            metrics={metrics}
            chartData={chartPoints}
            recentSales={recentSalesList}
            notifications={notifications}
            financials={financials}
            recentActivities={recentActivities}
        />
    )
}