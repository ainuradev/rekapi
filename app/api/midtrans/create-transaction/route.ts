import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getMidtransSnap } from '@/lib/midtrans/config'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()

        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { planId } = await request.json()

        if (!planId) {
            return NextResponse.json({ error: 'Plan ID required' }, { status: 400 })
        }

        // Get user profile and business
        const { data: profile } = await supabase
            .from('profiles')
            .select('business_id, full_name, role, businesses(id, name)')
            .eq('id', user.id)
            .single()

        if (!profile || profile.role !== 'owner') {
            return NextResponse.json({ error: 'Only owners can subscribe' }, { status: 403 })
        }

        // Get subscription plan
        const { data: plan } = await supabase
            .from('subscription_plans')
            .select('*')
            .eq('id', planId)
            .single()

        if (!plan) {
            return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
        }

        const businessId = profile.business_id
        const businessName = (profile as any).businesses?.name || 'Business'

        // Generate unique order ID
        const orderId = `REKAPIN-${businessId.substring(0, 8)}-${Date.now()}`

        // Create subscription record
        const expiresAt = new Date()
        expiresAt.setMonth(expiresAt.getMonth() + 1)

        // Use service role client to bypass RLS for subscription insert
        const supabaseAdmin = createServiceRoleClient()

        const { data: subscription, error: subError } = await supabaseAdmin
            .from('subscriptions')
            .insert({
                business_id: businessId,
                plan_id: planId,
                status: 'trial', // Will be updated to 'active' after payment
                expires_at: expiresAt.toISOString(),
                midtrans_order_id: orderId,
            })
            .select()
            .single()

        if (subError) {
            return NextResponse.json({ error: subError.message }, { status: 500 })
        }

        // Create payment transaction record
        await supabaseAdmin.from('payment_transactions').insert({
            business_id: businessId,
            subscription_id: subscription.id,
            midtrans_order_id: orderId,
            amount: plan.price,
            status: 'pending',
        })

        // Create Midtrans transaction
        const snap = getMidtransSnap()

        const parameter = {
            transaction_details: {
                order_id: orderId,
                gross_amount: Number(plan.price),
            },
            customer_details: {
                first_name: profile.full_name,
                email: user.email || '',
            },
            item_details: [
                {
                    id: plan.code,
                    price: Number(plan.price),
                    quantity: 1,
                    name: `Rekapin ${plan.name} - 1 Bulan`,
                },
            ],
            callbacks: {
                finish: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard/subscription/success`,
                error: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard/subscription/error`,
                pending: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard/subscription/pending`,
            },
        }

        const transaction = await snap.createTransaction(parameter)

        return NextResponse.json({
            token: transaction.token,
            redirectUrl: transaction.redirect_url,
            orderId,
        })
    } catch (error: any) {
        console.error('Create transaction error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to create transaction' },
            { status: 500 }
        )
    }
}
