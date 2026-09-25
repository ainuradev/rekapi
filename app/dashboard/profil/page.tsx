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
        .select('id, role, full_name, business_id')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner') redirect('/dashboard')

    const { data: business } = await supabase
        .from('businesses')
        .select('id, name, subscription_status, trial_ends_at')
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

    return (
        <ProfilClient
            userId={user.id}
            email={user.email ?? ''}
            fullName={profile.full_name ?? ''}
            businessName={business?.name ?? ''}
            subscriptionStatus={business?.subscription_status ?? 'trial'}
            trialEndsAt={business?.trial_ends_at ?? null}
            isGoogleUser={isGoogleUser}
            hasPasswordSet={hasPasswordSet}
            isNewUser={isNewUser}
            employees={(employees ?? []).map((e: any) => ({
                id: e.id,
                full_name: e.full_name,
                branch_name: e.branches?.name ?? null,
            }))}
        />
    )
}
