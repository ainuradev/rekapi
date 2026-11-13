import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getMidtransSnap, validateMidtransConfig, MidtransConfigError } from '@/lib/midtrans/config'
import { OFFICIAL_PLAN_CATALOG } from '@/lib/subscription-limits'

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

        // Generate unique order ID
        const orderId = `REKAPI-${businessId.substring(0, 8)}-${Date.now()}`

        // Use service role client to bypass RLS for subscription insert.
        // Catatan penting: `expires_at` dibiarkan `null` saat status `pending` dan baru dihitung
        // secara akurat saat `settlement` di `syncPaymentStatus` (mengakumulasi sisa hari aktif dari `businesses`).
        const supabaseAdmin = createServiceRoleClient()

        const { data: subscription, error: subError } = await supabaseAdmin
            .from('subscriptions')
            .insert({
                business_id: businessId,
                plan_id: planId,
                status: 'pending', // Will be updated to 'active' after payment settlement
                expires_at: null,
                midtrans_order_id: orderId,
            })
            .select()
            .single()

        if (subError) {
            return NextResponse.json({ error: subError.message }, { status: 500 })
        }

        const chargeAmount =
            OFFICIAL_PLAN_CATALOG[plan.code as keyof typeof OFFICIAL_PLAN_CATALOG]?.price ?? Number(plan.price)

        // Create payment transaction record
        await supabaseAdmin.from('payment_transactions').insert({
            business_id: businessId,
            subscription_id: subscription.id,
            midtrans_order_id: orderId,
            amount: chargeAmount,
            status: 'pending',
        })

        // Validasi konfigurasi Midtrans secara fail-closed
        const midtransConfig = validateMidtransConfig()
        const snap = getMidtransSnap()

        const origin =
            process.env.NEXT_PUBLIC_SITE_URL ||
            request.headers.get('origin') ||
            request.nextUrl.origin ||
            'http://localhost:3000'

        const customerName = (profile.full_name && profile.full_name.trim()) || user.email?.split('@')[0] || 'Owner'

        const parameter = {
            transaction_details: {
                order_id: orderId,
                gross_amount: chargeAmount,
            },
            customer_details: {
                first_name: customerName,
                email: user.email || '',
            },
            item_details: [
                {
                    id: plan.code,
                    price: chargeAmount,
                    quantity: 1,
                    name: `Rekapi ${plan.name} - ${plan.duration_days ?? 28} Hari`,
                },
            ],
            callbacks: {
                finish: `${origin}/dashboard/subscription/success`,
                unfinish: `${origin}/dashboard/subscription/unfinish`,
                error: `${origin}/dashboard/subscription/error`,
            },
        }

        const transaction = await snap.createTransaction(parameter)

        return NextResponse.json({
            token: transaction.token,
            redirectUrl: transaction.redirect_url,
            orderId,
            snapUrl: midtransConfig.snapUrl,
            clientKey: midtransConfig.clientKey,
        })
    } catch (error) {
        console.error('Create transaction error:', error)
        if (error instanceof MidtransConfigError) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            )
        }
        const message = error instanceof Error ? error.message : 'Failed to create transaction'
        return NextResponse.json(
            { error: message },
            { status: 500 }
        )
    }
}
