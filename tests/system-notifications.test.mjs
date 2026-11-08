import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('Pusat Notifikasi Terpadu (System & Super Admin Broadcast Notifications)', async (t) => {
    const rootDir = process.cwd()

    await t.test('1. Migration 0043 defines schema, indexes, and RLS policies', () => {
        const migrationPath = path.join(rootDir, 'supabase/migrations/0043_system_and_admin_notifications.sql')
        assert.ok(fs.existsSync(migrationPath), 'Migration 0043 file must exist')

        const sql = fs.readFileSync(migrationPath, 'utf8')

        // system_notifications
        assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.system_notifications'), 'Must create system_notifications table')
        assert.ok(sql.includes('business_id uuid NULL REFERENCES public.businesses(id)'), 'business_id must allow NULL for global broadcasts')
        assert.ok(sql.includes('title text NOT NULL'), 'title must be text NOT NULL')
        assert.ok(sql.includes('message text NOT NULL'), 'message must be text NOT NULL')
        assert.ok(sql.includes('action_url text NULL'), 'action_url must be optional')
        assert.ok(sql.includes('category text NOT NULL DEFAULT \'announcement\''), 'category must have default')

        // notification_reads
        assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.notification_reads'), 'Must create notification_reads table')
        assert.ok(sql.includes('notification_id uuid NOT NULL REFERENCES public.system_notifications(id)'), 'notification_id must reference system_notifications')
        assert.ok(sql.includes('user_id uuid NOT NULL REFERENCES auth.users(id)'), 'user_id must reference auth.users')
        assert.ok(sql.includes('UNIQUE(notification_id, user_id)'), 'Must have UNIQUE(notification_id, user_id)')

        // RLS
        assert.ok(sql.includes('ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY'), 'Must enable RLS on system_notifications')
        assert.ok(sql.includes('ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY'), 'Must enable RLS on notification_reads')
        assert.ok(sql.includes('system_notifications_select'), 'Must create select policy for system_notifications')
        assert.ok(sql.includes('business_id IS NULL'), 'Select policy must allow global notifications (business_id IS NULL)')
    })

    await t.test('2. Broadcast Global & Tenant Isolation Logic', () => {
        const mockNotifs = [
            { id: 'notif-global-1', business_id: null, title: 'Maintenance Server', message: 'Malam ini pukul 23:00' },
            { id: 'notif-biz-a', business_id: 'biz-a', title: 'Tagihan Berhasil', message: 'Paket Pro aktif' },
            { id: 'notif-biz-b', business_id: 'biz-b', title: 'Peringatan Cabang', message: 'Cabang nonaktif' },
        ]

        // Function simulation matching SQL query: (business_id IS NULL OR business_id = user_business_id)
        function filterForBusiness(notifs, targetBizId) {
            return notifs.filter((n) => n.business_id === null || n.business_id === targetBizId)
        }

        const forBizA = filterForBusiness(mockNotifs, 'biz-a')
        assert.equal(forBizA.length, 2, 'Tenant A should see global notif and biz-a notif')
        assert.ok(forBizA.some((n) => n.id === 'notif-global-1'), 'Tenant A sees global')
        assert.ok(forBizA.some((n) => n.id === 'notif-biz-a'), 'Tenant A sees its own notif')
        assert.ok(!forBizA.some((n) => n.id === 'notif-biz-b'), 'Tenant A MUST NOT see biz-b notif')

        const forBizB = filterForBusiness(mockNotifs, 'biz-b')
        assert.equal(forBizB.length, 2, 'Tenant B should see global notif and biz-b notif')
        assert.ok(!forBizB.some((n) => n.id === 'notif-biz-a'), 'Tenant B MUST NOT see biz-a notif')
    })

    await t.test('3. Read Status & Unread Count Calculation', () => {
        const notifs = [
            { id: '1', title: 'A' },
            { id: '2', title: 'B' },
            { id: '3', title: 'C' },
        ]

        const readsUser1 = new Set(['1', '3'])
        const mappedUser1 = notifs.map((n) => ({
            ...n,
            is_read: readsUser1.has(n.id),
        }))

        assert.equal(mappedUser1.find((n) => n.id === '1')?.is_read, true)
        assert.equal(mappedUser1.find((n) => n.id === '2')?.is_read, false)
        assert.equal(mappedUser1.find((n) => n.id === '3')?.is_read, true)

        const unreadCount = mappedUser1.filter((n) => !n.is_read).length
        assert.equal(unreadCount, 1, 'Only unread notification should count towards badge')
    })

    await t.test('4. Automatic Notification on Subscription Override', () => {
        const adminActionsPath = path.join(rootDir, 'app/admin/actions.ts')
        const actionsSrc = fs.readFileSync(adminActionsPath, 'utf8')

        assert.ok(actionsSrc.includes('adminCreateSystemNotification'), 'Must export adminCreateSystemNotification')
        assert.ok(actionsSrc.includes('adminDeleteSystemNotification'), 'Must export adminDeleteSystemNotification')
        assert.ok(actionsSrc.includes('from(\'system_notifications\').insert'), 'adminOverrideSubscription must insert into system_notifications')
        assert.ok(actionsSrc.includes('Pembaruan Paket Langganan'), 'Auto notification must specify title')
    })

    await t.test('5. Notification Actions & Dashboard Top Nav Contracts', () => {
        const notifActionsPath = path.join(rootDir, 'app/dashboard/notification-actions.ts')
        const notifSrc = fs.readFileSync(notifActionsPath, 'utf8')
        assert.ok(notifSrc.includes('markNotificationAsRead'), 'Must export markNotificationAsRead')
        assert.ok(notifSrc.includes('markAllNotificationsAsRead'), 'Must export markAllNotificationsAsRead')
        assert.ok(notifSrc.includes('getLatestUserNotifications'), 'Must export getLatestUserNotifications for live bell refresh')

        const rlsFixPath = path.join(rootDir, 'supabase/migrations/0044_fix_system_notifications_rls.sql')
        assert.ok(fs.existsSync(rlsFixPath), 'Migration 0044 RLS fix must exist')
        const rlsFixSql = fs.readFileSync(rlsFixPath, 'utf8')
        assert.ok(rlsFixSql.includes("auth.jwt() ->> 'email'"), 'RLS policy must use auth.jwt() email check instead of querying auth.users')
        assert.ok(!rlsFixSql.includes('FROM auth.users'), 'RLS policy must not SELECT from auth.users directly')

        const navPath = path.join(rootDir, 'app/dashboard/dashboard-nav.tsx')
        const navSrc = fs.readFileSync(navPath, 'utf8')
        assert.ok(navSrc.includes('notifDropdownOpen'), 'DashboardNav must have notifDropdownOpen state')
        assert.ok(navSrc.includes('getLatestUserNotifications'), 'DashboardNav must dynamically fetch latest notifications')
        assert.ok(navSrc.includes('unreadCount > 0'), 'DashboardNav must render unread badge only when unreadCount > 0')
        assert.ok(navSrc.includes('ADMIN REKAPI'), 'DashboardNav must badge official admin notifications')
        assert.ok(navSrc.includes('SISTEM TOKO'), 'DashboardNav must badge system alerts')
    })
})

