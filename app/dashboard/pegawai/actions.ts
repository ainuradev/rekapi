'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAddEmployee } from '@/lib/subscription-limits'
import { checkActiveSubscription } from '@/lib/subscription-access'

interface ProfileWithEmployeeLimits {
    business_id: string
    role: string
    businesses?: {
        subscription_status: string | null
        subscription_plans?: {
            max_branches: number | null
            max_employees: number | null
        } | null
    } | null
}

export async function addEmployee(formData: FormData) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Verifikasi manual: cuma owner yang boleh manggil fungsi ini.
    // Ini WAJIB dicek di sini karena admin client di bawah bypass semua RLS.
    const { data: profile } = await supabase
        .from('profiles')
        .select(
            `business_id, role,
             businesses(
               subscription_status,
               subscription_plan_id,
               subscription_plans(max_branches, max_employees, can_advanced_reports, can_api_access, duration_days)
             )`
        )
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner') {
        return { error: 'Hanya owner yang bisa menambah akun pegawai.' }
    }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    const fullName = String(formData.get('full_name') ?? '').trim()
    const branchId = String(formData.get('branch_id') ?? '')

    if (!email || !password || !fullName || !branchId) {
        return { error: 'Semua field wajib diisi.' }
    }
    if (password.length < 6) {
        return { error: 'Password minimal 6 karakter.' }
    }

    // Cek batas kuota pegawai berdasarkan paket langganan
    const businessData = (profile as unknown as ProfileWithEmployeeLimits | null)?.businesses
    const subscriptionStatus = businessData?.subscription_status || 'trial'
    const planLimits = businessData?.subscription_plans ?? null

    const { count: currentEmployeeCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', profile.business_id)
        .eq('role', 'pegawai')

    const { allowed, reason } = canAddEmployee(currentEmployeeCount ?? 0, planLimits, subscriptionStatus)
    if (!allowed) {
        return { error: reason }
    }

    // Pastikan branch itu memang milik business si owner (bukan business lain).
    const { data: branch } = await supabase
        .from('branches')
        .select('id, name')
        .eq('id', branchId)
        .eq('business_id', profile.business_id)
        .single()

    if (!branch) return { error: 'Cabang tidak valid.' }

    // Aturan: 1 cabang = 1 akun pegawai (tidak share pegawai)
    const { data: existingBranchEmployee } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('business_id', profile.business_id)
        .eq('branch_id', branchId)
        .eq('role', 'pegawai')
        .maybeSingle()

    if (existingBranchEmployee) {
        return {
            error: `Cabang "${branch.name}" sudah memiliki akun pegawai (${existingBranchEmployee.full_name || 'Kasir'}). Setiap cabang hanya dapat memiliki 1 akun pegawai.`,
        }
    }

    const admin = createAdminClient()

    const { error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // langsung aktif, tidak perlu verifikasi email
        app_metadata: {
            invited_business_id: profile.business_id,
            invited_role: 'pegawai',
            invited_branch_id: branchId,
        },
        user_metadata: {
            full_name: fullName,
        },
    })

    if (createError) {
        if (createError.message?.includes('uq_branch_single_employee')) {
            return { error: `Cabang "${branch.name}" sudah memiliki akun pegawai. Setiap cabang hanya dapat memiliki 1 akun pegawai.` }
        }
        if (createError.message?.includes('Batas kuota pegawai')) {
            return { error: createError.message }
        }
        return { error: createError.message }
    }

    revalidatePath('/dashboard/pegawai')
    return { success: true }
}

