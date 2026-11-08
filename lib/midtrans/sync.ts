import { createAdminClient } from '@/lib/supabase/admin'
import { getMidtransCoreApi } from '@/lib/midtrans/config'
import {
    DEFAULT_PLAN_DURATION_DAYS,
    calculateSubscriptionRenewalExpiry,
    type CalculateRenewalExpiryParams,
} from '@/lib/subscription-limits'
import { executeAutoDeactivateOnDowngrade } from '@/lib/subscription-downgrade'

export { calculateSubscriptionRenewalExpiry, type CalculateRenewalExpiryParams }

export interface SyncPaymentResult {
    success: boolean
    orderId: string
    paymentStatus: string
    subscriptionStatus: 'trial' | 'active' | 'expired' | 'canceled' | 'pending'
    message?: string
}

export interface MidtransStatusResponse {
    order_id?: string
    transaction_id?: string
    transaction_status?: string
    fraud_status?: string
    payment_type?: string
    gross_amount?: string | number
    status_code?: string
    signature_key?: string
    [key: string]: unknown
}

interface SubscriptionWithPlan {
    id: string
    business_id: string
    plan_id: string
    status: string
    expires_at: string | null
    subscription_plans: { duration_days: number } | null
}

/**
 * Sinkronisasi status transaksi dari Midtrans ke database Supabase.
 * Memperbarui `payment_transactions`, `subscriptions`, dan `businesses` secara idempoten & bebas race condition.
 */
