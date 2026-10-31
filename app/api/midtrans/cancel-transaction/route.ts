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

        const { data: profile } = await supabase
            .from('profiles')
            .select('business_id, role')
            .eq('id', user.id)
            .single()

        if (!profile || profile.role !== 'owner') {
            return NextResponse.json({ error: 'Hanya owner yang dapat membatalkan transaksi langganan' }, { status: 403 })
        }

        const success = await cancelPendingTransaction(orderId, profile.business_id)

        if (!success) {
            return NextResponse.json(
                { error: 'Transaksi tidak ditemukan atau Anda tidak memiliki akses ke transaksi ini' },
                { status: 404 }
            )
        }

        return NextResponse.json({ status: 'canceled' })
    } catch (error) {
        console.error('Cancel transaction error:', error)
        const message = error instanceof Error ? error.message : 'Failed to cancel transaction'
        return NextResponse.json(
            { error: message },
            { status: 500 }
        )
    }
}
