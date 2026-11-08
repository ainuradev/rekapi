'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface DashboardNotificationItem {
    id: string
    business_id: string | null
    title: string
    message: string
    category: 'announcement' | 'subscription' | 'maintenance' | 'promo' | 'feature' | 'system'
    source: 'admin' | 'system'
    action_url: string | null
    created_at: string
    is_read: boolean
}

/**
 * Tandai satu notifikasi sebagai sudah dibaca
 */
export async function markNotificationAsRead(notificationId: string) {
    if (!notificationId) return { error: 'ID notifikasi tidak valid.' }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    // Jika notifikasi sistem internal buatan runtime (misal diawali 'sys_')
    if (notificationId.startsWith('sys_')) {
        return { success: true }
    }

    const { error } = await supabase.from('notification_reads').upsert(
        {
            notification_id: notificationId,
            user_id: user.id,
            read_at: new Date().toISOString(),
        },
        {
            onConflict: 'notification_id, user_id',
            ignoreDuplicates: true,
        }
    )

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/dashboard')
    return { success: true }
}

/**
 * Tandai seluruh notifikasi yang belum dibaca sebagai sudah dibaca
 */
export async function markAllNotificationsAsRead(notificationIds: string[]) {
    if (!notificationIds || notificationIds.length === 0) return { success: true }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    // Filter hanya ID yang merupakan UUID (dari system_notifications)
    const validIds = notificationIds.filter((id) => !id.startsWith('sys_'))

    if (validIds.length > 0) {
        const rows = validIds.map((id) => ({
            notification_id: id,
            user_id: user.id,
            read_at: new Date().toISOString(),
        }))

        const { error } = await supabase.from('notification_reads').upsert(rows, {
            onConflict: 'notification_id, user_id',
            ignoreDuplicates: true,
        })

        if (error) {
            return { error: error.message }
        }
    }

    revalidatePath('/dashboard')
    return { success: true }
}

/**
 * Ambil daftar notifikasi terbaru untuk pengguna yang sedang login
 */
export async function getLatestUserNotifications(): Promise<{
    notifications: DashboardNotificationItem[]
    error?: string
}> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { notifications: [], error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id')
        .eq('id', user.id)
        .single()

    if (!profile?.business_id) return { notifications: [] }

    const { data: rawNotifs, error: notifErr } = await supabase
        .from('system_notifications')
        .select('id, business_id, title, message, category, action_url, created_at')
        .or(`business_id.is.null,business_id.eq.${profile.business_id}`)
        .order('created_at', { ascending: false })
        .limit(30)

    if (notifErr) {
        return { notifications: [], error: notifErr.message }
    }

    const notifIds = (rawNotifs ?? []).map((n) => n.id)
    let readNotifIds = new Set<string>()
    if (notifIds.length > 0) {
        const { data: reads } = await supabase
            .from('notification_reads')
            .select('notification_id')
            .eq('user_id', user.id)
            .in('notification_id', notifIds)

        if (reads) {
            readNotifIds = new Set(reads.map((r) => r.notification_id))
        }
    }

    const adminNotifs: DashboardNotificationItem[] = (rawNotifs ?? []).map((n) => ({
        id: n.id,
        business_id: n.business_id,
        title: n.title,
        message: n.message,
        category: n.category as DashboardNotificationItem['category'],
        source: 'admin' as const,
        action_url: n.action_url,
        created_at: n.created_at,
        is_read: readNotifIds.has(n.id),
    }))

    return { notifications: adminNotifs }
}
