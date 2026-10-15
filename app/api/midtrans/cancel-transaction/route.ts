import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cancelPendingTransaction } from '@/lib/midtrans/sync'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { orderId } = await request.json()
        if (!orderId) {
            return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
        }

        await cancelPendingTransaction(orderId)

        return NextResponse.json({ status: 'canceled' })
    } catch (error: any) {
        console.error('Cancel transaction error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to cancel transaction' },
            { status: 500 }
        )
    }
}
