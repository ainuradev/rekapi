import type { SupabaseClient } from '@supabase/supabase-js'

export interface SubscriptionPlanRecord {
    id: string
    code: string
    name: string
    price: number
    max_branches: number | null
    max_employees: number | null
    duration_days: number
    description: string | null
    features: string[] | null
    can_advanced_reports: boolean
    can_api_access: boolean
    created_at?: string
}

export const DEFAULT_SUBSCRIPTION_PLANS = [
    {
        code: 'standard',
        name: 'Standard',
        price: 149000,
        max_branches: 1,
        max_employees: 1,
        duration_days: 28,
        description: 'Cocok untuk bisnis dengan 1 cabang dan 1 akun kasir',
        features: [
            'Maksimal 1 cabang & 1 akun kasir',
            'Kasir POS lengkap (7 channel & cetak struk)',
            'Katalog produk, HPP & kalkulasi margin',
            'CRM pelanggan & diskon member otomatis',
            'Pencatatan beban & Laporan Laba Rugi',
            'Laporan kinerja produk & cetak PDF',
        ],
        can_advanced_reports: false,
        can_api_access: false,
    },
    {
        code: 'business',
        name: 'Business',
        price: 299000,
        max_branches: 3,
        max_employees: 3,
        duration_days: 28,
        description: 'Untuk bisnis yang mulai berkembang hingga 3 cabang',
        features: [
            'Maksimal 3 cabang & 3 akun kasir',
            'Semua fitur paket Standard',
            'Stok bahan baku, belanja & data supplier',
            'Buku kas, multi-rekening & setoran cabang',
            'Buku utang supplier & piutang pelanggan',
            'Ekspor laporan ke Excel (.xls) & CSV',
        ],
        can_advanced_reports: true,
        can_api_access: false,
    },
    {
        code: 'pro',
        name: 'Pro',
        price: 499000,
        max_branches: 5,
        max_employees: 5,
        duration_days: 28,
        description: 'Untuk bisnis berkembang pesat hingga 5 cabang',
        features: [
            'Maksimal 5 cabang & 5 akun kasir',
            'Semua fitur paket Business',
            'Laporan Neraca SAK EMKM (Posisi Keuangan)',
            'Laporan Arus Kas (Operasi, Investasi, Pendanaan)',
            'Manajemen modal disetor & prive pemilik',
            'Konsolidasi keuangan penuh lintas cabang',
        ],
        can_advanced_reports: true,
        can_api_access: true,
    },
]

/**
 * Self-healing helper: Memastikan tabel subscription_plans memiliki data paket default.
 * Jika tabel kosong (misal setelah truncate/reset database), fungsi ini otomatis melakukan
 * upsert paket Standard, Business, dan Pro menggunakan admin client (service_role).
 */
export async function ensureSubscriptionPlans(
    adminClient: SupabaseClient
): Promise<SubscriptionPlanRecord[]> {
    const { data: existing, error: fetchErr } = await adminClient
        .from('subscription_plans')
        .select('*')
        .order('price', { ascending: true })

    if (!fetchErr && existing && existing.length >= 3) {
        return existing as unknown as SubscriptionPlanRecord[]
    }

    // Lakukan upsert untuk masing-masing paket default berdasarkan kolom unique 'code'
    for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
        await adminClient.from('subscription_plans').upsert(
            {
                code: plan.code,
                name: plan.name,
                price: plan.price,
                max_branches: plan.max_branches,
                max_employees: plan.max_employees,
                duration_days: plan.duration_days,
                description: plan.description,
                features: plan.features,
                can_advanced_reports: plan.can_advanced_reports,
                can_api_access: plan.can_api_access,
            },
            { onConflict: 'code' }
        )
    }

    const { data: refetched } = await adminClient
        .from('subscription_plans')
        .select('*')
        .order('price', { ascending: true })

    return (refetched || []) as unknown as SubscriptionPlanRecord[]
}

