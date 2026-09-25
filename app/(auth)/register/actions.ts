'use server'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Cek apakah email sudah terdaftar di Supabase Auth.
 * Dipanggil dari register page sebelum signUp.
 */
export async function checkEmailExists(email: string): Promise<boolean> {
    const admin = createAdminClient()

    // listUsers bisa filter by email langsung
    const { data, error } = await admin.auth.admin.listUsers()
    if (error || !data) return false

    return data.users.some(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
    )
}
