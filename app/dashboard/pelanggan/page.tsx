import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getActiveBranchId } from '@/lib/active-branch'
import PelangganClient from './pelanggan-client'
import { Customer } from '@/types/customer'

export default async function PelangganPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, business_id')
        .eq('id', user.id)
        .single()

    const isOwner = profile?.role === 'owner'
    const businessId = profile?.business_id
    const activeBranchId = await getActiveBranchId()

    let customers: Customer[] = []

    if (businessId) {
        // 1. Fetch real customers from Supabase
        const { data: dbCustomers, error: custErr } = await supabase
            .from('customers')
            .select('*')
            .eq('business_id', businessId)
            .order('name', { ascending: true })

        if (!custErr && dbCustomers) {
            // 2. Fetch sales summary to compute real loyalty metrics (filtered by branch if chosen)
            let salesQuery = supabase
                .from('sales')
                .select('customer_id, total')
                .eq('business_id', businessId)
                .neq('status', 'voided')
                .not('customer_id', 'is', null)

            if (activeBranchId && activeBranchId !== 'all') {
                salesQuery = salesQuery.eq('branch_id', activeBranchId)
            }

            const { data: customerSales } = await salesQuery

            const salesStats = new Map<string, { count: number; total: number }>()
            for (const s of customerSales ?? []) {
                if (!s.customer_id) continue
                const curr = salesStats.get(s.customer_id) || { count: 0, total: 0 }
                curr.count += 1
                curr.total += Number(s.total || 0)
                salesStats.set(s.customer_id, curr)
            }

            customers = dbCustomers.map((c) => {
                const stat = salesStats.get(c.id)
                return {
                    ...c,
                    total_orders: stat?.count ?? 0,
                    total_spent: stat?.total ?? 0,
                }
            })
        }
    }

    return (
        <PelangganClient
            key={activeBranchId || 'all'}
            initialCustomers={customers}
            isOwner={isOwner}
        />
    )
}
