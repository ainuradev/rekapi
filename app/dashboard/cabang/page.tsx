import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getActiveBranchId } from '@/lib/active-branch'
import { canAddBranch, getEffectiveLimits } from '@/lib/subscription-limits'
import BranchListClient, { Branch } from './branch-list-client'

export default async function CabangPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select(
            `role, business_id,
             businesses(
               subscription_status,
               subscription_plan_id,
               subscription_plans(name, max_branches, max_employees, can_advanced_reports, can_api_access, duration_days)
             )`
        )
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'owner') {
        redirect('/dashboard')
    }

    const { data: branchesRaw } = await supabase
        .from('branches')
        .select(`
            id,
            name,
            code,
            branch_type,
            city,
            manager_name,
            ownership_status,
            lease_start_date,
            lease_end_date,
            operating_hours,
            status,
            parent_branch_id,
            address,
            phone,
            created_at
        `)
        .eq('business_id', profile.business_id)
        .order('created_at', { ascending: true })

    interface ProfileWithBranchLimits {
        role: string
        business_id: string
        businesses?: {
            subscription_status: string | null
            subscription_plans?: {
                name?: string | null
                max_branches: number | null
                max_employees: number | null
            } | null
        } | null
    }

    const businessData = (profile as unknown as ProfileWithBranchLimits | null)?.businesses
    const subscriptionStatus = businessData?.subscription_status || 'trial'
    const planLimits = businessData?.subscription_plans ?? null
    const effectiveLimits = getEffectiveLimits(planLimits, subscriptionStatus)

    const branches: Branch[] = (branchesRaw as unknown as Branch[]) ?? []
    const branchCount = branches.length
    const { allowed, reason } = canAddBranch(branchCount, planLimits, subscriptionStatus)
    const activeBranchId = await getActiveBranchId()

    const planName =
        businessData?.subscription_plans?.name ||
        (subscriptionStatus === 'trial' ? 'Trial 7 Hari' : 'Paket Standar')

    return (
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
            <BranchListClient
                key={activeBranchId || 'all'}
                branches={branches}
                allowed={allowed}
                reason={reason}
                activeBranchId={activeBranchId || 'all'}
                maxBranches={effectiveLimits.max_branches}
                planName={planName}
            />
        </div>
    )
}
