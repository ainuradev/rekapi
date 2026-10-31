import midtransClient from 'midtrans-client'

export class MidtransConfigError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'MidtransConfigError'
    }
}

export interface ValidatedMidtransConfig {
    isProduction: boolean
    environment: 'production' | 'sandbox'
    serverKey: string
    clientKey: string
    snapUrl: string
}

export interface MidtransConfigStatus {
    isValid: boolean
    environment: 'production' | 'sandbox'
    isProduction: boolean
    serverKeyConfigured: boolean
    serverKeyPrefix: string
    clientKeyConfigured: boolean
    clientKeyPrefix: string
    snapUrl: string
    errors: string[]
    notes?: string[]
}

/**
 * Validasi ketat (fail-closed) konfigurasi Midtrans.
 * - Mencegah transaksi Production dijalankan dari development, test, atau staging.
 * - Mendukung penuh kredensial Midtrans Sandbox format terbaru (`Mid-server-*` / `Mid-client-*`)
 *   maupun format klasik (`SB-Mid-server-*` / `SB-Mid-client-*`) ketika `MIDTRANS_IS_PRODUCTION=false`.
 */
export function validateMidtransConfig(env: NodeJS.ProcessEnv = process.env): ValidatedMidtransConfig {
    const errors: string[] = []

    const isProduction = env.MIDTRANS_IS_PRODUCTION === 'true'
    const targetMode: 'production' | 'sandbox' = isProduction ? 'production' : 'sandbox'

    const nodeEnv = env.NODE_ENV || 'development'
    const appEnv = env.APP_ENV || env.NEXT_PUBLIC_APP_ENV || env.VERCEL_ENV || nodeEnv
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || ''
    const isStagingDb = supabaseUrl.includes('ucvgszazrjnjaglaiswq')

    // 1. PENGAMANAN FAIL-CLOSED: Cegah mode production di lingkungan non-production
    if (isProduction) {
        const isNonProdEnv =
            nodeEnv === 'development' ||
            nodeEnv === 'test' ||
            appEnv === 'development' ||
            appEnv === 'test' ||
            appEnv === 'staging' ||
            appEnv === 'preview' ||
            isStagingDb

        if (isNonProdEnv) {
            throw new MidtransConfigError(
                `[MIDTRANS SAFETY] Pembayaran PRODUCTION DITOLAK pada environment non-production (appEnv=${appEnv}, nodeEnv=${nodeEnv}, stagingDb=${isStagingDb}). Ubah MIDTRANS_IS_PRODUCTION=false dan gunakan kredensial Sandbox (Mid-* atau SB-Mid-*).`
            )
        }
    }

    // 2. Validasi Server Key
    // Catatan: Akun Midtrans Sandbox terbaru mengeluarkan key berawalan 'Mid-server-*' (tanpa 'SB-').
    // Selama MIDTRANS_IS_PRODUCTION=false, baik 'Mid-server-*' maupun 'SB-Mid-server-*' diizinkan penuh.
    const serverKey = (env.MIDTRANS_SERVER_KEY || '').trim()
    if (!serverKey) {
        errors.push('MIDTRANS_SERVER_KEY tidak ditemukan atau bernilai kosong')
    } else if (serverKey.startsWith('<') && serverKey.endsWith('>')) {
        errors.push('MIDTRANS_SERVER_KEY masih berupa placeholder')
    } else if (isProduction && !serverKey.startsWith('Mid-server-')) {
        errors.push(
            `Kredensial tidak konsisten: mode Production memerlukan server key berawalan 'Mid-server-', ditemukan '${serverKey.slice(0, 14)}...'`
        )
    } else if (!isProduction && !serverKey.startsWith('SB-Mid-server-') && !serverKey.startsWith('Mid-server-')) {
        errors.push(
            "MIDTRANS_SERVER_KEY tidak valid: harus berawalan 'Mid-server-' atau 'SB-Mid-server-'"
        )
    }

    // 3. Validasi Client Key
    const clientKey = (env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || env.MIDTRANS_CLIENT_KEY || '').trim()
    if (!clientKey) {
        errors.push('NEXT_PUBLIC_MIDTRANS_CLIENT_KEY tidak ditemukan atau bernilai kosong')
    } else if (clientKey.startsWith('<') && clientKey.endsWith('>')) {
        errors.push('NEXT_PUBLIC_MIDTRANS_CLIENT_KEY masih berupa placeholder')
    } else if (isProduction && !clientKey.startsWith('Mid-client-')) {
        errors.push(
            `Kredensial tidak konsisten: mode Production memerlukan client key berawalan 'Mid-client-', ditemukan '${clientKey.slice(0, 14)}...'`
        )
    } else if (!isProduction && !clientKey.startsWith('SB-Mid-client-') && !clientKey.startsWith('Mid-client-')) {
        errors.push(
            "NEXT_PUBLIC_MIDTRANS_CLIENT_KEY tidak valid: harus berawalan 'Mid-client-' atau 'SB-Mid-client-'"
        )
    }

    // 4. Validasi Snap URL (Tanpa silent fallback ke production)
    const customSnapUrl = env.NEXT_PUBLIC_MIDTRANS_SNAP_URL?.trim()
    let resolvedSnapUrl = isProduction
        ? 'https://app.midtrans.com/snap/snap.js'
        : 'https://app.sandbox.midtrans.com/snap/snap.js'

    if (customSnapUrl) {
        if (!isProduction && customSnapUrl.includes('app.midtrans.com/snap') && !customSnapUrl.includes('sandbox')) {
            errors.push('NEXT_PUBLIC_MIDTRANS_SNAP_URL mengarah ke Production padahal konfigurasi adalah Sandbox')
        } else if (isProduction && customSnapUrl.includes('sandbox')) {
            errors.push('NEXT_PUBLIC_MIDTRANS_SNAP_URL mengarah ke Sandbox padahal konfigurasi adalah Production')
        } else {
            resolvedSnapUrl = customSnapUrl
        }
    }

    if (errors.length > 0) {
        throw new MidtransConfigError(`[MIDTRANS CONFIG] ${errors.join('; ')}`)
    }

    return {
        isProduction,
        environment: targetMode,
        serverKey,
        clientKey,
        snapUrl: resolvedSnapUrl,
    }
}

