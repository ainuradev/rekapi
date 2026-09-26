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
        .select('role, business_id, businesses(subscription_status, trial_ends_at, subscription_expires_at, subscription_plan_id, subscription_plans(name))')
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
    const subscriptionExpiresAt = businessData?.subscription_expires_at || null
    const currentPlanName = businessData?.subscription_plans?.name || null

    return (
        <SubscriptionClient
            plans={plans || []}
            currentStatus={currentStatus}
            trialEndsAt={trialEndsAt}
            currentPlanName={currentPlanName}
            subscriptionExpiresAt={subscriptionExpiresAt}
        />
    )
}
