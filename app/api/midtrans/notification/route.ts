import { NextRequest, NextResponse } from 'next/server'
import { syncPaymentStatus } from '@/lib/midtrans/sync'
import { validateMidtransConfig, MidtransConfigError } from '@/lib/midtrans/config'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
    try {
        const notification = await request.json()

        // Verify signature hash dengan kredensial terverifikasi
        let serverKey: string
        try {
            const config = validateMidtransConfig()
            serverKey = config.serverKey
        } catch (configErr) {
            console.error(
                'Midtrans notification config validation failed:',
                configErr instanceof MidtransConfigError ? configErr.message : configErr
            )
            return NextResponse.json(
                { error: 'Server misconfigured or environment mismatch' },
                { status: 500 }
            )
        }

        const orderId = notification.order_id
        const statusCode = notification.status_code
        const grossAmount = notification.gross_amount
        const signatureKey = notification.signature_key

        if (!orderId || !statusCode || !grossAmount || !signatureKey) {
            return NextResponse.json({ error: 'Payload tidak lengkap' }, { status: 400 })
        }

        const hash = crypto
            .createHash('sha512')
            .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
            .digest('hex')

        if (hash !== signatureKey) {
            console.error('Invalid signature')
            return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
        }

        const result = await syncPaymentStatus(orderId, notification)

        if (!result.success && result.message === 'Transaksi tidak ditemukan di database') {
            return NextResponse.json({ error: result.message }, { status: 404 })
        }

        return NextResponse.json({ status: 'success', result })
    } catch (error) {
        console.error('Notification error:', error)
        const message = error instanceof Error ? error.message : 'Failed to process notification'
        return NextResponse.json(
            { error: message },
            { status: 500 }
        )
    }
}
