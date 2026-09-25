import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SubscriptionClient from './subscription-client'

export default async function SubscriptionPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, business_id, businesses(subscription_status, trial_ends_at)')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'owner') {
        redirect('/dashboard')
    }

    const { data: plans } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price', { ascending: true })

    const businessData = (profile as any)?.businesses
    const currentStatus = businessData?.subscription_status || 'trial'
    const trialEndsAt = businessData?.trial_ends_at || null

    return (
        <SubscriptionClient
            plans={plans || []}
            currentStatus={currentStatus}
            trialEndsAt={trialEndsAt}
        />
    )
}
