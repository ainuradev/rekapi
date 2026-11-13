'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { Supplier, SupplierItem } from '@/types/inventory'
import { checkServerModuleAccess } from '@/lib/subscription-access'

export interface CreateSupplierInput {
    code?: string
    name: string
    category?: string
    pic_name?: string
    phone?: string
    email?: string
    address?: string
    npwp?: string
    bank_details?: string
    payment_terms_days?: number
    credit_limit?: number
    notes?: string
}

export interface UpdateSupplierInput {
    code?: string
    name: string
    category?: string
    pic_name?: string
    phone?: string
    email?: string
    address?: string
    npwp?: string
    bank_details?: string
    payment_terms_days?: number
    credit_limit?: number
    notes?: string
    status?: 'active' | 'inactive'
}

export interface SupplierItemInput {
    supplier_id: string
    raw_material_id: string
    supplier_product_code?: string
    last_price?: number
    min_order_qty?: number
    lead_time_days?: number
    is_preferred?: boolean
    notes?: string
}

export async function createSupplier(payload: CreateSupplierInput) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized: Sesi tidak ditemukan.' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil tidak ditemukan.' }
    if (profile.role !== 'owner') return { error: 'Hanya Owner yang dapat menambahkan supplier.' }

    const subCheck = await checkServerModuleAccess(profile.business_id, 'raw_materials', supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const name = payload.name?.trim()
    if (!name) return { error: 'Nama supplier wajib diisi.' }

    const paymentTerms = Number(payload.payment_terms_days || 0)
    if (isNaN(paymentTerms) || paymentTerms < 0) {
        return { error: 'Termin pembayaran harus berupa angka non-negatif.' }
    }

    const creditLimit = Number(payload.credit_limit || 0)
    if (isNaN(creditLimit) || creditLimit < 0) {
        return { error: 'Limit kredit tidak boleh bernilai negatif.' }
    }

    const { data, error } = await supabase
        .from('suppliers')
        .insert({
            business_id: profile.business_id,
            code: payload.code?.trim() || null,
            name,
            category: payload.category?.trim() || null,
            pic_name: payload.pic_name?.trim() || null,
            phone: payload.phone?.trim() || null,
            email: payload.email?.trim() || null,
            address: payload.address?.trim() || null,
            npwp: payload.npwp?.trim() || null,
            bank_details: payload.bank_details?.trim() || null,
            payment_terms_days: paymentTerms,
            credit_limit: creditLimit,
            notes: payload.notes?.trim() || null,
            status: 'active',
        })
        .select()
        .single()

    if (error) {
        if (error.code === '23505') {
            return { error: 'Kode supplier sudah digunakan pada bisnis Anda.' }
        }
        return { error: error.message }
    }

    revalidatePath('/dashboard/bahan-baku')
    revalidatePath('/dashboard/data')
    return { success: true, data: data as Supplier }
}

