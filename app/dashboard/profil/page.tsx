import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfilClient from './profil-client'

export default async function ProfilPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('id, role, full_name, business_id, branch_id, branches(name)')
        .eq('id', user.id)
        .single()

    if (!profile) redirect('/login')

    const { data: business } = await supabase
        .from('businesses')
        .select('id, name, address, phone, logo_url, qris_url, qris_image_url, subscription_status, trial_ends_at, subscription_expires_at, subscription_plan_id, subscription_plans(name)')
        .eq('id', profile.business_id)
        .single()

    // Daftar pegawai milik bisnis ini
    const { data: employees } = await supabase
        .from('profiles')
        .select('id, full_name, branches(name)')
        .eq('business_id', profile.business_id)
        .eq('role', 'pegawai')
        .order('full_name')

    // User baru via Google: nama bisnis masih default "Bisnis Baru"
    const isNewUser = business?.name === 'Bisnis Baru'

    // Cek apakah user menggunakan Google provider
    const isGoogleUser = !!(
        user.app_metadata?.provider === 'google' ||
        user.identities?.some((i) => i.provider === 'google')
    )

    // Cek apakah user SUDAH punya password (punya identity email/password)
    const hasPasswordSet = !!(user.identities?.some((i) => i.provider === 'email'))

interface ProfileWithBranch {
    id: string
    role: string | null
    full_name: string | null
    business_id: string | null
    branch_id: string | null
    branches: { name: string } | null
}

interface BusinessWithPlan {
    id: string
    name: string | null
    address: string | null
    phone: string | null
    logo_url: string | null
    qris_url: string | null
    qris_image_url?: string | null
    subscription_status: string | null
    trial_ends_at: string | null
    subscription_expires_at: string | null
    subscription_plan_id: string | null
    subscription_plans: { name: string } | null
}

interface EmployeeItem {
    id: string
    full_name: string | null
    branches: { name: string } | null
}

    const prof = profile as unknown as ProfileWithBranch
    const biz = business as unknown as BusinessWithPlan | null
    const empList = (employees ?? []) as unknown as EmployeeItem[]

    return (
        <ProfilClient
            userId={user.id}
            email={user.email ?? ''}
            fullName={prof.full_name ?? ''}
            role={prof.role ?? 'pegawai'}
            branchName={prof.branches?.name ?? null}
            businessName={biz?.name ?? ''}
            businessAddress={biz?.address ?? ''}
            businessPhone={biz?.phone ?? ''}
            businessLogoUrl={biz?.logo_url ?? ''}
            businessQrisUrl={biz?.qris_image_url ?? biz?.qris_url ?? ''}
            subscriptionStatus={biz?.subscription_status ?? 'trial'}
            trialEndsAt={biz?.trial_ends_at ?? null}
            subscriptionExpiresAt={biz?.subscription_expires_at ?? null}
            planName={biz?.subscription_plans?.name ?? null}
            isGoogleUser={isGoogleUser}
            hasPasswordSet={hasPasswordSet}
            isNewUser={isNewUser}
            employees={empList.map((e) => ({
                id: e.id,
                full_name: e.full_name ?? '',
                branch_name: e.branches?.name ?? null,
            }))}
        />
    )
}
