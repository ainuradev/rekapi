import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveBranchId } from '@/lib/active-branch'
import { resolveEffectiveBranchFilter } from '@/lib/inventory-valuation'
import { parseCustomOrPeriodRange, formatIndonesianDate } from '@/lib/date-utils'
import PeriodSelect from '../period-select'
import UtangPiutangClient, { DebtRecord, ReceivableRecord } from './utang-piutang-client'
import { FinancialAccount } from '../kas-rekening/kas-rekening-client'

export default async function UtangPiutangPage({
    searchParams,
}: {
    searchParams: Promise<{
        branch?: string
        period?: string
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

    const params = await searchParams
    const activeBranchId = await getActiveBranchId()
    const candidateBranchId = (activeBranchId && activeBranchId !== 'all')
        ? activeBranchId
        : (params?.branch && params.branch !== 'all' ? params.branch : 'all')

    const { dateFrom, dateTo, period, isCustom } = parseCustomOrPeriodRange(
        params?.period,
        params?.start_date,
        params?.end_date,
        'month'
    )

    // Fetch branches, debts, receivables, and accounts in parallel
    const [
        { data: branches },
        { data: debtsRaw },
        { data: receivablesRaw },
        { data: accountsRaw },
    ] = await Promise.all([
        supabase
            .from('branches')
            .select('id, name')
            .eq('business_id', businessId)
            .order('name'),
        supabase
            .from('debts_payables')
            .select('*, purchases(branch_id)')
            .eq('business_id', businessId)
            .order('due_date', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false }),
        supabase
            .from('receivables')
            .select('*, sales(branch_id)')
            .eq('business_id', businessId)
            .order('due_date', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false }),
        supabase
            .from('financial_accounts')
            .select('*')
            .eq('business_id', businessId)
            .eq('status', 'active')
            .order('is_default_cash', { ascending: false }),
    ])

    const branchList = branches ?? []
    const { selectedBranchId, selectedBranch, branchLabel } = resolveEffectiveBranchFilter(candidateBranchId, branchList)

    const allDebts = (debtsRaw as (DebtRecord & { purchases?: { branch_id?: string | null } | null })[]) ?? []
    const allReceivables = (receivablesRaw as (ReceivableRecord & { sales?: { branch_id?: string | null } | null })[]) ?? []

    // Filter Utang berdasarkan Cabang Aktif
    const filteredDebtsByBranch = selectedBranchId !== 'all'
        ? allDebts.filter((d) => (d.branch_id === selectedBranchId || d.purchases?.branch_id === selectedBranchId))
        : allDebts

    // Filter Piutang berdasarkan Cabang Aktif
    const filteredReceivablesByBranch = selectedBranchId !== 'all'
        ? allReceivables.filter((r) => (r.branch_id === selectedBranchId || r.sales?.branch_id === selectedBranchId))
        : allReceivables

    // Filter Periode (jika filter aktif di searchParams)
    const debts = (params?.period || params?.start_date)
        ? filteredDebtsByBranch.filter((d) => {
            const createdDate = d.created_at ? d.created_at.slice(0, 10) : ''
            const dueDate = d.due_date || ''
            return (createdDate >= dateFrom && createdDate <= dateTo) || (dueDate >= dateFrom && dueDate <= dateTo)
        })
        : filteredDebtsByBranch

    const receivables = (params?.period || params?.start_date)
        ? filteredReceivablesByBranch.filter((r) => {
            const createdDate = r.created_at ? r.created_at.slice(0, 10) : ''
            const dueDate = r.due_date || ''
            return (createdDate >= dateFrom && createdDate <= dateTo) || (dueDate >= dateFrom && dueDate <= dateTo)
        })
        : filteredReceivablesByBranch

    const accounts = (accountsRaw as FinancialAccount[]) ?? []

    return (
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
            {/* Navigasi Breadcrumb */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 no-print">
                <Link
                    href="/dashboard/keuangan"
                    className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-emerald-700 transition"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span>Kembali ke Pusat Keuangan</span>
                </Link>

                <div className="flex items-center gap-2 flex-wrap">
                    <PeriodSelect
                        currentPeriod={period}
                        startDate={params?.start_date}
                        endDate={params?.end_date}
                    />
                </div>
            </div>

            {/* Header Halaman */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xs mb-8">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-600 mb-1 flex-wrap">
                    <span>Liabilitas & Aset • Kontrol Kewajiban & Tagihan</span>
                    <span>•</span>
                    <span className="font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md normal-case">
                        🏢 {branchLabel}
                    </span>
                    {(params?.start_date || params?.period) && (
                        <>
                            <span>•</span>
                            <span className="font-medium text-slate-500">
                                📅 {isCustom ? `${formatIndonesianDate(dateFrom)} – ${formatIndonesianDate(dateTo)}` : period}
                            </span>
                        </>
                    )}
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                    Buku Utang & Piutang Usaha
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-slate-500 font-medium">
                    Pantau kewajiban utang ke supplier bahan baku, tagihan piutang bon pelanggan, pelunasan bertahap, dan tanggal jatuh tempo untuk {selectedBranch ? branchLabel : 'seluruh cabang usaha'}.
                </p>
            </div>

            {/* Client Component */}
            <UtangPiutangClient
                key={`${selectedBranchId}-${params?.start_date ?? ''}-${params?.end_date ?? ''}`}
                debts={debts}
                receivables={receivables}
                accounts={accounts}
                branches={branchList}
                activeBranchId={selectedBranchId}
            />
        </div>
    )
}
