import { NextRequest, NextResponse } from 'next/server'
import { syncPaymentStatus } from '@/lib/midtrans/sync'
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

        const result = await syncPaymentStatus(orderId, notification)

        if (!result.success && result.message === 'Transaksi tidak ditemukan di database') {
            return NextResponse.json({ error: result.message }, { status: 404 })
        }

        return NextResponse.json({ status: 'success', result })
    } catch (error: any) {
        console.error('Notification error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to process notification' },
            { status: 500 }
        )
    }
}
