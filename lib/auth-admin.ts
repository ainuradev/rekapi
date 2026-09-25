// Helper untuk verifikasi Super Admin Rekapin

export function isSuperAdmin(email: string | null | undefined): boolean {
    if (!email) return false

    const cleanEmail = email.trim().toLowerCase()

    // 1. Cek dari environment variable SUPERADMIN_EMAILS (koma terpisah)
    const envEmails = process.env.SUPERADMIN_EMAILS
        ? process.env.SUPERADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase())
        : []

    // 2. Default email administrator / developer pemilik sistem
    const defaultAdmins = [
        'adtyanugraha654@gmail.com',
        'pajar123@gmail.com',
    ]

    const allowed = new Set([...envEmails, ...defaultAdmins])
    return allowed.has(cleanEmail)
}
