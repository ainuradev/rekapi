'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { ACTIVE_BRANCH_COOKIE_NAME } from '@/lib/active-branch'
import { createClient } from '@/lib/supabase/server'

export async function switchActiveBranch(branchId: string) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        throw new Error('Unauthorized: Sesi pengguna tidak ditemukan.')
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'owner') {
        throw new Error('Hanya pemilik bisnis (Owner) yang dapat berganti cabang.')
    }

    const targetBranch = (!branchId || branchId === 'all') ? 'all' : branchId

    // Pastikan cabang yang dipilih aktif jika bukan konsolidasi 'all'
    if (targetBranch !== 'all') {
        const { data: branchCheck } = await supabase
            .from('branches')
            .select('id, name, status')
            .eq('id', targetBranch)
            .eq('business_id', profile.business_id)
            .single()

        if (!branchCheck) {
            throw new Error('Cabang tidak valid atau tidak ditemukan.')
        }
        if (branchCheck.status !== 'active') {
            throw new Error(`Cabang "${branchCheck.name}" sedang nonaktif. Aktifkan cabang terlebih dahulu sebelum memilihnya.`)
        }
    }

    const cookieStore = await cookies()

    cookieStore.set(ACTIVE_BRANCH_COOKIE_NAME, targetBranch, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365, // 1 year
        sameSite: 'lax',
    })

    // Revalidate dashboard layout and all nested pages
    revalidatePath('/dashboard', 'layout')
    return { success: true, branchId: targetBranch }
}
