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

    if (profile?.role !== 'owner' || !profile?.business_id) {
        redirect('/dashboard')
    }

    const [plansRes, pendingTxRes] = await Promise.all([
        supabase
            .from('subscription_plans')
            .select('*')
            .order('price', { ascending: true }),
        supabase
            .from('payment_transactions')
            .select(`
                id,
                midtrans_order_id,
                amount,
                status,
                payment_type,
                created_at,
                subscriptions (
                    plan_id,
                    subscription_plans (
                        name,
                        price,
                        duration_days
                    )
                )
            `)
            .eq('business_id', profile.business_id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
    ])

    const plans = plansRes.data || []
    const pendingTxRaw = pendingTxRes.data

    interface ProfileWithSubscription {
        role?: string | null
        business_id?: string | null
        businesses?: {
            subscription_status: string | null
            trial_ends_at: string | null
            subscription_expires_at: string | null
            subscription_plan_id: string | null
            subscription_plans: { name: string } | null
        } | null
    }

    const businessData = (profile as unknown as ProfileWithSubscription | null)?.businesses
    const currentStatus = businessData?.subscription_status || 'trial'
    const trialEndsAt = businessData?.trial_ends_at || null
    const subscriptionExpiresAt = businessData?.subscription_expires_at || null
    const currentPlanId = businessData?.subscription_plan_id || null
    const currentPlanName = businessData?.subscription_plans?.name || null

    interface SubscriptionRelation {
        plan_id?: string
        subscription_plans?: { name: string; price: number; duration_days: number } | { name: string; price: number; duration_days: number }[]
    }

    let pendingTransaction: {
        id: string
        orderId: string
        amount: number
        createdAt: string
        planName: string | null
    } | null = null

    if (pendingTxRaw) {
        const sub = pendingTxRaw.subscriptions as unknown as SubscriptionRelation | SubscriptionRelation[] | null
        const singleSub = Array.isArray(sub) ? sub[0] : sub
        const subPlan = Array.isArray(singleSub?.subscription_plans) ? singleSub?.subscription_plans[0] : singleSub?.subscription_plans

        pendingTransaction = {
            id: pendingTxRaw.id,
            orderId: pendingTxRaw.midtrans_order_id,
            amount: Number(pendingTxRaw.amount),
            createdAt: pendingTxRaw.created_at,
            planName: subPlan?.name || null,
        }
    }

    return (
        <SubscriptionClient
            plans={plans}
            currentStatus={currentStatus}
            trialEndsAt={trialEndsAt}
            currentPlanId={currentPlanId}
            currentPlanName={currentPlanName}
            subscriptionExpiresAt={subscriptionExpiresAt}
            pendingTransaction={pendingTransaction}
        />
    )
}
