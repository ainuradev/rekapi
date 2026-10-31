export type MutationType =
    | 'purchase_in'
    | 'opening_balance'
    | 'adjustment'
    | 'waste'
    | 'transfer_in'
    | 'transfer_out'

export interface Supplier {
    id: string
    business_id: string
    code?: string | null
    name: string
    category?: string | null
    pic_name?: string | null
    phone: string | null
    email: string | null
    address: string | null
    npwp?: string | null
    bank_details: string | null
    payment_terms_days?: number
    credit_limit?: number
    notes: string | null
    status: 'active' | 'inactive'
    created_at: string
    updated_at: string
}

export interface SupplierItem {
    id: string
    business_id: string
    supplier_id: string
    raw_material_id: string
    supplier_product_code: string | null
    last_price: number
    min_order_qty: number
    lead_time_days: number
    is_preferred: boolean
    notes: string | null
    created_at: string
    updated_at: string
    raw_materials?: {
        name: string
        unit: string
        sku: string | null
    } | null
}

export interface RawMaterial {
    id: string
    business_id: string
    sku: string | null
    name: string
    category: string | null
    unit: string
    cost_per_unit: number
    min_stock: number
    status: 'active' | 'inactive'
    stock?: number
    created_at: string
    updated_at: string
}

export interface RawMaterialBranchStock {
    id: string
    business_id: string
    raw_material_id: string
    branch_id: string
    quantity: number
    created_at: string
    updated_at: string
    branches?: {
        name: string
    } | null
}

export interface RawMaterialWithStocks extends RawMaterial {
    branch_stocks: {
        branch_id: string
        branch_name: string
        quantity: number
    }[]
    total_stock: number
    is_low_stock: boolean
}

export interface InventoryMutation {
    id: string
    business_id: string
    branch_id: string
    raw_material_id: string
    mutation_type: MutationType
    quantity_change: number
    balance_after: number
    notes: string | null
    reference_id: string | null
    user_id: string | null
    created_at: string
    branches?: {
        name: string
    } | null
    raw_materials?: {
        name: string
        unit: string
    } | null
    profiles?: {
        full_name: string | null
    } | null
}

export interface PurchaseItemDetail {
    id: string
    purchase_id: string
    raw_material_id: string | null
    item_name: string
    quantity: number
    price: number
    subtotal: number
    unit: string | null
    raw_materials?: {
        name: string
        unit: string
    } | null
}

export interface PurchaseDetail {
    id: string
    business_id: string
    branch_id: string
    supplier_id: string | null
    supplier: string | null
    purchase_date: string
    total: number
    payment_status?: 'paid' | 'unpaid'
    payment_method?: string
    account_id?: string | null
    paid_amount?: number
    due_date?: string | null
    created_at: string
    branches: {
        name: string
    } | null
    suppliers: {
        name: string
        phone: string | null
    } | null
    purchase_items: PurchaseItemDetail[]
}
