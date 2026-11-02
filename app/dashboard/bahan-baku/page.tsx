import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getActiveBranchId } from '@/lib/active-branch'
import { checkModuleAccess } from '@/lib/subscription-access'
import PlanFeatureGate from '@/components/plan-feature-gate'
import BahanBakuClient from './bahan-baku-client'
import {
    RawMaterialWithStocks,
    Supplier,
    PurchaseDetail,
    InventoryMutation,
} from '@/types/inventory'

export default async function BahanBakuPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, business_id, branch_id, businesses(subscription_status, trial_ends_at, subscription_expires_at, subscription_plans(code, name))')
        .eq('id', user.id)
        .single()

    if (!profile) {
        redirect('/dashboard')
    }

    // Hanya Owner yang memiliki akses ke modul Bahan Baku & Pembelian
    if (profile.role !== 'owner') {
        redirect('/dashboard/penjualan')
    }

    const businessData = profile.businesses as unknown as {
        subscription_status: string | null
        trial_ends_at: string | null
        subscription_expires_at: string | null
        subscription_plans?: { code: string; name: string } | null
    } | null

    const moduleAccess = checkModuleAccess(
        {
            status: businessData?.subscription_status || 'trial',
            planCode: businessData?.subscription_plans?.code || null,
            trialEndsAt: businessData?.trial_ends_at || null,
            expiresAt: businessData?.subscription_expires_at || null,
        },
        'raw_materials'
    )

    if (!moduleAccess.allowed) {
        return (
            <PlanFeatureGate
                module="raw_materials"
                currentPlanName={
                    businessData?.subscription_plans?.name ||
                    (businessData?.subscription_status === 'trial' ? 'Trial 7 Hari' : 'Standard')
                }
            />
        )
    }

    const isOwner = profile.role === 'owner'

    // Ambil daftar cabang
    const { data: branches } = await supabase
        .from('branches')
        .select('id, name')
        .order('name')

    // 1. Ambil master bahan baku beserta stok tiap cabang dan stok global (induk)
    let rawMaterialsRaw: unknown[] | null = null
    const resWithStock = await supabase
        .from('raw_materials')
        .select(`
            id,
            business_id,
            sku,
            name,
            category,
            unit,
            cost_per_unit,
            min_stock,
            status,
            stock,
            created_at,
            updated_at,
            raw_material_branch_stocks (
                id,
                branch_id,
                quantity,
                branches (name)
            )
        `)
        .order('name')

    if (resWithStock.error && resWithStock.error.code === '42703') {
        // Fallback jika migrasi 0026 belum dijalankan di Supabase
        const fallbackRes = await supabase
            .from('raw_materials')
            .select(`
                id,
                business_id,
                sku,
                name,
                category,
                unit,
                cost_per_unit,
                min_stock,
                status,
                created_at,
                updated_at,
                raw_material_branch_stocks (
                    id,
                    branch_id,
                    quantity,
                    branches (name)
                )
            `)
            .order('name')
        rawMaterialsRaw = fallbackRes.data
    } else {
        rawMaterialsRaw = resWithStock.data
    }

    interface RawBranchStockDb {
        id: string
        branch_id: string
        quantity: number
        branches: { name: string } | null
    }

    interface RawMaterialDb {
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
        raw_material_branch_stocks: RawBranchStockDb[]
    }

    const rawMaterials: RawMaterialWithStocks[] = ((rawMaterialsRaw ?? []) as unknown as RawMaterialDb[]).map((rm) => {
        const stocks = (rm.raw_material_branch_stocks || []).map((s) => ({
            branch_id: s.branch_id,
            branch_name: s.branches?.name || 'Cabang',
            quantity: Number(s.quantity) || 0,
        }))
        const totalBranchStock = stocks.reduce((sum, s) => sum + s.quantity, 0)
        return {
            id: rm.id,
            business_id: rm.business_id,
            sku: rm.sku,
            name: rm.name,
            category: rm.category,
            unit: rm.unit,
            cost_per_unit: Number(rm.cost_per_unit) || 0,
            min_stock: Number(rm.min_stock) || 0,
            status: rm.status,
            stock: Number(rm.stock ?? 0),
            created_at: rm.created_at,
            updated_at: rm.updated_at,
            branch_stocks: stocks,
            total_stock: totalBranchStock,
            is_low_stock: (Number(rm.stock ?? 0) + totalBranchStock) <= Number(rm.min_stock),
        }
    })

    // 2. Ambil master supplier
    const { data: suppliersRaw, error: supError } = await supabase
        .from('suppliers')
        .select('*')
        .order('name')

    if (supError) {
        console.warn('Note: suppliers table might not be initialized yet:', supError.message)
    }

    const suppliers: Supplier[] = (suppliersRaw as Supplier[]) ?? []

    // 3. Ambil riwayat pembelian terintegrasi
    const { data: purchasesRaw, error: purError } = await supabase
        .from('purchases')
        .select(`
            id,
            business_id,
            branch_id,
            supplier_id,
            supplier,
            purchase_date,
            total,
            payment_status,
            payment_method,
            account_id,
            paid_amount,
            due_date,
            created_at,
            branches (name),
            suppliers (name, phone),
            purchase_items (
                id,
                purchase_id,
                raw_material_id,
                item_name,
                quantity,
                price,
                subtotal,
                unit,
                raw_materials (name, unit)
            )
        `)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false })

    if (purError) {
        console.warn('Note: purchases query warning:', purError.message)
    }

    const purchases: PurchaseDetail[] = (purchasesRaw as unknown as PurchaseDetail[]) ?? []

    // 4. Ambil akun keuangan untuk opsi pembayaran belanja bahan baku
    const { data: accountsRaw } = await supabase
        .from('financial_accounts')
        .select('id, name, type, is_default_cash, is_default_bank')
        .eq('status', 'active')
        .order('name')

    const accounts = accountsRaw ?? []

    // 5. Ambil riwayat kartu mutasi (ledger)
    const { data: mutationsRaw, error: mutError } = await supabase
        .from('inventory_mutations')
        .select(`
            id,
            business_id,
            branch_id,
            raw_material_id,
            mutation_type,
            quantity_change,
            balance_after,
            notes,
            reference_id,
            user_id,
            created_at,
            branches (name),
            raw_materials (name, unit),
            profiles (full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(200)

    if (mutError) {
        console.warn('Note: inventory_mutations table warning:', mutError.message)
    }

    const mutations: InventoryMutation[] = (mutationsRaw as unknown as InventoryMutation[]) ?? []

    const activeBranchId = await getActiveBranchId()

    return (
        <BahanBakuClient
            key={activeBranchId || 'all'}
            isOwner={isOwner}
            currentBranchId={profile.branch_id || null}
            defaultBranchId={activeBranchId || 'all'}
            branches={branches ?? []}
            accounts={accounts}
            initialRawMaterials={rawMaterials}
            initialSuppliers={suppliers}
            initialPurchases={purchases}
            initialMutations={mutations}
        />
    )
}
