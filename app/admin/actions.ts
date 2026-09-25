'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/auth-admin'
import { revalidatePath } from 'next/cache'

// Helper verifikasi sesi super admin
async function requireSuperAdmin() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user || !isSuperAdmin(user.email)) {
        throw new Error('Akses ditolak: Anda bukan Super Admin.')
    }
    return user
}

// ─── 1. Perpanjang Masa Trial ────────────────────────────────────────────────
export async function adminExtendTrial(businessId: string, daysToAdd: number) {
    await requireSuperAdmin()

    if (!businessId || daysToAdd <= 0) {
        return { error: 'Parameter tidak valid.' }
    }

    const admin = createAdminClient()

    // Ambil tanggal trial saat ini
    const { data: business, error: bErr } = await admin
        .from('businesses')
        .select('id, trial_ends_at')
        .eq('id', businessId)
        .single()

    if (bErr || !business) {
        return { error: 'Bisnis tidak ditemukan.' }
    }

    const now = new Date()
    const currentEnd = business.trial_ends_at ? new Date(business.trial_ends_at) : now
    // Jika sudah lewat, perpanjang dari hari ini; jika masih aktif, tambahkan dari sisa tanggal berakhir
    const baseDate = currentEnd > now ? currentEnd : now
    const newEnd = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000)

    const { error: updateErr } = await admin
        .from('businesses')
        .update({
            trial_ends_at: newEnd.toISOString(),
            subscription_status: 'trial',
            updated_at: new Date().toISOString(),
        })
        .eq('id', businessId)

    if (updateErr) {
        return { error: 'Gagal memperbarui masa trial: ' + updateErr.message }
    }

    revalidatePath('/admin')
    revalidatePath('/dashboard')
    return { success: true, newTrialEndsAt: newEnd.toISOString() }
}

// ─── 2. Ubah Status Langganan ─────────────────────────────────────────────────
export async function adminUpdateSubscriptionStatus(
    businessId: string,
    status: 'trial' | 'active' | 'expired'
) {
    await requireSuperAdmin()

    if (!businessId || !['trial', 'active', 'expired'].includes(status)) {
        return { error: 'Status tidak valid.' }
    }

    const admin = createAdminClient()

    const updatePayload: Record<string, any> = {
        subscription_status: status,
        updated_at: new Date().toISOString(),
    }

    // Jika diubah ke trial tapi waktu trial sudah lewat, set trial 7 hari dari sekarang
    if (status === 'trial') {
        const { data: b } = await admin
            .from('businesses')
            .select('trial_ends_at')
            .eq('id', businessId)
            .single()

        if (!b?.trial_ends_at || new Date(b.trial_ends_at) <= new Date()) {
            updatePayload.trial_ends_at = new Date(
                Date.now() + 7 * 24 * 60 * 60 * 1000
            ).toISOString()
        }
    }

    const { error } = await admin
        .from('businesses')
        .update(updatePayload)
        .eq('id', businessId)

    if (error) {
        return { error: 'Gagal mengubah status: ' + error.message }
    }

    revalidatePath('/admin')
    revalidatePath('/dashboard')
    return { success: true }
}

// ─── 3. Ubah Nama Bisnis Tenant ──────────────────────────────────────────────
export async function adminUpdateBusinessName(businessId: string, newName: string) {
    await requireSuperAdmin()

    const trimmed = newName.trim()
    if (!businessId || !trimmed) {
        return { error: 'Nama bisnis tidak boleh kosong.' }
    }

    const admin = createAdminClient()
    const { error } = await admin
        .from('businesses')
        .update({ name: trimmed, updated_at: new Date().toISOString() })
        .eq('id', businessId)

    if (error) {
        return { error: 'Gagal mengubah nama bisnis: ' + error.message }
    }

    revalidatePath('/admin')
    revalidatePath('/dashboard')
    return { success: true }
}

// ─── 4. Reset Kata Sandi User ────────────────────────────────────────────────
export async function adminResetUserPassword(userId: string, newPassword: string) {
    await requireSuperAdmin()

    if (!userId || !newPassword || newPassword.length < 6) {
        return { error: 'Kata sandi minimal 6 karakter.' }
    }

    const admin = createAdminClient()
    const { error } = await admin.auth.admin.updateUserById(userId, {
        password: newPassword,
    })

    if (error) {
        return { error: 'Gagal mereset kata sandi: ' + error.message }
    }

    revalidatePath('/admin')
    return { success: true }
}
