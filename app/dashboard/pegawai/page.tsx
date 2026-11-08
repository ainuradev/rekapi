import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getActiveBranchId } from '@/lib/active-branch'
import { resolveEffectiveBranchFilter } from '@/lib/inventory-valuation'
import { canAddEmployee, getEffectiveLimits } from '@/lib/subscription-limits'
import PegawaiClient, { EmployeeProfile, BranchItem } from './pegawai-client'

interface ProfileWithSubscription {
    role: string
    business_id: string
    businesses?: {
        subscription_status: string | null
        subscription_plans?: {
            name: string
            max_branches: number | null
            max_employees: number | null
        } | null
    } | null
}

export default async function PegawaiPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select(`
            role, business_id,
            businesses(
                subscription_status,
                subscription_plan_id,
                subscription_plans(name, max_branches, max_employees, can_advanced_reports, can_api_access, duration_days)
            )
        `)
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'owner' || !profile?.business_id) {
        redirect('/dashboard')
    }

    const businessId = profile.business_id

    // Ambil data cabang milik bisnis
    const { data: branchesRaw } = await supabase
        .from('branches')
        .select('id, name, status')
        .eq('business_id', businessId)
        .order('name')

    const branches: BranchItem[] = (branchesRaw as unknown as BranchItem[]) ?? []

    // Ambil data profil pegawai
    const { data: employeesRaw } = await supabase
        .from('profiles')
        .select('id, full_name, role, branch_id, is_active, created_at, branches(id, name, status)')
        .eq('business_id', businessId)
        .eq('role', 'pegawai')
        .order('full_name')

    // Ambil email login pegawai dari Auth Admin
    const admin = createAdminClient()
    const employees: EmployeeProfile[] = await Promise.all(
        (employeesRaw ?? []).map(async (emp) => {
            let email = '-'
            try {
                const { data: userData } = await admin.auth.admin.getUserById(emp.id)
                if (userData?.user?.email) {
                    email = userData.user.email
                }
            } catch (err) {
                console.error(`Failed to fetch auth email for employee ${emp.id}:`, err)
            }
            return {
                id: emp.id,
                full_name: emp.full_name,
                email,
                role: emp.role,
                branch_id: emp.branch_id,
                is_active: emp.is_active ?? true,
                branches: (Array.isArray(emp.branches) ? emp.branches[0] : emp.branches) as unknown as { id?: string; name: string; status?: string | null } | null,
                created_at: emp.created_at,
            }
        })
    )

    const businessData = (profile as unknown as ProfileWithSubscription | null)?.businesses
    const subscriptionStatus = businessData?.subscription_status || 'trial'
    const planLimits = businessData?.subscription_plans ?? null
    const effectiveLimits = getEffectiveLimits(planLimits, subscriptionStatus)

    const planName = businessData?.subscription_plans?.name || (subscriptionStatus === 'trial' ? 'Trial 7 Hari' : 'Standard')
    const activeEmployeeCount = employees.filter((e) => e.is_active !== false).length
    const { allowed, reason: limitReason } = canAddEmployee(activeEmployeeCount, planLimits, subscriptionStatus)

    const activeBranchId = await getActiveBranchId()
    const { selectedBranchId, selectedBranch } = resolveEffectiveBranchFilter(activeBranchId, branches)
    const activeBranchName = selectedBranch?.name || (selectedBranchId === 'all' ? 'Semua Cabang' : 'Cabang Terpilih')

    return (
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                        Kelola Pegawai Kasir
                    </h1>
                    <p className="mt-1 text-xs text-slate-500 font-medium">
                        Atur akses kasir per cabang, rotasi penugasan, dan reset password login operasional toko.
                    </p>
                </div>
            </div>

            <PegawaiClient
                key={selectedBranchId}
                employees={employees}
                branches={branches}
                planName={planName}
                maxEmployees={effectiveLimits.max_employees ?? 1}
                allowed={allowed}
                limitReason={limitReason}
                activeBranchId={selectedBranchId}
                activeBranchName={activeBranchName}
            />
        </div>
    )
}
