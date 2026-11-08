'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canAddBranch } from '@/lib/subscription-limits'
import { checkActiveSubscription } from '@/lib/subscription-access'

export async function addBranch(formData: FormData) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized: Sesi pengguna tidak ditemukan.' }

    const { data: profile } = await supabase
        .from('profiles')
        .select(
            `role, business_id,
             businesses(
               subscription_status,
               subscription_plan_id,
               subscription_plans(max_branches, max_employees, can_advanced_reports, can_api_access, duration_days)
             )`
        )
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner') {
        return { error: 'Hanya owner yang bisa menambah cabang.' }
    }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    interface ProfileWithBranchLimits {
        role: string
        business_id: string
        businesses?: {
            subscription_status: string | null
            subscription_plans?: {
                max_branches: number | null
                max_employees: number | null
            } | null
        } | null
    }

    const businessData = (profile as unknown as ProfileWithBranchLimits | null)?.businesses
    const subscriptionStatus = businessData?.subscription_status || 'trial'
    const planLimits = businessData?.subscription_plans ?? null

    const { count } = await supabase
        .from('branches')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', profile.business_id)
        .eq('status', 'active')

    const branchCount = count ?? 0
    const { allowed, reason } = canAddBranch(branchCount, planLimits, subscriptionStatus)

    if (!allowed) {
        return { error: reason }
    }

    const name = String(formData.get('name') ?? '').trim()
    if (!name) return { error: 'Nama cabang wajib diisi.' }

    const code = String(formData.get('code') ?? '').trim() || null
    const branchTypeRaw = String(formData.get('branch_type') ?? '').trim()
    const branchType = ['outlet', 'central_kitchen', 'warehouse', 'hub'].includes(branchTypeRaw)
        ? branchTypeRaw
        : 'outlet'

    const city = String(formData.get('city') ?? '').trim() || null
    const managerName = String(formData.get('manager_name') ?? '').trim() || null
    const ownershipRaw = String(formData.get('ownership_status') ?? '').trim()
    const ownershipStatus = ['owned', 'rented'].includes(ownershipRaw) ? ownershipRaw : 'owned'
    const leaseStart = String(formData.get('lease_start_date') ?? '').trim() || null
    const leaseEnd = String(formData.get('lease_end_date') ?? '').trim() || null
    const operatingHours = String(formData.get('operating_hours') ?? '').trim() || null
    const statusRaw = String(formData.get('status') ?? '').trim()
    const status = ['active', 'inactive', 'closed'].includes(statusRaw) ? statusRaw : 'active'

    const parentBranchId = String(formData.get('parent_branch_id') ?? '').trim() || null
    if (parentBranchId) {
        // Validasi parent_branch_id milik bisnis yang sama
        const { data: parentBranch } = await supabase
            .from('branches')
            .select('id')
            .eq('id', parentBranchId)
            .eq('business_id', profile.business_id)
            .single()

        if (!parentBranch) {
            return { error: 'Cabang induk tidak valid atau bukan milik bisnis Anda.' }
        }
    }

    const rawAddress = String(formData.get('address') ?? '').trim()
    const address = rawAddress.length > 0 ? rawAddress : null

    const rawPhone = String(formData.get('phone') ?? '').trim()
    const phone = rawPhone.length > 0 ? rawPhone : null

    const { error } = await supabase.from('branches').insert({
        business_id: profile.business_id,
        name,
        code,
        branch_type: branchType,
        city,
        manager_name: managerName,
        ownership_status: ownershipStatus,
        lease_start_date: leaseStart,
        lease_end_date: leaseEnd,
        operating_hours: operatingHours ? JSON.stringify({ note: operatingHours }) : null,
        status,
        parent_branch_id: parentBranchId,
        address,
        phone,
    })

    if (error) return { error: error.message }

    revalidatePath('/dashboard/cabang')
    revalidatePath('/dashboard/penjualan')
    revalidatePath('/dashboard/data')
    return { success: true }
}

