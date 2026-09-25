import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// PERINGATAN: file ini pakai SUPABASE_SERVICE_ROLE_KEY yang bypass semua RLS.
// Hanya boleh dipakai di server actions / route handlers, DAN hanya
// setelah memverifikasi sendiri bahwa pemanggilnya benar owner
// (lihat contoh di app/dashboard/pegawai/actions.ts).
// JANGAN PERNAH import file ini di client component ('use client').
export function createAdminClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    )
}