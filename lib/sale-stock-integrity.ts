export interface SaleEditableTarget {
    id?: string
    business_id: string
    branch_id: string | null
    status?: string | null
}

export interface SaleCallerContext {
    business_id: string
    branch_id?: string | null
    role: string
}

export type SaleEditableValidationResult =
    | { ok: true }
    | { ok: false; error: string }

export interface RpcErrorLike {
    code?: string | null
    message?: string | null
}

export interface StockDeductionResult {
    deducted: number
    newStock: number
}

/**
 * Memvalidasi apakah sebuah transaksi penjualan boleh diedit oleh pengguna pemanggil.
 * Menolak lintas-bisnis, cabang tidak berwenang (untuk non-owner), dan transaksi berstatus 'voided'.
 */
export function validateSaleEditable(
    sale: SaleEditableTarget | null | undefined,
    caller: SaleCallerContext | null | undefined
): SaleEditableValidationResult {
    if (!caller || !caller.business_id) {
        return { ok: false, error: 'Profil pengguna tidak ditemukan.' }
    }

    if (!sale) {
        return { ok: false, error: 'Transaksi tidak ditemukan atau Anda tidak berhak mengaksesnya.' }
    }

    if (sale.business_id !== caller.business_id) {
        return { ok: false, error: 'Akses ditolak: Transaksi tidak terdaftar di bisnis Anda.' }
    }

    if ((sale.status ?? 'completed') === 'voided') {
        return { ok: false, error: 'Transaksi yang sudah dibatalkan (voided) tidak dapat diedit.' }
    }

    if (caller.role !== 'owner' && sale.branch_id !== caller.branch_id) {
        return { ok: false, error: 'Anda hanya berhak mengedit transaksi di cabang Anda sendiri.' }
    }

    return { ok: true }
}

/**
 * Menentukan apakah kegagalan pemanggilan RPC update_sale_atomic boleh jatuh ke
 * jalur fallback kompatibilitas lama.
 *
 * HANYA diizinkan jika fungsi RPC benar-benar belum terpasang di database (42883 / PGRST202).
 * Error validasi bisnis (misal P0001 voided, 42501 akses ditolak, constraint gagal)
 * WAJIB langsung dihentikan dan tidak boleh mem-bypass RPC menggunakan admin client.
 */
export function shouldFallbackFromUpdateSaleRpc(rpcError: RpcErrorLike | null | undefined): boolean {
    if (!rpcError) return false
    const code = String(rpcError.code ?? '').trim().toUpperCase()
    return code === '42883' || code === 'PGRST202'
}

/**
 * Menghitung pemotongan stok aktual (identik dengan logika trigger SQL fn_deduct_stock_on_sale):
 * - Jika stok >= qty, terpotong penuh sebesar qty.
 * - Jika 0 <= stok < qty (oversell), stok tertahan di 0 dan yang tercatat terpotong hanya sebesar stok tersedia.
 * - Jika stok <= 0, jumlah terpotong = 0 dan stok tidak dimanipulasi naik ke 0.
 */
export function computeExactStockDeduction(
    currentStock: number | null | undefined,
    requestedQuantity: number
): StockDeductionResult {
    const stockNum = Number(currentStock ?? 0)
    const safeStock = Number.isFinite(stockNum) ? stockNum : 0
    const qtyNum = Number(requestedQuantity)
    const safeQty = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 0

    const deducted = Math.max(Math.min(safeStock, safeQty), 0)
    const newStock = Math.round((safeStock - deducted) * 100) / 100

    return {
        deducted: Math.round(deducted * 100) / 100,
        newStock,
    }
}

/**
 * Menghitung jumlah stok yang harus dikembalikan saat item penjualan dihapus (edit) atau transaksi di-void:
 * - Jika transaksi sudah berstatus 'voided' pada trigger delete item, kembalikan 0 (mencegah pemulihan ganda).
 * - Jika kolom *_stock_deducted tersedia (bukan null/undefined), gunakan nilai aktual tersebut.
 * - Untuk data historis lama (kolom bernilai null/undefined), fallback ke quantity item.
 */