export async function updateSupplier(id: string, payload: UpdateSupplierInput) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized: Sesi tidak ditemukan.' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil tidak ditemukan.' }
    if (profile.role !== 'owner') return { error: 'Hanya Owner yang dapat mengubah data supplier.' }

    const subCheck = await checkServerModuleAccess(profile.business_id, 'raw_materials', supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const name = payload.name?.trim()
    if (!name) return { error: 'Nama supplier wajib diisi.' }

    const paymentTerms = Number(payload.payment_terms_days || 0)
    if (isNaN(paymentTerms) || paymentTerms < 0) {
        return { error: 'Termin pembayaran harus berupa angka non-negatif.' }
    }

    const creditLimit = Number(payload.credit_limit || 0)
    if (isNaN(creditLimit) || creditLimit < 0) {
        return { error: 'Limit kredit tidak boleh bernilai negatif.' }
    }

    const { error } = await supabase
        .from('suppliers')
        .update({
            code: payload.code?.trim() || null,
            name,
            category: payload.category?.trim() || null,
            pic_name: payload.pic_name?.trim() || null,
            phone: payload.phone?.trim() || null,
            email: payload.email?.trim() || null,
            address: payload.address?.trim() || null,
            npwp: payload.npwp?.trim() || null,
            bank_details: payload.bank_details?.trim() || null,
            payment_terms_days: paymentTerms,
            credit_limit: creditLimit,
            notes: payload.notes?.trim() || null,
            status: payload.status || 'active',
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('business_id', profile.business_id)

    if (error) {
        if (error.code === '23505') {
            return { error: 'Kode supplier sudah digunakan pada bisnis Anda.' }
        }
        return { error: error.message }
    }

    revalidatePath('/dashboard/bahan-baku')
    revalidatePath('/dashboard/data')
    return { success: true }
}

export async function deleteSupplier(id: string) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized: Sesi tidak ditemukan.' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil tidak ditemukan.' }
    if (profile.role !== 'owner') return { error: 'Hanya Owner yang dapat menghapus supplier.' }

    const subCheck = await checkServerModuleAccess(profile.business_id, 'raw_materials', supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    // Cek apakah supplier memiliki riwayat pembelian
    const { count: purchaseCount } = await supabase
        .from('purchases')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', id)

    if (purchaseCount && purchaseCount > 0) {
        return {
            error: `Supplier tidak dapat dihapus karena tercatat dalam ${purchaseCount} transaksi pembelian historis. Ubah status menjadi non-aktif untuk menonaktifkan supplier ini.`,
        }
    }

    const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', id)
        .eq('business_id', profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/bahan-baku')
    revalidatePath('/dashboard/data')
    return { success: true }
}

export async function getSupplierDetailWithPurchases(supplierId: string) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner') {
        return { error: 'Hanya Owner yang dapat melihat detail supplier.' }
    }

    const subCheck = await checkServerModuleAccess(profile.business_id, 'raw_materials', supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const { data: supplier, error: sErr } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', supplierId)
        .eq('business_id', profile.business_id)
        .single()

    if (sErr || !supplier) {
        return { error: 'Supplier tidak ditemukan.' }
    }

    const { data: purchases, error: pErr } = await supabase
        .from('purchases')
        .select(`
            id,
            purchase_date,
            total,
            created_at,
            branches (name),
            purchase_items (id, item_name, quantity, price, subtotal, unit)
        `)
        .eq('supplier_id', supplierId)
        .eq('business_id', profile.business_id)
        .order('purchase_date', { ascending: false })

    if (pErr) return { error: pErr.message }

    // Fetch supplier items (catalog bahan baku)
    const { data: supplierItems } = await supabase
        .from('supplier_items')
        .select(`
            id,
            business_id,
            supplier_id,
            raw_material_id,
            supplier_product_code,
            last_price,
            min_order_qty,
            lead_time_days,
            is_preferred,
            notes,
            created_at,
            updated_at,
            raw_materials (name, unit, sku)
        `)
        .eq('supplier_id', supplierId)
        .eq('business_id', profile.business_id)
        .order('created_at', { ascending: false })

    return {
        success: true,
        data: {
            supplier: supplier as Supplier,
            purchases: purchases ?? [],
            supplier_items: (supplierItems as unknown as SupplierItem[]) ?? [],
        },
    }
}

// -------------------------------------------------------------
// SUPPLIER ITEMS (Bahan Baku yang Dipasok oleh Supplier)
// -------------------------------------------------------------

export async function getSupplierItems(supplierId: string) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner') return { error: 'Hanya Owner yang dapat mengakses katalog supplier.' }

    const subCheck = await checkServerModuleAccess(profile.business_id, 'raw_materials', supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const { data, error } = await supabase
        .from('supplier_items')
        .select(`
            id,
            business_id,
            supplier_id,
            raw_material_id,
            supplier_product_code,
            last_price,
            min_order_qty,
            lead_time_days,
            is_preferred,
            notes,
            created_at,
            updated_at,
            raw_materials (name, unit, sku)
        `)
        .eq('supplier_id', supplierId)
        .eq('business_id', profile.business_id)
        .order('created_at', { ascending: false })

    if (error) return { error: error.message }
    return { success: true, data: data as unknown as SupplierItem[] }
}

export async function addSupplierItem(payload: SupplierItemInput) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner') {
        return { error: 'Hanya Owner yang dapat menghubungkan bahan baku ke supplier.' }
    }

    const subCheck = await checkServerModuleAccess(profile.business_id, 'raw_materials', supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    if (!payload.supplier_id || !payload.raw_material_id) {
        return { error: 'Pilih supplier dan bahan baku terlebih dahulu.' }
    }

    // Validasi tenant server-side: pastikan supplier dan bahan baku milik bisnis yang sama
    const { data: sup } = await supabase
        .from('suppliers')
        .select('id')
        .eq('id', payload.supplier_id)
        .eq('business_id', profile.business_id)
        .single()

    if (!sup) {
        return { error: 'Supplier tidak valid atau bukan milik bisnis Anda.' }
    }

    const { data: rm } = await supabase
        .from('raw_materials')
        .select('id')
        .eq('id', payload.raw_material_id)
        .eq('business_id', profile.business_id)
        .single()

    if (!rm) {
        return { error: 'Bahan baku tidak valid atau bukan milik bisnis Anda.' }
    }

    const lastPrice = Math.max(0, Number(payload.last_price || 0))
    const minOrderQty = Math.max(0.01, Number(payload.min_order_qty || 1))
    const leadTimeDays = Math.max(0, Number(payload.lead_time_days || 1))

    const { data, error } = await supabase
        .from('supplier_items')
        .insert({
            business_id: profile.business_id,
            supplier_id: payload.supplier_id,
            raw_material_id: payload.raw_material_id,
            supplier_product_code: payload.supplier_product_code?.trim() || null,
            last_price: lastPrice,
            min_order_qty: minOrderQty,
            lead_time_days: leadTimeDays,
            is_preferred: Boolean(payload.is_preferred),
            notes: payload.notes?.trim() || null,
        })
        .select(`
            id,
            business_id,
            supplier_id,
            raw_material_id,
            supplier_product_code,
            last_price,
            min_order_qty,
            lead_time_days,
            is_preferred,
            notes,
            created_at,
            updated_at,
            raw_materials (name, unit, sku)
        `)
        .single()

    if (error) {
        if (error.code === '23505') {
            return { error: 'Bahan baku ini sudah terdaftar pada katalog supplier ini.' }
        }
        return { error: error.message }
    }

    revalidatePath('/dashboard/bahan-baku')
    return { success: true, data: data as unknown as SupplierItem }
}

export async function deleteSupplierItem(id: string) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner') {
        return { error: 'Hanya Owner yang dapat menghapus item katalog supplier.' }
    }

    const subCheck = await checkServerModuleAccess(profile.business_id, 'raw_materials', supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const { error } = await supabase
        .from('supplier_items')
        .delete()
        .eq('id', id)
        .eq('business_id', profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/bahan-baku')
    return { success: true }
}
