import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMidtransCoreApi } from '@/lib/midtrans/config'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
    try {
        const notification = await request.json()

        // Verify signature hash
        const serverKey = process.env.MIDTRANS_SERVER_KEY || ''
        const orderId = notification.order_id
        const statusCode = notification.status_code
        const grossAmount = notification.gross_amount
        const signatureKey = notification.signature_key

        const hash = crypto
            .createHash('sha512')
            .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
            .digest('hex')

        if (hash !== signatureKey) {
            console.error('Invalid signature')
            return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
        }

        // Get transaction status from Midtrans
        const coreApi = getMidtransCoreApi()
        const statusResponse = await coreApi.transaction.status(orderId)

        const transactionStatus = statusResponse.transaction_status
        const fraudStatus = statusResponse.fraud_status

        const admin = createAdminClient()

        // Update payment transaction
        const { data: paymentTx } = await admin
            .from('payment_transactions')
            .select('*')
            .eq('midtrans_order_id', orderId)
            .single()

        if (!paymentTx) {
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
        }

        console.log('Payment transaction found:', paymentTx)

        let paymentStatus = 'pending'
        let subscriptionStatus: 'trial' | 'active' | 'expired' | 'canceled' = 'trial'

        if (transactionStatus === 'capture') {
            if (fraudStatus === 'accept') {
                paymentStatus = 'settlement'
                subscriptionStatus = 'active'
            }
        } else if (transactionStatus === 'settlement') {
            paymentStatus = 'settlement'
            subscriptionStatus = 'active'
        } else if (
            transactionStatus === 'cancel' ||
            transactionStatus === 'deny' ||
            transactionStatus === 'expire'
        ) {
            paymentStatus = transactionStatus
            subscriptionStatus = 'expired'
        } else if (transactionStatus === 'pending') {
            paymentStatus = 'pending'
        }

        // Update payment transaction
        await admin
            .from('payment_transactions')
            .update({
                status: paymentStatus,
                midtrans_transaction_id: statusResponse.transaction_id,
                payment_type: statusResponse.payment_type,
                raw_notification: notification,
                updated_at: new Date().toISOString(),
            })
            .eq('midtrans_order_id', orderId)

        // Update subscription status and business status if payment is settled
        if (paymentStatus === 'settlement') {
            console.log('Payment settled, updating subscription and business status')

            // Get subscription to calculate expiry date
            const { data: subscription } = await admin
                .from('subscriptions')
                .select('*')
                .eq('id', paymentTx.subscription_id)
                .single()

            if (subscription) {
                // Calculate new expiry date (30 days from now)
                const newExpiresAt = new Date()
                newExpiresAt.setDate(newExpiresAt.getDate() + 30)

                // Update subscription status
                const { error: subError } = await admin
                    .from('subscriptions')
                    .update({
                        status: subscriptionStatus,
                        expires_at: newExpiresAt.toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', paymentTx.subscription_id)

                if (subError) {
                    console.error('Failed to update subscription:', subError)
                } else {
                    console.log('Subscription updated successfully')
                }

                // Update business subscription status
                const businessId = paymentTx.business_id
                if (businessId) {
                    const { error: bizError } = await admin
                        .from('businesses')
                        .update({
                            subscription_status: subscriptionStatus,
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', businessId)

                    if (bizError) {
                        console.error('Failed to update business:', bizError)
                    } else {
                        console.log('Business subscription status updated successfully')
                    }
                }
            }
        }

        return NextResponse.json({ status: 'success' })
    } catch (error: any) {
        console.error('Notification error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to process notification' },
            { status: 500 }
        )
    }
}
