export interface ProductValuationItem {
    id: string
    cost_price?: number | null
    stock?: number | null
    status?: string | null
}

export interface ProductBranchStockItem {
    product_id: string
    branch_id: string
    stock?: number | null
}

export interface BranchOption {
    id: string
    name: string
}

export interface EffectiveBranchFilter {
    selectedBranchId: string
    selectedBranch: BranchOption | undefined
    branchLabel: string
}

export interface MerchandiseValuationInput {
    products: ProductValuationItem[] | null
    branchStocks: ProductBranchStockItem[] | null
    selectedBranchId: string
    productsError?: { code?: string; message?: string } | null
    branchStocksError?: { code?: string; message?: string } | null
}

export interface MerchandiseValuationResult {
    value: number | null
    hasError: boolean
    errorMessage: string | null
}

/**
 * Memvalidasi ID cabang terhadap daftar cabang milik bisnis pengguna.
 * Jika ID cabang tidak ditemukan pada bisnis tersebut, fallback ke 'all' (Konsolidasi)
 * agar label laporan dan filter query selalu sinkron.
 */
export function resolveEffectiveBranchFilter(
    candidateBranchId: string | null | undefined,
    branchList: BranchOption[]
): EffectiveBranchFilter {
    if (!candidateBranchId || candidateBranchId === 'all') {
        return {
            selectedBranchId: 'all',
            selectedBranch: undefined,
            branchLabel: 'Semua Cabang (Konsolidasi)',
        }
    }

    const matchedBranch = (branchList ?? []).find((b) => b.id === candidateBranchId)
    if (!matchedBranch) {
        return {
            selectedBranchId: 'all',
            selectedBranch: undefined,
            branchLabel: 'Semua Cabang (Konsolidasi)',
        }
    }

    return {
        selectedBranchId: matchedBranch.id,
        selectedBranch: matchedBranch,
        branchLabel: `Cabang ${matchedBranch.name}`,
    }
}

/**
 * Menghitung nilai persediaan produk jadi (merchandise inventory) untuk Laporan Neraca.
 * - Jika query produk atau stok cabang gagal, mengembalikan { value: null, hasError: true }
 *   dan TIDAK melakukan fallback ke products.stock.
 * - Mencegah penghitungan ganda antara product_branch_stocks dan products.stock.
 */
export function calculateMerchandiseInventoryValue({
    products,
    branchStocks,
    selectedBranchId,
    productsError = null,
    branchStocksError = null,
}: MerchandiseValuationInput): MerchandiseValuationResult {
    if (productsError || products === null) {
        return {
            value: null,
            hasError: true,
            errorMessage: 'Gagal memuat data harga modal (HPP) produk.',
        }
    }

    if (branchStocksError || branchStocks === null) {
        return {
            value: null,
            hasError: true,
            errorMessage: 'Gagal memuat data stok produk per cabang.',
        }
    }

    const costPriceMap = new Map<string, number>()
    for (const p of products) {
        costPriceMap.set(p.id, Math.max(0, Number(p.cost_price || 0)))
    }

    let prodStockValue = 0

    if (branchStocks.length > 0) {
        const filteredBranchStocks =
            selectedBranchId === 'all'
                ? branchStocks
                : branchStocks.filter((bs) => bs.branch_id === selectedBranchId)

        prodStockValue = filteredBranchStocks.reduce((acc, bs) => {
            const cost = costPriceMap.get(bs.product_id) ?? 0
            return acc + Math.max(0, Number(bs.stock || 0)) * cost
        }, 0)

        // Fallback kompatibilitas data lama: produk yang sama sekali belum memiliki baris di product_branch_stocks
        if (selectedBranchId === 'all') {
            const trackedProductIds = new Set(branchStocks.map((bs) => bs.product_id))
            for (const p of products) {
                if (!trackedProductIds.has(p.id)) {
                    prodStockValue += Math.max(0, Number(p.stock || 0)) * Math.max(0, Number(p.cost_price || 0))
                }
            }
        }
    } else if (selectedBranchId === 'all') {
        // Tabel product_branch_stocks berhasil diakses namun masih kosong (belum ada baris cabang)
        prodStockValue = products.reduce(
            (acc, p) => acc + Math.max(0, Number(p.stock || 0)) * Math.max(0, Number(p.cost_price || 0)),
            0
        )
    }

    return {
        value: prodStockValue,
        hasError: false,
        errorMessage: null,
    }
}

