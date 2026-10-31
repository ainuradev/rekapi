export type CustomerCategory = 'regular' | 'member' | 'vip' | 'wholesale'

export interface Customer {
    id: string
    business_id: string
    code: string | null
    name: string
    phone: string | null
    email: string | null
    address: string | null
    category: CustomerCategory
    default_discount_pct: number
    receivable_limit: number
    notes: string | null
    registered_at: string
    status: 'active' | 'inactive'
    created_at: string
    updated_at: string
    total_orders?: number
    total_spent?: number
}
