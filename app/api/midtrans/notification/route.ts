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
            .select('*, subscriptions(id, business_id)')
            .eq('midtrans_order_id', orderId)
            .single()

        if (!paymentTx) {
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
        }

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

        // Update subscription status
        if (paymentStatus === 'settlement' && paymentTx.subscription_id) {
            await admin
                .from('subscriptions')
                .update({
                    status: subscriptionStatus,
                })
                .eq('id', paymentTx.subscription_id)

            // Update business subscription status
            const businessId = (paymentTx.subscriptions as any)?.business_id
            if (businessId) {
                await admin
                    .from('businesses')
                    .update({
                        subscription_status: subscriptionStatus,
                    })
                    .eq('id', businessId)
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
