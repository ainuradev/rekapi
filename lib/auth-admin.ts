// Helper untuk verifikasi Super Admin Rekapi

export function isSuperAdmin(email: string | null | undefined): boolean {
    if (!email) return false

    const cleanEmail = email.trim().toLowerCase()

    // Cek dari environment variable SUPER_ADMIN_EMAILS atau SUPERADMIN_EMAILS (koma terpisah)
    const rawEnv = process.env.SUPER_ADMIN_EMAILS || process.env.SUPERADMIN_EMAILS
    if (!rawEnv || !rawEnv.trim()) {
        // FAIL-CLOSED: Jika variabel environment belum diatur, tolak seluruh akses admin
        return false
    }

    const envEmails = rawEnv
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)

    const allowed = new Set(envEmails)
    return allowed.has(cleanEmail)
}
