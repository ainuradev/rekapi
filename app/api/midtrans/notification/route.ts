import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMidtransCoreApi } from '@/lib/midtrans/config'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
    try {
        const notification = await request.json()
        console.log('📥 Midtrans notification received:', notification.order_id)

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
            console.error('❌ Invalid signature for order:', orderId)
            return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
        }

        console.log('✅ Signature verified for order:', orderId)

        // Get transaction status from Midtrans
        const coreApi = getMidtransCoreApi()
        const statusResponse = await coreApi.transaction.status(orderId)

        const transactionStatus = statusResponse.transaction_status
        const fraudStatus = statusResponse.fraud_status

        console.log('📊 Transaction status:', {
            orderId,
            transactionStatus,
            fraudStatus,
            paymentType: statusResponse.payment_type,
        })

        const admin = createAdminClient()

        // Update payment transaction
        const { data: paymentTx } = await admin
            .from('payment_transactions')
            .select('*')
            .eq('midtrans_order_id', orderId)
            .single()

        if (!paymentTx) {
            console.error('❌ Transaction not found:', orderId)
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
        }

        console.log('💳 Payment transaction found:', {
            id: paymentTx.id,
            businessId: paymentTx.business_id,
            subscriptionId: paymentTx.subscription_id,
        })

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

        console.log('🔄 Determined status:', { paymentStatus, subscriptionStatus })

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

        console.log('✅ Payment transaction updated')

        // Update subscription status
        if (paymentStatus === 'settlement' && paymentTx.subscription_id) {
            const { error: subError } = await admin
                .from('subscriptions')
                .update({
                    status: subscriptionStatus,
                })
                .eq('id', paymentTx.subscription_id)

            if (subError) {
                console.error('❌ Failed to update subscription:', subError)
            } else {
                console.log('✅ Subscription status updated to:', subscriptionStatus)
            }

            // Update business subscription status - use business_id directly from payment_transactions
            const businessId = paymentTx.business_id
            if (businessId) {
                const { error: bizError } = await admin
                    .from('businesses')
                    .update({
                        subscription_status: subscriptionStatus,
                    })
                    .eq('id', businessId)

                if (bizError) {
                    console.error('❌ Failed to update business:', bizError)
                } else {
                    console.log('✅ Business subscription status updated:', businessId)
                }
            } else {
                console.error('❌ No business_id found in payment transaction')
            }
        } else {
            console.log('⏭️ Skipping subscription update:', {
                reason:
                    paymentStatus !== 'settlement'
                        ? 'Payment not settled'
                        : 'No subscription_id',
            })
        }

        console.log('✅ Notification processed successfully')
        return NextResponse.json({ status: 'success' })
    } catch (error: any) {
        console.error('❌ Notification error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to process notification' },
            { status: 500 }
        )
    }
}
