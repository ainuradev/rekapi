'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Helper: ambil owner yang sedang login ───────────────────────────────────
async function getOwnerProfile() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('id, role, business_id, full_name')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner') return null
    return { user, profile, supabase }
}

// ─── Update nama lengkap owner ────────────────────────────────────────────────
export async function updateOwnerName(formData: FormData) {
    const ctx = await getOwnerProfile()
    if (!ctx) return { error: 'Unauthorized' }

    const fullName = String(formData.get('full_name') ?? '').trim()
    if (!fullName) return { error: 'Nama tidak boleh kosong.' }

    const { error } = await ctx.supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', ctx.user.id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/profil')
    revalidatePath('/dashboard')
    return { success: true }
}

// ─── Update nama bisnis ───────────────────────────────────────────────────────
export async function updateBusinessName(formData: FormData) {
    const ctx = await getOwnerProfile()
    if (!ctx) return { error: 'Unauthorized' }

    const name = String(formData.get('business_name') ?? '').trim()
    if (!name) return { error: 'Nama bisnis tidak boleh kosong.' }

    const { error } = await ctx.supabase
        .from('businesses')
        .update({ name })
        .eq('id', ctx.profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/profil')
    revalidatePath('/dashboard')
    return { success: true }
}

// ─── Ganti password sendiri (owner) ──────────────────────────────────────────
export async function changeOwnPassword(formData: FormData) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const newPassword = String(formData.get('new_password') ?? '')
    const confirmPassword = String(formData.get('confirm_password') ?? '')

    if (newPassword.length < 6) return { error: 'Password minimal 6 karakter.' }
    if (newPassword !== confirmPassword) return { error: 'Konfirmasi password tidak cocok.' }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return { error: error.message }

    return { success: true }
}

// ─── Ganti password pegawai (oleh owner) ─────────────────────────────────────
export async function changeEmployeePassword(formData: FormData) {
    const ctx = await getOwnerProfile()
    if (!ctx) return { error: 'Unauthorized' }

    const employeeId = String(formData.get('employee_id') ?? '')
    const newPassword = String(formData.get('new_password') ?? '')

    if (!employeeId) return { error: 'ID pegawai tidak valid.' }
    if (newPassword.length < 6) return { error: 'Password minimal 6 karakter.' }

    // Verifikasi: pastikan pegawai ini memang milik bisnis si owner
    const { data: empProfile } = await ctx.supabase
        .from('profiles')
        .select('id, role, business_id')
        .eq('id', employeeId)
        .eq('business_id', ctx.profile.business_id)
        .single()

    if (!empProfile) return { error: 'Pegawai tidak ditemukan.' }
    if (empProfile.role !== 'pegawai') return { error: 'Bukan akun pegawai.' }

    const admin = createAdminClient()
    const { error } = await admin.auth.admin.updateUserById(employeeId, {
        password: newPassword,
    })

    if (error) return { error: error.message }

    return { success: true }
}