export async function updateBranch(formData: FormData) {
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
        return { error: 'Hanya owner yang bisa mengubah data cabang.' }
    }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const branchId = String(formData.get('branch_id') ?? '').trim()
    if (!branchId) return { error: 'ID cabang wajib diisi.' }

    const name = String(formData.get('name') ?? '').trim()
    if (!name) return { error: 'Nama cabang wajib diisi.' }

    const code = String(formData.get('code') ?? '').trim() || null
    const branchTypeRaw = String(formData.get('branch_type') ?? '').trim()
    const branchType = ['outlet', 'central_kitchen', 'warehouse', 'hub'].includes(branchTypeRaw)
        ? branchTypeRaw
        : 'outlet'

    const city = String(formData.get('city') ?? '').trim() || null
    const managerName = String(formData.get('manager_name') ?? '').trim() || null
    const ownershipRaw = String(formData.get('ownership_status') ?? '').trim()
    const ownershipStatus = ['owned', 'rented'].includes(ownershipRaw) ? ownershipRaw : 'owned'
    const leaseStart = String(formData.get('lease_start_date') ?? '').trim() || null
    const leaseEnd = String(formData.get('lease_end_date') ?? '').trim() || null
    const operatingHours = String(formData.get('operating_hours') ?? '').trim() || null
    const statusRaw = String(formData.get('status') ?? '').trim()
    const status = ['active', 'inactive', 'closed'].includes(statusRaw) ? statusRaw : 'active'

    const parentBranchId = String(formData.get('parent_branch_id') ?? '').trim() || null

    if (parentBranchId) {
        if (parentBranchId === branchId) {
            return { error: 'Cabang tidak dapat menjadi induk bagi dirinya sendiri.' }
        }

        // Validasi parent milik bisnis yang sama
        const { data: parentBranch } = await supabase
            .from('branches')
            .select('id, parent_branch_id')
            .eq('id', parentBranchId)
            .eq('business_id', profile.business_id)
            .single()

        if (!parentBranch) {
            return { error: 'Cabang induk tidak valid atau bukan milik bisnis Anda.' }
        }

        // Pencegahan siklus hierarki (loop check)
        let currId: string | null = parentBranch.parent_branch_id
        let depth = 0
        while (currId) {
            depth += 1
            if (depth > 20 || currId === branchId) {
                return { error: 'Hierarki cabang membentuk siklus yang tidak valid.' }
            }
            const { data: anc } = await supabase
                .from('branches')
                .select('parent_branch_id')
                .eq('id', currId)
                .single()
            currId = anc?.parent_branch_id ?? null
        }
    }

    const rawAddress = String(formData.get('address') ?? '').trim()
    const address = rawAddress.length > 0 ? rawAddress : null

    const rawPhone = String(formData.get('phone') ?? '').trim()
    const phone = rawPhone.length > 0 ? rawPhone : null

    const { error } = await supabase
        .from('branches')
        .update({
            name,
            code,
            branch_type: branchType,
            city,
            manager_name: managerName,
            ownership_status: ownershipStatus,
            lease_start_date: leaseStart,
            lease_end_date: leaseEnd,
            operating_hours: operatingHours ? JSON.stringify({ note: operatingHours }) : null,
            status,
            parent_branch_id: parentBranchId,
            address,
            phone,
        })
        .eq('id', branchId)
        .eq('business_id', profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/cabang')
    revalidatePath('/dashboard/penjualan')
    revalidatePath('/dashboard/data')
    return { success: true }
}