export function computeExactStockRestoration(
    recordedDeducted: number | null | undefined,
    itemQuantity: number,
    saleStatus: string | null | undefined = 'completed'
): number {
    if ((saleStatus ?? 'completed') === 'voided') {
        return 0
    }

    if (recordedDeducted !== null && recordedDeducted !== undefined) {
        const deductedNum = Number(recordedDeducted)
        return Number.isFinite(deductedNum) ? Math.max(0, Math.round(deductedNum * 100) / 100) : 0
    }

    const qtyNum = Number(itemQuantity)
    return Number.isFinite(qtyNum) ? Math.max(0, Math.round(qtyNum * 100) / 100) : 0
}

export interface BranchStockRowLike {
    product_id: string
    branch_id: string
    stock?: number | null
}

export interface RequestedSaleItemStock {
    product_id: string
    name?: string
    quantity: number
}

export interface HistoricalSaleItemStock {
    product_id: string
    quantity: number
    branch_stock_deducted?: number | null
}

export interface ProductBranchStockInfo {
    currentStock: number
    name?: string
}

export type StrictStockValidationResult =
    | {
          ok: true
          availableByProduct: Map<string, number>
      }
    | {
          ok: false
          productId: string
          productName: string
          requestedQty: number
          availableStock: number
          error: string
      }

function roundQty(value: number): number {
    return Math.round(value * 100) / 100
}

/**
 * Memformat angka stok agar bersih untuk pesan ke pengguna (contoh: 8.00 -> "8", 2.50 -> "2.5").
 */
export function formatStockQuantity(quantity: number): string {
    const clean = Math.max(0, roundQty(Number(quantity) || 0))
    if (Number.isInteger(clean)) {
        return String(clean)
    }
    return String(clean)
}

/**
 * Menghasilkan pesan penolakan standar saat kuantitas melebihi stok efektif tersedia.
 */
export function formatInsufficientStockError(productName: string, maxAvailable: number): string {
    const label = (productName || 'Produk').trim() || 'Produk'
    return `Stok produk ${label} tidak mencukupi. Stok tersedia maksimal: ${formatStockQuantity(maxAvailable)}`
}

/**
 * Menentukan stok fisik saat ini untuk suatu produk pada cabang tertentu:
 * - Jika baris `(productId, branchId)` ditemukan di `product_branch_stocks`, gunakan nilai tersebut.
 * - Jika produk sudah menggunakan `product_branch_stocks` (ada baris di cabang lain), tetapi belum memiliki
 *   baris di `branchId`, maka stok fisik di `branchId` adalah `0` (mencegah kebocoran stok cabang lain).
 * - Hanya jika produk sama sekali belum memiliki baris di `product_branch_stocks` (data kompatibilitas lama),
 *   fallback ke `fallbackProductStock`.
 */
export function resolveBranchProductStock(params: {
    productId: string
    branchId: string | null | undefined
    branchStocks: BranchStockRowLike[] | null | undefined
    fallbackProductStock?: number | null
}): number {
    const { productId, branchId, branchStocks, fallbackProductStock } = params
    const rows = branchStocks ?? []

    if (branchId && branchId !== 'all') {
        let hasAnyBranchRowForProduct = false
        for (const row of rows) {
            if (row.product_id === productId) {
                hasAnyBranchRowForProduct = true
                if (row.branch_id === branchId) {
                    const num = Number(row.stock ?? 0)
                    return Number.isFinite(num) ? Math.max(0, roundQty(num)) : 0
                }
            }
        }

        if (hasAnyBranchRowForProduct) {
            return 0
        }
    }

    const fallbackNum = Number(fallbackProductStock ?? 0)
    return Number.isFinite(fallbackNum) ? Math.max(0, roundQty(fallbackNum)) : 0
}

/**
 * Menghitung Stok Efektif Tersedia saat mengedit item transaksi:
 * `Stok Efektif Tersedia = Stok Cabang Saat Ini + Kuantitas Lama di Transaksi Ini (old_qty)`
 *
 * Catatan kompatibilitas: bila transaksi lama pernah mengalami oversell sebelum validasi ketat
 * diberlakukan (`branch_stock_deducted < old_qty`), stok fisik yang benar-benar dikembalikan
 * oleh database adalah `min(old_qty, branch_stock_deducted)`. Untuk seluruh transaksi normal,
 * nilai tersebut identik dengan `old_qty`.
 */