export async function syncPaymentStatus(
    orderId: string,
    rawNotification?: MidtransStatusResponse
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

    // 2. Fast-path idempotensi: jika di database status sudah settlement, jangan pernah perpanjang lagi
    if (paymentTx.status === 'settlement') {
        return {
            success: true,
            orderId,
            paymentStatus: 'settlement',
            subscriptionStatus: 'active',
        }
    }

    // 3. Query status terbaru dari Core API Midtrans (server-to-server)
    let statusResponse: MidtransStatusResponse | null = null
    try {
        const coreApi = getMidtransCoreApi()
        statusResponse = (await coreApi.transaction.status(orderId)) as MidtransStatusResponse
    } catch (err) {
        console.error('Error fetching status from Midtrans:', err)
        return {
            success: false,
            orderId,
            paymentStatus: paymentTx.status,
            subscriptionStatus: 'pending',
            message: err instanceof Error ? err.message : 'Gagal mengecek status ke Midtrans',
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
        } else if (fraudStatus === 'challenge') {
            paymentStatus = 'challenge'
            subscriptionStatus = 'pending'
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

    // 4 & 5. Penanganan atomik (Compare-And-Swap) khusus settlement agar webhook & manual sync paralel
    //        TIDAK PERNAH bisa menambahkan masa aktif 2 kali untuk order_id yang sama.
    if (paymentStatus === 'settlement') {
        const { data: claimedTx, error: claimError } = await admin
            .from('payment_transactions')
            .update({
                status: 'settlement',
                midtrans_transaction_id: statusResponse.transaction_id,
                payment_type: statusResponse.payment_type,
                raw_notification: rawNotification || statusResponse,
                updated_at: new Date().toISOString(),
            })
            .eq('midtrans_order_id', orderId)
            .neq('status', 'settlement')
            .select('id, business_id, subscription_id')
            .maybeSingle()

        if (claimError) {
            return {
                success: false,
                orderId,
                paymentStatus: paymentTx.status,
                subscriptionStatus: 'pending',
                message: claimError.message,
            }
        }

        // Jika claimedTx null, proses paralel lain sudah mengklaim settlement lebih dulu -> keluar dengan aman!
        if (!claimedTx) {
            return {
                success: true,
                orderId,
                paymentStatus: 'settlement',
                subscriptionStatus: 'active',
            }
        }

        const subscriptionId = claimedTx.subscription_id || paymentTx.subscription_id
        const businessId = claimedTx.business_id || paymentTx.business_id

        const [{ data: subscription }, { data: currentBusiness }] = await Promise.all([
            subscriptionId
                ? admin
                      .from('subscriptions')
                      .select('*, subscription_plans(duration_days, max_branches)')
                      .eq('id', subscriptionId)
                      .single()
                : Promise.resolve({ data: null }),
            businessId
                ? admin
                      .from('businesses')
                      .select('id, subscription_status, subscription_expires_at, subscription_plan_id, subscription_plans(max_branches)')
                      .eq('id', businessId)
                      .single()
                : Promise.resolve({ data: null }),
        ])

        if (subscription) {
            const subData = subscription as unknown as SubscriptionWithPlan & { subscription_plans: { duration_days: number; max_branches?: number } | null }
            const durationDays = subData.subscription_plans?.duration_days ?? DEFAULT_PLAN_DURATION_DAYS

            // Deteksi apakah pembayaran ini adalah downgrade paket
            const oldMaxBranches = currentBusiness?.subscription_status === 'active'
                ? ((currentBusiness as unknown as { subscription_plans?: { max_branches?: number } | null })?.subscription_plans?.max_branches ?? 1)
                : 1
            const newMaxBranches = subData.subscription_plans?.max_branches ?? 1
            const isDowngrade = newMaxBranches < oldMaxBranches

            // Akumulasikan sisa masa aktif dari tabel `businesses` (bukan dari record `pending` baru!)
            const newExpiresAt = calculateSubscriptionRenewalExpiry({
                currentBusinessStatus: currentBusiness?.subscription_status,
                currentBusinessExpiresAt: currentBusiness?.subscription_expires_at,
                durationDays,
            })
            const newExpiresAtIso = newExpiresAt.toISOString()
            const nowIso = new Date().toISOString()

            // Aktifkan record subscription baru ini
            await admin
                .from('subscriptions')
                .update({
                    status: 'active',
                    expires_at: newExpiresAtIso,
                    updated_at: nowIso,
                })
                .eq('id', subscriptionId)

            if (businessId) {
                // Tandai record subscription aktif terdahulu milik bisnis yang sama sebagai 'expired' (digantikan paket baru)
                await admin
                    .from('subscriptions')
                    .update({
                        status: 'expired',
                        updated_at: nowIso,
                    })
                    .eq('business_id', businessId)
                    .eq('status', 'active')
                    .neq('id', subscriptionId)

                // Perbarui status, plan_id (untuk upgrade/ganti paket instan), dan tanggal kedaluwarsa akumulatif bisnis
                await admin
                    .from('businesses')
                    .update({
                        subscription_status: 'active',
                        subscription_plan_id: subscription.plan_id,
                        subscription_expires_at: newExpiresAtIso,
                        updated_at: nowIso,
                    })
                    .eq('id', businessId)

                // Jika terdeteksi downgrade kuota, auto-deaktivasi cabang tambahan dan pegawai kasir non-pusat
                if (isDowngrade) {
                    await executeAutoDeactivateOnDowngrade(businessId, admin)
                }
            }
        }

        return {
            success: true,
            orderId,
            paymentStatus: 'settlement',
            subscriptionStatus: 'active',
        }
    }

    // Non-settlement update: lindungi dengan .neq('status', 'settlement') agar notifikasi pending/cancel terlambat
    // tidak pernah menimpa transaksi yang sudah settlement.
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
        .neq('status', 'settlement')

    if (
        (paymentStatus === 'cancel' || paymentStatus === 'expire' || paymentStatus === 'deny') &&
        paymentTx.subscription_id
    ) {
        // Hanya batalkan record subscription order ini (jangan pernah menyentuh businesses.subscription_status,
        // sehingga bisnis yang sedang aktif tetap aman saat membatalkan rencana upgrade/perpanjangan).
        await admin
            .from('subscriptions')
            .update({
                status: 'canceled',
                updated_at: new Date().toISOString(),
            })
            .eq('id', paymentTx.subscription_id)
            .neq('status', 'active')
    }

    return {
        success: true,
        orderId,
        paymentStatus,
        subscriptionStatus,
    }
}

/**
 * Batalkan transaksi yang belum diselesaikan ketika user keluar/kembali dari popup Snap.
 * Aman untuk bisnis yang sedang berstatus `active`: hanya membatalkan order `pending` ini tanpa mengubah `businesses`.
 */
export async function cancelPendingTransaction(orderId: string, businessId?: string): Promise<boolean> {
    if (!orderId) return false

    const admin = createAdminClient()

    let query = admin
        .from('payment_transactions')
        .select('*')
        .eq('midtrans_order_id', orderId)

    if (businessId) {
        query = query.eq('business_id', businessId)
    }

    const { data: paymentTx } = await query.single()

    if (!paymentTx) return false

    // Jangan pernah ubah jika sudah settlement
    if (paymentTx.status === 'settlement') return false

    const { data: updatedTx } = await admin
        .from('payment_transactions')
        .update({
            status: 'cancel',
            updated_at: new Date().toISOString(),
        })
        .eq('midtrans_order_id', orderId)
        .neq('status', 'settlement')
        .select('id, subscription_id')
        .maybeSingle()

    if (!updatedTx) return false

    if (updatedTx.subscription_id) {
        await admin
            .from('subscriptions')
            .update({
                status: 'canceled',
                updated_at: new Date().toISOString(),
            })
            .eq('id', updatedTx.subscription_id)
            .neq('status', 'active')
    }

    return true
}
