'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { CustomerCategory } from '@/types/customer'
import { checkActiveSubscription } from '@/lib/subscription-access'

export interface CreateCustomerInput {
    code?: string
    name: string
    phone?: string
    email?: string
    address?: string
    category?: CustomerCategory
    default_discount_pct?: number
    receivable_limit?: number
    notes?: string
}

export interface UpdateCustomerInput {
    code?: string
    name: string
    phone?: string
    email?: string
    address?: string
    category?: CustomerCategory
    default_discount_pct?: number
    receivable_limit?: number
    notes?: string
    status?: 'active' | 'inactive'
}

export async function createCustomer(payload: CreateCustomerInput) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized: Sesi pengguna tidak ditemukan.' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile || !profile.business_id) {
        return { error: 'Profil bisnis tidak ditemukan.' }
    }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const name = payload.name?.trim()
    if (!name) return { error: 'Nama pelanggan wajib diisi.' }

    const isOwner = profile.role === 'owner'

    const discountPct = Number(payload.default_discount_pct || 0)
    if (isNaN(discountPct) || discountPct < 0 || discountPct > 100) {
        return { error: 'Diskon default harus berupa angka antara 0% dan 100%.' }
    }

    // Hanya owner yang dapat mengatur limit piutang saat pendaftaran
    const rawReceivableLimit = Number(payload.receivable_limit || 0)
    if (isNaN(rawReceivableLimit) || rawReceivableLimit < 0) {
        return { error: 'Batas piutang tidak boleh bernilai negatif.' }
    }
    const receivableLimit = isOwner ? rawReceivableLimit : 0

    const category = payload.category && ['regular', 'member', 'vip', 'wholesale'].includes(payload.category)
        ? payload.category
        : 'regular'

    const { data, error } = await supabase
        .from('customers')
        .insert({
            business_id: profile.business_id,
            code: payload.code?.trim() || null,
            name,
            phone: payload.phone?.trim() || null,
            email: payload.email?.trim() || null,
            address: payload.address?.trim() || null,
            category,
            default_discount_pct: discountPct,
            receivable_limit: receivableLimit,
            notes: payload.notes?.trim() || null,
            status: 'active',
        })
        .select()
        .single()

    if (error) {
        if (error.code === '23505') {
            return { error: 'Kode pelanggan sudah digunakan pada bisnis Anda.' }
        }
        return { error: error.message }
    }

    revalidatePath('/dashboard/pelanggan')
    revalidatePath('/dashboard/data')
    return { success: true, data }
}

export async function updateCustomer(id: string, payload: UpdateCustomerInput) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized: Sesi pengguna tidak ditemukan.' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile || !profile.business_id) {
        return { error: 'Profil bisnis tidak ditemukan.' }
    }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const name = payload.name?.trim()
    if (!name) return { error: 'Nama pelanggan wajib diisi.' }

    const isOwner = profile.role === 'owner'

    const discountPct = Number(payload.default_discount_pct || 0)
    if (isNaN(discountPct) || discountPct < 0 || discountPct > 100) {
        return { error: 'Diskon default harus berupa angka antara 0% dan 100%.' }
    }

    // Hanya owner yang dapat mengubah limit piutang, jika pegawai jangan izinkan perubahan limit
    const rawReceivableLimit = Number(payload.receivable_limit || 0)
    if (isNaN(rawReceivableLimit) || rawReceivableLimit < 0) {
        return { error: 'Batas piutang tidak boleh bernilai negatif.' }
    }
    let receivableLimit = rawReceivableLimit
    if (!isOwner) {
        const { data: existingCust } = await supabase
            .from('customers')
            .select('receivable_limit')
            .eq('id', id)
            .eq('business_id', profile.business_id)
            .single()
        receivableLimit = existingCust?.receivable_limit ?? 0
    }

    const category = payload.category && ['regular', 'member', 'vip', 'wholesale'].includes(payload.category)
        ? payload.category
        : 'regular'

    const status = payload.status && ['active', 'inactive'].includes(payload.status)
        ? payload.status
        : 'active'

    const { data, error } = await supabase
        .from('customers')
        .update({
            code: payload.code?.trim() || null,
            name,
            phone: payload.phone?.trim() || null,
            email: payload.email?.trim() || null,
            address: payload.address?.trim() || null,
            category,
            default_discount_pct: discountPct,
            receivable_limit: receivableLimit,
            notes: payload.notes?.trim() || null,
            status,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('business_id', profile.business_id)
        .select()
        .single()

    if (error) {
        if (error.code === '23505') {
            return { error: 'Kode pelanggan sudah digunakan pada bisnis Anda.' }
        }
        return { error: error.message }
    }

    revalidatePath('/dashboard/pelanggan')
    revalidatePath('/dashboard/data')
    return { success: true, data }
}

export async function toggleCustomerStatus(id: string, newStatus: 'active' | 'inactive') {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized: Sesi pengguna tidak ditemukan.' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id')
        .eq('id', user.id)
        .single()

    if (!profile || !profile.business_id) {
        return { error: 'Profil bisnis tidak ditemukan.' }
    }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const { error } = await supabase
        .from('customers')
        .update({
            status: newStatus,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('business_id', profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/pelanggan')
    revalidatePath('/dashboard/data')
    return { success: true }
}

export async function deleteCustomer(id: string) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized: Sesi pengguna tidak ditemukan.' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner') {
        return { error: 'Hanya pemilik usaha (owner) yang dapat menghapus data pelanggan.' }
    }

    const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id)
        .eq('business_id', profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/pelanggan')
    revalidatePath('/dashboard/data')
    return { success: true }
}
