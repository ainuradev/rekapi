'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/auth-admin'
import { revalidatePath } from 'next/cache'
import { ensureSubscriptionPlans } from '@/lib/subscription-plans'
import { executeAutoDeactivateOnDowngrade } from '@/lib/subscription-downgrade'

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

    const updatePayload: {
        subscription_status: string
        updated_at: string
        trial_ends_at?: string
    } = {
        subscription_status: status,
        updated_at: new Date().toISOString(),
    }

    // Ambil data bisnis & kuota saat ini untuk deteksi downgrade
    const { data: b } = await admin
        .from('businesses')
        .select('trial_ends_at, subscription_status, subscription_plan_id, subscription_plans(max_branches)')
        .eq('id', businessId)
        .single()

    const oldStatus = b?.subscription_status
    const oldMax = (b?.subscription_plans as { max_branches?: number } | null)?.max_branches ?? 1

    // Jika diubah ke trial tapi waktu trial sudah lewat, set trial 7 hari dari sekarang
    if (status === 'trial') {
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

    // Jika downgrade dari status aktif dengan multi-cabang ke non-aktif/trial/expired
    if (oldStatus === 'active' && status !== 'active' && oldMax > 1) {
        await executeAutoDeactivateOnDowngrade(businessId, admin)
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

// ─── 5. Override Langganan Manual (Paket & Tanggal Aktif) ──────────────────────
export interface OverrideSubscriptionParams {
    businessId: string
    planCode: 'trial' | 'standard' | 'business' | 'pro'
    status: 'active' | 'trial' | 'expired'
    expiresAtDate?: string // YYYY-MM-DD
    daysToAdd?: number
    notes?: string
}

export async function adminOverrideSubscription(params: OverrideSubscriptionParams) {
    const user = await requireSuperAdmin()

    const { businessId, planCode, status, expiresAtDate, daysToAdd, notes } = params
    if (!businessId) {
        return { error: 'ID bisnis wajib diisi.' }
    }

    const admin = createAdminClient()

    // Ambil data bisnis saat ini
    const { data: business, error: bErr } = await admin
        .from('businesses')
        .select('id, name, subscription_status, subscription_plan_id, subscription_expires_at, trial_ends_at')
        .eq('id', businessId)
        .single()

    if (bErr || !business) {
        return { error: 'Bisnis tidak ditemukan.' }
    }

    // Resolusi tanggal kadaluarsa
    let targetExpiry: Date
    if (expiresAtDate) {
        targetExpiry = new Date(expiresAtDate)
        targetExpiry.setUTCHours(23, 59, 59, 999)
    } else if (daysToAdd && daysToAdd > 0) {
        const now = new Date()
        const currentExp = business.subscription_expires_at
            ? new Date(business.subscription_expires_at)
            : business.trial_ends_at
                ? new Date(business.trial_ends_at)
                : now
        const baseDate = currentExp > now ? currentExp : now
        targetExpiry = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000)
    } else {
        targetExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }

    const targetIso = targetExpiry.toISOString()

    const plans = await ensureSubscriptionPlans(admin)
    let planId: string | null = null
    let newMaxBranches = 1

    if (planCode !== 'trial') {
        const planRow = plans.find((p) => p.code === planCode)

        if (!planRow) {
            return { error: `Paket ${planCode} tidak ditemukan di database.` }
        }
        planId = planRow.id
        if (status === 'active') {
            newMaxBranches = planRow.max_branches ?? 1
        }
    }

    // Deteksi kuota lama untuk proteksi downgrade cabang/pegawai
    let oldMaxBranches = 1
    if (business.subscription_status === 'active' && business.subscription_plan_id) {
        const oldPlan = plans.find((p) => p.id === business.subscription_plan_id)
        oldMaxBranches = oldPlan?.max_branches ?? 1
    }

    const isDowngrade = newMaxBranches < oldMaxBranches

    const updatePayload: {
        subscription_status: string
        subscription_plan_id: string | null
        subscription_expires_at: string | null
        trial_ends_at?: string
        updated_at: string
    } = {
        subscription_status: status,
        subscription_plan_id: planId,
        subscription_expires_at: status === 'active' ? targetIso : null,
        updated_at: new Date().toISOString(),
    }

    // CRITICAL: Jangan pernah mengirim trial_ends_at: null karena kolom ini NOT NULL di PostgreSQL.
    // Hanya perbarui trial_ends_at jika status diubah ke 'trial', atau sediakan fallback timestamp jika kosong.
    if (status === 'trial') {
        updatePayload.trial_ends_at = targetIso
    } else if (!business.trial_ends_at) {
        updatePayload.trial_ends_at = new Date().toISOString()
    }

    const { error: updateErr } = await admin
        .from('businesses')
        .update(updatePayload)
        .eq('id', businessId)

    if (updateErr) {
        return { error: 'Gagal memperbarui langganan: ' + updateErr.message }
    }

    // Auto-deactivate cabang & pegawai tambahan jika terjadi downgrade
    if (isDowngrade) {
        await executeAutoDeactivateOnDowngrade(businessId, admin)
    }

    // Catat histori override ke subscriptions tabel jika plan berbayar
    if (planId) {
        try {
            await admin.from('subscriptions').insert({
                business_id: businessId,
                plan_id: planId,
                status: status,
                started_at: new Date().toISOString(),
                expires_at: targetIso,
                midtrans_order_id: `MANUAL_${Date.now()}_${notes ? notes.replace(/\s+/g, '_').substring(0, 15) : 'ADMIN'}`,
            })
        } catch (subErr) {
            console.warn('Gagal mencatat audit log ke tabel subscriptions:', subErr)
        }
    }

    // Notifikasi Otomatis ke Bisnis saat Override Langganan oleh Super Admin
    try {
        const planDisplay =
            planCode === 'trial'
                ? 'Trial 7 Hari'
                : `Paket ${planCode.charAt(0).toUpperCase() + planCode.slice(1)}`
        const statusDisplay = status === 'active' ? 'Aktif' : status === 'trial' ? 'Trial' : 'Expired'
        const dateFormatted = targetExpiry.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        })

        await admin.from('system_notifications').insert({
            business_id: businessId,
            title: 'Pembaruan Paket Langganan',
            message: `Status langganan bisnis Anda telah diperbarui ke ${planDisplay} (${statusDisplay}) oleh Admin Rekapi. Masa aktif berlaku hingga ${dateFormatted}.`,
            category: 'subscription',
            action_url: '/dashboard/subscription',
            created_by: user.id,
        })
    } catch (notifErr) {
        console.warn('Gagal membuat notifikasi otomatis saat override subscription:', notifErr)
    }

    revalidatePath('/admin')
    revalidatePath('/dashboard')
    return { success: true, newExpiresAt: targetIso }
}

