import type { SupabaseClient } from '@supabase/supabase-js'

export interface DowngradeResult {
    isDowngrade: boolean
    deactivatedBranches: number
    deactivatedEmployees: number
}

/**
 * Mendeteksi apakah terjadi downgrade kuota cabang/fitur.
 */
export function isQuotaDowngrade(oldMaxBranches: number, newMaxBranches: number): boolean {
    return newMaxBranches < oldMaxBranches
}

/**
 * Menjalankan auto-deaktivasi cabang tambahan dan pegawai non-Cabang Utama saat terjadi downgrade.
 * Cabang Utama (code = 'PUSAT' atau cabang terawal dibuat) selalu dipertahankan tetap aktif.
 */
export async function executeAutoDeactivateOnDowngrade(
    businessId: string,
    client?: SupabaseClient
): Promise<DowngradeResult> {
    if (!businessId) {
        return { isDowngrade: true, deactivatedBranches: 0, deactivatedEmployees: 0 }
    }

    let admin = client
    if (!admin) {
        const { createAdminClient } = await import('@/lib/supabase/admin')
        admin = createAdminClient()
    }

    // 1. Coba panggil stored procedure RPC PostgreSQL terlebih dahulu jika tersedia
    try {
        const { error: rpcErr } = await admin.rpc('auto_deactivate_on_downgrade', {
            p_business_id: businessId,
        })
        if (!rpcErr) {
            // Berhasil via stored procedure database trigger/RPC
        }
    } catch (err) {
        console.warn('RPC auto_deactivate_on_downgrade fallback to application query:', err)
    }

    // 2. Application-level enforcement & audit count
    // Temukan Cabang Utama (prioritaskan code = 'PUSAT', lalu urutan created_at ASC)
    const { data: branches } = await admin
        .from('branches')
        .select('id, name, code, status, created_at')
        .eq('business_id', businessId)
        .order('created_at', { ascending: true })

    if (!branches || branches.length === 0) {
        return { isDowngrade: true, deactivatedBranches: 0, deactivatedEmployees: 0 }
    }

    const mainBranch =
        branches.find((b) => b.code === 'PUSAT' || b.name.toLowerCase().includes('cabang utama')) ||
        branches[0]

    // Pastikan Cabang Utama selalu aktif
    if (mainBranch.status !== 'active') {
        await admin
            .from('branches')
            .update({ status: 'active' })
            .eq('id', mainBranch.id)
    }

    // Nonaktifkan cabang-cabang lain yang masih berstatus active
    const otherActiveBranches = branches.filter(
        (b) => b.id !== mainBranch.id && b.status === 'active'
    )

    let deactivatedBranches = 0
    if (otherActiveBranches.length > 0) {
        const otherIds = otherActiveBranches.map((b) => b.id)
        const { error: branchErr } = await admin
            .from('branches')
            .update({ status: 'inactive' })
            .in('id', otherIds)

        if (!branchErr) {
            deactivatedBranches = otherIds.length
        }
    }

    // Nonaktifkan pegawai kasir yang bertugas di cabang non-utama atau tanpa cabang
    const { data: cashiers } = await admin
        .from('profiles')
        .select('id, branch_id, is_active')
        .eq('business_id', businessId)
        .eq('role', 'pegawai')
        .eq('is_active', true)

    let deactivatedEmployees = 0
    const nonMainCashiers = (cashiers ?? []).filter(
        (c) => !c.branch_id || c.branch_id !== mainBranch.id
    )

    if (nonMainCashiers.length > 0) {
        const cashierIds = nonMainCashiers.map((c) => c.id)
        const { error: empErr } = await admin
            .from('profiles')
            .update({ is_active: false })
            .in('id', cashierIds)

        if (!empErr) {
            deactivatedEmployees = cashierIds.length
        }
    }

    return {
        isDowngrade: true,
        deactivatedBranches,
        deactivatedEmployees,
    }
}