export function computeEffectiveEditAvailableStock(
    currentBranchStock: number | null | undefined,
    oldQuantity: number | null | undefined,
    recordedBranchDeducted?: number | null
): number {
    const safeCurrent = Math.max(0, Number.isFinite(Number(currentBranchStock)) ? Number(currentBranchStock) : 0)
    const safeOldQty = Math.max(0, Number.isFinite(Number(oldQuantity)) ? Number(oldQuantity) : 0)

    const effectiveOldRestored =
        recordedBranchDeducted !== null && recordedBranchDeducted !== undefined && Number.isFinite(Number(recordedBranchDeducted))
            ? Math.max(0, Math.min(safeOldQty, Number(recordedBranchDeducted)))
            : safeOldQty

    return roundQty(safeCurrent + effectiveOldRestored)
}

/**
 * Validasi ketat ketersediaan stok (No Oversell) untuk pembuatan transaksi baru (`oldItems = []`)
 * maupun pengeditan riwayat transaksi (`oldItems` berisi item struk sebelum diedit).
 *
 * Mengagregasi kuantitas per `product_id` sehingga duplikasi baris produk yang sama di dalam
 * payload tidak dapat mem-bypass batas stok tersedia.
 */
export function validateSaleStockAvailability(params: {
    requestedItems: RequestedSaleItemStock[]
    oldItems?: HistoricalSaleItemStock[] | null
    stockByProductId: ReadonlyMap<string, ProductBranchStockInfo>
}): StrictStockValidationResult {
    const { requestedItems, oldItems, stockByProductId } = params

    // 1. Agregasi kuantitas lama per product_id (default 0 untuk produk baru / transaksi baru)
    const oldQtyByProduct = new Map<string, { oldQty: number; deductedQty: number | null }>()
    for (const old of oldItems ?? []) {
        if (!old?.product_id) continue
        const qty = Math.max(0, Number(old.quantity) || 0)
        const prev = oldQtyByProduct.get(old.product_id)

        const hasDeducted =
            old.branch_stock_deducted !== null &&
            old.branch_stock_deducted !== undefined &&
            Number.isFinite(Number(old.branch_stock_deducted))

        const itemDeducted = hasDeducted ? Math.max(0, Math.min(qty, Number(old.branch_stock_deducted))) : null

        if (!prev) {
            oldQtyByProduct.set(old.product_id, {
                oldQty: roundQty(qty),
                deductedQty: itemDeducted,
            })
        } else {
            oldQtyByProduct.set(old.product_id, {
                oldQty: roundQty(prev.oldQty + qty),
                deductedQty:
                    prev.deductedQty !== null && itemDeducted !== null
                        ? roundQty(prev.deductedQty + itemDeducted)
                        : null,
            })
        }
    }

    // 2. Agregasi kuantitas baru yang diminta per product_id
    const requestedByProduct = new Map<string, { qty: number; fallbackName?: string }>()
    for (const item of requestedItems ?? []) {
        const qty = Number(item.quantity)
        if (!item.product_id || !Number.isFinite(qty) || qty <= 0) {
            return {
                ok: false,
                productId: item?.product_id ?? '',
                productName: item?.name || 'Produk',
                requestedQty: Number.isFinite(qty) ? qty : 0,
                availableStock: 0,
                error: 'Kuantitas item harus berupa angka positif (> 0).',
            }
        }

        const prev = requestedByProduct.get(item.product_id)
        requestedByProduct.set(item.product_id, {
            qty: roundQty((prev?.qty ?? 0) + qty),
            fallbackName: prev?.fallbackName || item.name,
        })
    }

    // 3. Periksa setiap produk yang diminta terhadap Stok Efektif Tersedia
    const availableByProduct = new Map<string, number>()

    for (const [productId, req] of requestedByProduct.entries()) {
        const stockInfo = stockByProductId.get(productId)
        const oldInfo = oldQtyByProduct.get(productId)
        const productName = stockInfo?.name || req.fallbackName || 'Produk'

        const effectiveAvailable = computeEffectiveEditAvailableStock(
            stockInfo?.currentStock ?? 0,
            oldInfo?.oldQty ?? 0,
            oldInfo?.deductedQty ?? null
        )

        availableByProduct.set(productId, effectiveAvailable)

        if (req.qty > effectiveAvailable) {
            return {
                ok: false,
                productId,
                productName,
                requestedQty: req.qty,
                availableStock: effectiveAvailable,
                error: formatInsufficientStockError(productName, effectiveAvailable),
            }
        }
    }

    return {
        ok: true,
        availableByProduct,
    }
}


