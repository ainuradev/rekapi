'use server'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Cek apakah email sudah terdaftar di Supabase Auth atau Profiles.
 * Dipanggil dari register page sebelum signUp.
 */
export async function checkEmailExists(email: string): Promise<boolean> {
    const admin = createAdminClient()
    const cleanEmail = email.trim().toLowerCase()

    // 1. Cek di tabel profiles (cepat & terindeks)
    const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .ilike('full_name', cleanEmail)
        .limit(1)

    // 2. Cek user auth langsung by email jika didukung, atau paged list
    // Supabase auth admin listUsers mendukung perPage atau filter
    const { data: authData, error } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 50,
    })

    if (error || !authData) {
        return !!profile && profile.length > 0
    }

    const existsInAuth = authData.users.some(
        (u) => u.email?.toLowerCase() === cleanEmail
    )

    return existsInAuth || (!!profile && profile.length > 0)
}