export async function updatePegawai(formData: FormData) {
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
        return { error: 'Hanya owner yang berhak mengedit data pegawai.' }
    }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const profileId = String(formData.get('profile_id') ?? '').trim()
    const fullName = String(formData.get('full_name') ?? '').trim()
    const branchId = String(formData.get('branch_id') ?? '').trim()
    const newPassword = String(formData.get('new_password') ?? '').trim()

    if (!profileId || !fullName || !branchId) {
        return { error: 'Nama pegawai dan cabang penugasan wajib diisi.' }
    }

    if (newPassword && newPassword.length < 6) {
        return { error: 'Password baru minimal 6 karakter.' }
    }

    // Pastikan pegawai yang diedit terdaftar di bisnis owner ini dan ber-role pegawai
    const { data: targetEmployee, error: targetError } = await supabase
        .from('profiles')
        .select('id, business_id, branch_id, role')
        .eq('id', profileId)
        .eq('business_id', profile.business_id)
        .single()

    if (targetError || !targetEmployee) {
        return { error: 'Pegawai tidak ditemukan atau Anda tidak memiliki akses ke akun ini.' }
    }

    if (targetEmployee.role !== 'pegawai') {
        return { error: 'Hanya akun dengan peran pegawai yang dapat diedit melalui menu ini.' }
    }

    // Pastikan cabang target milik bisnis owner
    const { data: targetBranch } = await supabase
        .from('branches')
        .select('id, name')
        .eq('id', branchId)
        .eq('business_id', profile.business_id)
        .single()

    if (!targetBranch) {
        return { error: 'Cabang yang dipilih tidak valid.' }
    }

    // Jika memindahkan cabang penugasan (branch_id berubah):
    // Cek apakah cabang target sudah memiliki akun pegawai lain!
    if (branchId !== targetEmployee.branch_id) {
        const { data: existingBranchEmployee } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('business_id', profile.business_id)
            .eq('branch_id', branchId)
            .eq('role', 'pegawai')
            .neq('id', profileId)
            .maybeSingle()

        if (existingBranchEmployee) {
            return {
                error: `Cabang "${targetBranch.name}" sudah memiliki akun pegawai (${existingBranchEmployee.full_name || 'Kasir'}). Setiap cabang hanya dapat memiliki 1 akun pegawai.`,
            }
        }
    }

    // Update profiles
    const { error: updateProfileError } = await supabase
        .from('profiles')
        .update({
            full_name: fullName,
            branch_id: branchId,
        })
        .eq('id', profileId)
        .eq('business_id', profile.business_id)

    if (updateProfileError) {
        return { error: updateProfileError.message || 'Gagal memperbarui data profil pegawai.' }
    }

    // Update auth metadata dan password (jika diisi) via Supabase Admin Client
    const admin = createAdminClient()
    const adminUpdateAttrs: {
        password?: string
        user_metadata: Record<string, unknown>
        app_metadata: Record<string, unknown>
    } = {
        user_metadata: { full_name: fullName },
        app_metadata: {
            invited_business_id: profile.business_id,
            invited_role: 'pegawai',
            invited_branch_id: branchId,
        },
    }

    if (newPassword) {
        adminUpdateAttrs.password = newPassword
    }

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(profileId, adminUpdateAttrs)
    if (authUpdateError) {
        return { error: `Gagal memperbarui auth login: ${authUpdateError.message}` }
    }

    revalidatePath('/dashboard/pegawai')
    return { success: true }
}

export async function removeEmployee(profileId: string) {
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
        return { error: 'Hanya owner yang bisa menghapus akun pegawai.' }
    }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    if (!profileId || profileId === user.id) {
        return { error: 'ID pegawai tidak valid atau tidak dapat menghapus akun sendiri.' }
    }

    // Verifikasi ketat lintas-tenant:
    // Pastikan pegawai yang akan dihapus memang terdaftar di bisnis milik owner ini dan memiliki role pegawai
    const { data: targetEmployee, error: targetError } = await supabase
        .from('profiles')
        .select('id, business_id, role')
        .eq('id', profileId)
        .eq('business_id', profile.business_id)
        .single()

    if (targetError || !targetEmployee) {
        return { error: 'Pegawai tidak ditemukan atau Anda tidak memiliki akses ke akun ini.' }
    }

    if (targetEmployee.role !== 'pegawai') {
        return { error: 'Hanya akun dengan peran pegawai yang dapat dihapus melalui menu ini.' }
    }

    const admin = createAdminClient()

    // Hapus dari auth.users — profiles akan ikut terhapus lewat on delete cascade.
    const { error } = await admin.auth.admin.deleteUser(profileId)
    if (error) return { error: error.message }

    revalidatePath('/dashboard/pegawai')
    return { success: true }
}