// ─── 6. Notifikasi Sistem & Broadcast Super Admin ─────────────────────────────
export interface AdminCreateNotificationParams {
    businessId?: string | null // null = broadcast global
    title: string
    message: string
    category: 'announcement' | 'subscription' | 'maintenance' | 'promo' | 'feature' | 'system'
    actionUrl?: string | null
}

export async function adminCreateSystemNotification(params: AdminCreateNotificationParams) {
    const user = await requireSuperAdmin()

    const { businessId, title, message, category, actionUrl } = params
    if (!title?.trim() || !message?.trim()) {
        return { error: 'Judul dan isi notifikasi wajib diisi.' }
    }

    const admin = createAdminClient()
    const { data, error } = await admin
        .from('system_notifications')
        .insert({
            business_id: businessId || null,
            title: title.trim(),
            message: message.trim(),
            category: category || 'announcement',
            action_url: actionUrl?.trim() || null,
            created_by: user.id,
        })
        .select()
        .single()

    if (error) {
        return { error: 'Gagal membuat notifikasi: ' + error.message }
    }

    revalidatePath('/admin')
    revalidatePath('/dashboard')
    return { success: true, notification: data }
}

export async function adminDeleteSystemNotification(notificationId: string) {
    await requireSuperAdmin()
    if (!notificationId) return { error: 'ID notifikasi tidak valid.' }

    const admin = createAdminClient()
    const { error } = await admin
        .from('system_notifications')
        .delete()
        .eq('id', notificationId)

    if (error) {
        return { error: 'Gagal menghapus notifikasi: ' + error.message }
    }

    revalidatePath('/admin')
    revalidatePath('/dashboard')
    return { success: true }
}
