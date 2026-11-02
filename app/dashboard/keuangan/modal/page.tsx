import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { checkModuleAccess } from '@/lib/subscription-access'
import PlanFeatureGate from '@/components/plan-feature-gate'
import ModalClient, { EquityRecord } from './modal-client'
import { FinancialAccount } from '../kas-rekening/kas-rekening-client'

export default async function ModalPage() {
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
        'capital_equity'
    )

    if (!moduleAccess.allowed) {
        return (
            <PlanFeatureGate
                module="capital_equity"
                currentPlanName={
                    businessData?.subscription_plans?.name ||
                    (businessData?.subscription_status === 'trial' ? 'Trial 7 Hari' : 'Standard')
                }
            />
        )
    }

    const businessId = profile.business_id
    const businessName = businessData?.name || 'Bisnis Anda'

    // Fetch equity records and accounts
    const [
        { data: recordsRaw },
        { data: accountsRaw },
    ] = await Promise.all([
        supabase
            .from('equity_records')
            .select('*, financial_accounts(name)')
            .eq('business_id', businessId)
            .order('entry_date', { ascending: false })
            .order('created_at', { ascending: false }),
        supabase
            .from('financial_accounts')
            .select('*')
            .eq('business_id', businessId)
            .eq('status', 'active')
            .order('is_default_cash', { ascending: false }),
    ])

    const records = (recordsRaw as unknown as EquityRecord[]) ?? []
    const accounts = (accountsRaw as FinancialAccount[]) ?? []

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
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800 mb-1">
                    <span>Ekuitas Pemilik • Modal & Permodalan Usaha</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                    Modal Usaha & Ekuitas
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-slate-500 font-medium">
                    Catat modal awal pendirian usaha, setoran tambahan modal pemilik, serta penarikan dana keperluan pribadi (prive) secara transparan.
                </p>
            </div>

            {/* Client Component */}
            <ModalClient
                records={records}
                accounts={accounts}
            />
        </div>
    )
}
