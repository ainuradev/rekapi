import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveBranchId } from '@/lib/active-branch'
import { resolveEffectiveBranchFilter } from '@/lib/inventory-valuation'
import { getIndonesianPeriodRange } from '@/lib/date-utils'
import { checkModuleAccess } from '@/lib/subscription-access'
import PlanFeatureGate from '@/components/plan-feature-gate'
import KasRekeningClient, {
    FinancialAccount,
    FinancialTransaction,
    BranchCashSummary,
} from './kas-rekening-client'

export default async function KasRekeningPage({
    searchParams,
}: {
    searchParams?: Promise<{ branch?: string }>
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
        'cash_accounts'
    )

    if (!moduleAccess.allowed) {
        return (
            <PlanFeatureGate
                module="cash_accounts"
                currentPlanName={
                    businessData?.subscription_plans?.name ||
                    (businessData?.subscription_status === 'trial' ? 'Trial 7 Hari' : 'Standard')
                }
            />
        )
    }

    const businessId = profile.business_id
    const businessName = businessData?.name || 'Bisnis Anda'

    // Resolusi cabang aktif dari cookie dan URL
    const params = searchParams ? await searchParams : {}
    const activeBranchId = await getActiveBranchId()
    const candidateBranchFilter = params?.branch
        ? (params.branch !== 'all' ? params.branch : 'all')
        : (activeBranchId && activeBranchId !== 'all' ? activeBranchId : 'all')

    const { data: branchesRaw } = await supabase
        .from('branches')
        .select('id, name')
        .eq('business_id', businessId)
        .order('name')

    const branches = branchesRaw ?? []
    const { selectedBranchId, selectedBranch } = resolveEffectiveBranchFilter(candidateBranchFilter, branches)

    // Fetch accounts
    const { data: accountsRaw } = await supabase
        .from('financial_accounts')
        .select('*')
        .eq('business_id', businessId)
        .order('is_default_cash', { ascending: false })
        .order('is_default_bank', { ascending: false })
        .order('created_at', { ascending: true })

    // Auto-seed if accounts are empty (fallback for existing businesses)
    let accounts: FinancialAccount[] = (accountsRaw as FinancialAccount[]) ?? []
    if (accounts.length === 0) {
        const { error: seedErr } = await supabase.from('financial_accounts').insert([
            {
                business_id: businessId,
                name: 'Kas Toko / Kasir',
                type: 'cash',
                bank_name: 'Kas Tunai',
                initial_balance: 0,
                current_balance: 0,
                is_default_cash: true,
                is_default_bank: false,
                status: 'active',
            },
            {
                business_id: businessId,
                name: 'Rekening Bank Utama',
                type: 'bank',
                bank_name: 'BCA / Bank Transfer',
                initial_balance: 0,
                current_balance: 0,
                is_default_cash: false,
                is_default_bank: true,
                status: 'active',
            },
        ])

        if (!seedErr) {
            const { data: seeded } = await supabase
                .from('financial_accounts')
                .select('*')
                .eq('business_id', businessId)
            accounts = (seeded as FinancialAccount[]) ?? []
        }
    }

    // Fetch latest 40 transactions
    const { data: txRaw } = await supabase
        .from('financial_transactions')
        .select('*, financial_accounts(name, type)')
        .eq('business_id', businessId)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(40)

    const transactions = (txRaw as unknown as FinancialTransaction[]) ?? []

    // Perhitungan Ringkasan "Kontribusi Kas Cabang" saat filter cabang spesifik aktif
    let branchCashSummary: BranchCashSummary | null = null

    if (selectedBranchId !== 'all' && selectedBranch) {
        const { dateFrom, dateTo, timestampFrom, timestampTo } = getIndonesianPeriodRange('today')

        const [
            { data: paymentsToday },
            { data: legacySalesToday },
            { data: expensesToday },
        ] = await Promise.all([
            supabase
                .from('sale_payments')
                .select('sale_id, amount, payment_method, payment_date, sales!inner(status, branch_id)')
                .eq('business_id', businessId)
                .eq('sales.branch_id', selectedBranchId)
                .neq('sales.status', 'voided')
                .gte('payment_date', timestampFrom)
                .lte('payment_date', timestampTo),
            supabase
                .from('sales')
                .select('id, total, paid_amount, payment_status, payment_method, transaction_date, status')
                .eq('business_id', businessId)
                .eq('branch_id', selectedBranchId)
                .neq('status', 'voided')
                .gte('transaction_date', timestampFrom)
                .lte('transaction_date', timestampTo),
            supabase
                .from('expenses')
                .select('amount, payment_method')
                .eq('business_id', businessId)
                .eq('branch_id', selectedBranchId)
                .gte('expense_date', dateFrom)
                .lte('expense_date', dateTo),
        ])

        let todayCashIn = 0
        let todayNonCashIn = 0
        const trackedSaleIds = new Set<string>()

        for (const p of paymentsToday ?? []) {
            trackedSaleIds.add(p.sale_id)
            const amt = Number(p.amount || 0)
            const pm = (p.payment_method || '').toLowerCase()
            if (pm === 'cash' || pm === 'tunai') {
                todayCashIn += amt
            } else {
                todayNonCashIn += amt
            }
        }

        // Kompatibilitas data penjualan lama yang belum ada baris di sale_payments
        for (const s of legacySalesToday ?? []) {
            if (!trackedSaleIds.has(s.id)) {
                if (s.payment_status === 'unpaid') continue
                const amt = Number(s.paid_amount ?? s.total ?? 0)
                if (amt <= 0) continue
                const pm = (s.payment_method || '').toLowerCase()
                if (pm === 'cash' || pm === 'tunai') {
                    todayCashIn += amt
                } else {
                    todayNonCashIn += amt
                }
            }
        }

        let todayExpenses = 0
        for (const exp of expensesToday ?? []) {
            todayExpenses += Number(exp.amount || 0)
        }

        const todayNetContribution = (todayCashIn + todayNonCashIn) - todayExpenses

        branchCashSummary = {
            branchId: selectedBranchId,
            branchName: selectedBranch.name,
            todayCashIn,
            todayNonCashIn,
            todayExpenses,
            todayNetContribution,
        }
    }

    return (
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
            {/* Navigasi Breadcrumb */}
            <div className="mb-6 flex items-center justify-between no-print">
                <Link
                    href="/dashboard/keuangan"
                    className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-emerald-800 transition"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span>Kembali ke Pusat Keuangan</span>
                </Link>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{businessName}</span>
                </div>
            </div>

            {/* Header Halaman */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xs mb-8">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
                        <span>Kas & Perbankan • Manajemen Likuiditas</span>
                    </div>
                    <span className="text-xs font-semibold text-emerald-800">
                        {selectedBranchId === 'all'
                            ? `Konsolidasi Semua Cabang (${branches.length} cabang)`
                            : `Cabang: ${selectedBranch?.name || 'Terpilih'}`}
                    </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                    Buku Kas & Rekening Bank
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-slate-500 font-medium">
                    Pantau saldo kas fisik toko, rekening bank digital, atur saldo awal usaha, serta transfer antar kas secara rapi.
                </p>
            </div>

            {/* Client Component */}
            <KasRekeningClient
                accounts={accounts}
                transactions={transactions}
                businessName={businessName}
                branchCashSummary={branchCashSummary}
            />
        </div>
    )
}