/**
 * Diagnostic helper: periksa kelengkapan konfigurasi tanpa pernah menampilkan isi secret.
 */
export function getMidtransConfigStatus(env: NodeJS.ProcessEnv = process.env): MidtransConfigStatus {
    const isProduction = env.MIDTRANS_IS_PRODUCTION === 'true'
    const targetMode: 'production' | 'sandbox' = isProduction ? 'production' : 'sandbox'

    const serverKey = (env.MIDTRANS_SERVER_KEY || '').trim()
    const clientKey = (env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || env.MIDTRANS_CLIENT_KEY || '').trim()
    const snapUrl =
        env.NEXT_PUBLIC_MIDTRANS_SNAP_URL ||
        (isProduction
            ? 'https://app.midtrans.com/snap/snap.js'
            : 'https://app.sandbox.midtrans.com/snap/snap.js')

    const errors: string[] = []
    const notes: string[] = []
    try {
        validateMidtransConfig(env)
        if (!isProduction && serverKey.startsWith('Mid-server-')) {
            notes.push(
                'Menggunakan format key Sandbox Midtrans terbaru tanpa prefix SB- (Mid-server-* / Mid-client-*) pada endpoint Sandbox.'
            )
        }
    } catch (err) {
        if (err instanceof MidtransConfigError) {
            errors.push(err.message)
        } else {
            errors.push(err instanceof Error ? err.message : 'Unknown validation error')
        }
    }

    const maskKey = (key: string, prefixMatch: string) => {
        if (!key) return 'empty'
        if (key.startsWith('<') && key.endsWith('>')) return 'placeholder'
        if (key.startsWith(prefixMatch)) return `${prefixMatch}***`
        return `${key.slice(0, Math.min(6, key.length))}***`
    }

    return {
        isValid: errors.length === 0,
        environment: targetMode,
        isProduction,
        serverKeyConfigured: Boolean(serverKey && !serverKey.startsWith('<')),
        serverKeyPrefix: isProduction
            ? maskKey(serverKey, 'Mid-server-')
            : serverKey.startsWith('SB-')
            ? maskKey(serverKey, 'SB-Mid-server-')
            : maskKey(serverKey, 'Mid-server-'),
        clientKeyConfigured: Boolean(clientKey && !clientKey.startsWith('<')),
        clientKeyPrefix: isProduction
            ? maskKey(clientKey, 'Mid-client-')
            : clientKey.startsWith('SB-')
            ? maskKey(clientKey, 'SB-Mid-client-')
            : maskKey(clientKey, 'Mid-client-'),
        snapUrl,
        errors,
        ...(notes.length > 0 ? { notes } : {}),
    }
}

export const getMidtransSnap = (env: NodeJS.ProcessEnv = process.env) => {
    const validated = validateMidtransConfig(env)
    const SnapClass =
        (midtransClient as unknown as { Snap?: typeof midtransClient.Snap }).Snap ||
        (midtransClient as unknown as { default?: { Snap?: typeof midtransClient.Snap } }).default?.Snap ||
        midtransClient.Snap
    return new SnapClass({
        isProduction: validated.isProduction,
        serverKey: validated.serverKey,
        clientKey: validated.clientKey,
    })
}

export const getMidtransCoreApi = (env: NodeJS.ProcessEnv = process.env) => {
    const validated = validateMidtransConfig(env)
    const CoreApiClass =
        (midtransClient as unknown as { CoreApi?: typeof midtransClient.CoreApi }).CoreApi ||
        (midtransClient as unknown as { default?: { CoreApi?: typeof midtransClient.CoreApi } }).default?.CoreApi ||
        midtransClient.CoreApi
    return new CoreApiClass({
        isProduction: validated.isProduction,
        serverKey: validated.serverKey,
        clientKey: validated.clientKey,
    })
}

// Fallback konfigurasi aman (default sandbox jika belum divalidasi)
export const MIDTRANS_CONFIG = {
    get isProduction() {
        return process.env.MIDTRANS_IS_PRODUCTION === 'true'
    },
    get serverKey() {
        return process.env.MIDTRANS_SERVER_KEY || ''
    },
    get clientKey() {
        return process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || ''
    },
    get snapUrl() {
        return (
            process.env.NEXT_PUBLIC_MIDTRANS_SNAP_URL ||
            (process.env.MIDTRANS_IS_PRODUCTION === 'true'
                ? 'https://app.midtrans.com/snap/snap.js'
                : 'https://app.sandbox.midtrans.com/snap/snap.js')
        )
    },
}
