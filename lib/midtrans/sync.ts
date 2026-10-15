import { createAdminClient } from '@/lib/supabase/admin'
import { getMidtransCoreApi } from '@/lib/midtrans/config'

export interface SyncPaymentResult {
    success: boolean
    orderId: string
    paymentStatus: string
    subscriptionStatus: 'trial' | 'active' | 'expired' | 'canceled' | 'pending'
    message?: string
}

/**
 * Sinkronisasi status transaksi dari Midtrans ke database Supabase
 * Memperbarui payment_transactions, subscriptions, dan businesses.
 */
export async function syncPaymentStatus(
    orderId: string,
    rawNotification?: any
): Promise<SyncPaymentResult> {
    if (!orderId) {
        return {
            success: false,
            orderId: '',
            paymentStatus: 'unknown',
            subscriptionStatus: 'pending',
            message: 'Order ID is required',
        }
    }

    const admin = createAdminClient()

    // 1. Ambil data payment transaction dari DB
    const { data: paymentTx, error: txError } = await admin
        .from('payment_transactions')
        .select('*')
        .eq('midtrans_order_id', orderId)
        .single()

    if (txError || !paymentTx) {
        return {
            success: false,
            orderId,
            paymentStatus: 'unknown',
            subscriptionStatus: 'pending',
            message: 'Transaksi tidak ditemukan di database',
        }
    }

    // 2. Jika di database status sudah settlement, pastikan langganan aktif
    if (paymentTx.status === 'settlement') {
        return {
            success: true,
            orderId,
            paymentStatus: 'settlement',
            subscriptionStatus: 'active',
        }
    }

    // 3. Query status terbaru dari Core API Midtrans
    let statusResponse: any
    try {
        const coreApi = getMidtransCoreApi()
        statusResponse = await coreApi.transaction.status(orderId)
    } catch (err: any) {
        console.error('Error fetching status from Midtrans:', err)
        return {
            success: false,
            orderId,
            paymentStatus: paymentTx.status,
            subscriptionStatus: 'pending',
            message: err.message || 'Gagal mengecek status ke Midtrans',
        }
    }

    const transactionStatus = statusResponse.transaction_status
    const fraudStatus = statusResponse.fraud_status

    let paymentStatus = 'pending'
    let subscriptionStatus: 'trial' | 'active' | 'expired' | 'canceled' | 'pending' = 'pending'

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
        subscriptionStatus = 'canceled'
    } else if (transactionStatus === 'pending') {
        paymentStatus = 'pending'
        subscriptionStatus = 'pending'
    }

    // 4. Update tabel payment_transactions
    await admin
        .from('payment_transactions')
        .update({
            status: paymentStatus,
            midtrans_transaction_id: statusResponse.transaction_id,
            payment_type: statusResponse.payment_type,
            raw_notification: rawNotification || statusResponse,
            updated_at: new Date().toISOString(),
        })
        .eq('midtrans_order_id', orderId)

    // 5. Update subscription & business jika pembayaran berhasil (settlement)
    if (paymentStatus === 'settlement') {
        const { data: subscription } = await admin
            .from('subscriptions')
            .select('*, subscription_plans(duration_days)')
            .eq('id', paymentTx.subscription_id)
            .single()

        if (subscription) {
            const durationDays = (subscription as any).subscription_plans?.duration_days ?? 28
            const newExpiresAt = new Date()
            newExpiresAt.setDate(newExpiresAt.getDate() + durationDays)

            await admin
                .from('subscriptions')
                .update({
                    status: 'active',
                    expires_at: newExpiresAt.toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', paymentTx.subscription_id)

            const businessId = paymentTx.business_id
            if (businessId) {
                await admin
                    .from('businesses')
                    .update({
                        subscription_status: 'active',
                        subscription_plan_id: subscription.plan_id,
                        subscription_expires_at: newExpiresAt.toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', businessId)
            }
        }
    } else if (
        paymentStatus === 'cancel' ||
        paymentStatus === 'expire' ||
        paymentStatus === 'deny'
    ) {
        // Jika dibatalkan atau kedaluwarsa, ubah status subscription jadi canceled
        await admin
            .from('subscriptions')
            .update({
                status: 'canceled',
                updated_at: new Date().toISOString(),
            })
            .eq('id', paymentTx.subscription_id)
    }

    return {
        success: true,
        orderId,
        paymentStatus,
        subscriptionStatus,
    }
}

/**
 * Batalkan transaksi yang belum diselesaikan ketika user keluar/kembali
 */
export async function cancelPendingTransaction(orderId: string): Promise<boolean> {
    if (!orderId) return false

    const admin = createAdminClient()

    const { data: paymentTx } = await admin
        .from('payment_transactions')
        .select('*')
        .eq('midtrans_order_id', orderId)
        .single()

    if (!paymentTx) return false

    // Jangan ubah jika sudah settlement
    if (paymentTx.status === 'settlement') return false

    await admin
        .from('payment_transactions')
        .update({
            status: 'cancel',
            updated_at: new Date().toISOString(),
        })
        .eq('midtrans_order_id', orderId)

    if (paymentTx.subscription_id) {
        await admin
            .from('subscriptions')
            .update({
                status: 'canceled',
                updated_at: new Date().toISOString(),
            })
            .eq('id', paymentTx.subscription_id)
    }

    return true
}