export async function deleteBranch(branchId: string) {
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
        return { error: 'Hanya owner yang bisa menghapus cabang.' }
    }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    // 1. Cek jumlah cabang bisnis: tidak boleh hapus jika hanya 1 cabang tersisa (Cabang Utama)
    const { count } = await supabase
        .from('branches')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', profile.business_id)

    if ((count ?? 0) <= 1) {
        return { error: 'Cabang Utama tidak dapat dihapus karena setiap bisnis wajib memiliki minimal satu cabang aktif.' }
    }

    // 2. Cek apakah ini cabang utama / tertua
    const { data: oldestBranch } = await supabase
        .from('branches')
        .select('id, name')
        .eq('business_id', profile.business_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

    if (oldestBranch && oldestBranch.id === branchId) {
        return { error: 'Cabang Utama (Induk) tidak dapat dihapus. Anda hanya dapat mengubah informasi nama atau alamat cabang ini.' }
    }

    const { error } = await supabase
        .from('branches')
        .delete()
        .eq('id', branchId)
        .eq('business_id', profile.business_id)

    if (error) {
        if (error.code === '23503' || error.message?.toLowerCase().includes('foreign key constraint')) {
            return {
                error: 'Cabang tidak dapat dihapus karena memiliki riwayat transaksi penjualan atau inventaris historis. Ubah status menjadi non-aktif untuk menutup cabang ini.',
            }
        }
        return { error: error.message }
    }

    revalidatePath('/dashboard/cabang')
    revalidatePath('/dashboard/data')
    return { success: true }
}

export async function toggleBranchStatus(branchId: string, targetStatus: 'active' | 'inactive') {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized: Sesi pengguna tidak ditemukan.' }

    const { data: profile } = await supabase
        .from('profiles')
        .select(
            `role, business_id,
             businesses(
               subscription_status,
               subscription_plan_id,
               subscription_plans(max_branches, max_employees)
             )`
        )
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner') {
        return { error: 'Hanya owner yang bisa mengubah status cabang.' }
    }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const { data: branch } = await supabase
        .from('branches')
        .select('id, name, code, status, created_at')
        .eq('id', branchId)
        .eq('business_id', profile.business_id)
        .single()

    if (!branch) {
        return { error: 'Cabang tidak ditemukan.' }
    }

    if (targetStatus === 'inactive') {
        // Cek apakah ini cabang utama / tertua
        const { data: oldestBranch } = await supabase
            .from('branches')
            .select('id, name')
            .eq('business_id', profile.business_id)
            .order('created_at', { ascending: true })
            .limit(1)
            .single()

        if ((oldestBranch && oldestBranch.id === branchId) || branch.code === 'PUSAT') {
            return { error: 'Cabang Utama (Pusat) tidak dapat dinonaktifkan karena bisnis wajib memiliki minimal satu cabang aktif.' }
        }

        const { error: updateErr } = await supabase
            .from('branches')
            .update({ status: 'inactive' })
            .eq('id', branchId)
            .eq('business_id', profile.business_id)

        if (updateErr) {
            return { error: updateErr.message }
        }

        // Nonaktifkan kasir yang bertugas di cabang ini
        await supabase
            .from('profiles')
            .update({ is_active: false })
            .eq('business_id', profile.business_id)
            .eq('branch_id', branchId)
            .eq('role', 'pegawai')
    } else {
        // Target: active. Validasi kuota cabang aktif
        interface BusinessSubData {
            subscription_status?: string | null
            subscription_plans?: { max_branches?: number | null } | null
        }
        const bData = profile.businesses as unknown as BusinessSubData | null
        const isSubActive = bData?.subscription_status === 'active'
        const maxBranches = isSubActive && bData?.subscription_plans?.max_branches ? bData.subscription_plans.max_branches : 1

        const { count: activeCount } = await supabase
            .from('branches')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', profile.business_id)
            .eq('status', 'active')

        if ((activeCount ?? 0) >= maxBranches) {
            return {
                error: `Batas kuota cabang aktif paket Anda (${maxBranches} cabang) sudah penuh. Upgrade paket langganan atau nonaktifkan cabang lain terlebih dahulu.`,
            }
        }

        const { error: updateErr } = await supabase
            .from('branches')
            .update({ status: 'active' })
            .eq('id', branchId)
            .eq('business_id', profile.business_id)

        if (updateErr) {
            return { error: updateErr.message }
        }
    }

    revalidatePath('/dashboard/cabang')
    revalidatePath('/dashboard/penjualan')
    revalidatePath('/dashboard/data')
    return { success: true }
}