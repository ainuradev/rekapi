export interface BranchRef {
    id: string
    name?: string
}

export interface BranchStockEntry {
    branch_id: string
    stock: number
}

export interface StockCallerProfile {
    business_id: string
    branch_id?: string | null
    role: string
}

export type BranchStockAuthResult =
    | { ok: true }
    | { ok: false; error: string }

function sanitizeNonNegativeStock(value: number | null | undefined): number {
    const num = Number(value ?? 0)
    if (!Number.isFinite(num) || num < 0) return 0
    return Math.round(num * 100) / 100
}

/**
 * Menghitung agregat stok produk (`products.stock`) sebagai penjumlahan murni
 * dari seluruh stok cabang (`SUM(product_branch_stocks.stock)`).
 */
export function computeAggregateProductStock(branchStocks: BranchStockEntry[]): number {
    const sum = (branchStocks ?? []).reduce(
        (acc, row) => acc + sanitizeNonNegativeStock(row.stock),
        0
    )
    return Math.round(sum * 100) / 100
}

/**
 * Menginisialisasi baris stok per cabang saat produk baru dibuat (Direct Branch Stock):
 * - Stok awal `initialStock` dimasukkan HANYA ke 1 cabang target (`preferredBranchId` jika valid,
 *   atau cabang pertama/utama bisnis jika tidak).
 * - Seluruh cabang lainnya diinisialisasi dengan `0` agar total stok konsolidasi tetap `initialStock`
 *   (tidak berlipat ganda sejumlah cabang).
 */
export function initializeNewProductBranchStocks(
    initialStock: number | null | undefined,
    branches: BranchRef[],
    preferredBranchId?: string | null
): {
    targetBranchId: string | null
    branchStocks: BranchStockEntry[]
    aggregateStock: number
} {
    const cleanInitial = sanitizeNonNegativeStock(initialStock)
    const branchList = branches ?? []

    if (branchList.length === 0) {
        return {
            targetBranchId: null,
            branchStocks: [],
            aggregateStock: cleanInitial,
        }
    }

    const matchedPreferred =
        preferredBranchId && preferredBranchId !== 'all'
            ? branchList.find((b) => b.id === preferredBranchId)
            : undefined

    const targetBranch = matchedPreferred ?? branchList[0]

    const branchStocks: BranchStockEntry[] = branchList.map((b) => ({
        branch_id: b.id,
        stock: b.id === targetBranch.id ? cleanInitial : 0,
    }))

    return {
        targetBranchId: targetBranch.id,
        branchStocks,
        aggregateStock: computeAggregateProductStock(branchStocks),
    }
}

/**
 * Memvalidasi hak akses pengubahan stok cabang (`updateBranchStock`):
 * - Owner berhak mengubah stok cabang mana pun di dalam bisnisnya.
 * - Pegawai (non-owner) HANYA berhak mengubah stok cabang tempat ia ditugaskan (`caller.branch_id === targetBranchId`).
 */
export function authorizeBranchStockMutation(
    caller: StockCallerProfile | null | undefined,
    targetBusinessId: string,
    targetBranchId: string
): BranchStockAuthResult {
    if (!caller || !caller.business_id) {
        return { ok: false, error: 'Profil pengguna tidak ditemukan.' }
    }

    if (caller.business_id !== targetBusinessId) {
        return { ok: false, error: 'Akses ditolak: Cabang atau produk bukan milik bisnis Anda.' }
    }

    if (!targetBranchId || targetBranchId === 'all') {
        return { ok: false, error: 'Cabang tujuan wajib dipilih.' }
    }

    if (caller.role !== 'owner') {
        if (!caller.branch_id || caller.branch_id !== targetBranchId) {
            return {
                ok: false,
                error: 'Akses ditolak: Anda hanya dapat mengatur stok di cabang tempat Anda ditugaskan.',
            }
        }
    }

    return { ok: true }
}

/**
 * Menerapkan pembaruan stok langsung pada satu cabang (Direct Branch Stock)
 * tanpa konsep pengurangan/pengembalian gudang induk, lalu menyinkronkan
 * `aggregateStock` (`products.stock`) menjadi `SUM` seluruh cabang.
 */
export function applyDirectBranchStockUpdate(
    existingBranchStocks: BranchStockEntry[],
    targetBranchId: string,
    newStockValue: number
): {
    updatedBranchStock: number
    branchStocks: BranchStockEntry[]
    aggregateStock: number
} {
    const cleanStock = sanitizeNonNegativeStock(newStockValue)
    let found = false

    const nextStocks: BranchStockEntry[] = (existingBranchStocks ?? []).map((row) => {
        if (row.branch_id === targetBranchId) {
            found = true
            return { branch_id: row.branch_id, stock: cleanStock }
        }
        return { branch_id: row.branch_id, stock: sanitizeNonNegativeStock(row.stock) }
    })

    if (!found) {
        nextStocks.push({ branch_id: targetBranchId, stock: cleanStock })
    }

    return {
        updatedBranchStock: cleanStock,
        branchStocks: nextStocks,
        aggregateStock: computeAggregateProductStock(nextStocks),
    }
}

