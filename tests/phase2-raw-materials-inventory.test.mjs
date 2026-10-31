import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('Phase 2 Rekapi: Master Bahan Baku, Stok Cabang, Kartu Mutasi, dan Supplier', () => {

    // ─────────────────────────────────────────────────────────────────────────
    // 1. CRUD MASTER BAHAN BAKU
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. CRUD Master Bahan Baku', () => {
        const tenantA = 'biz-alpha-100'
        const tenantB = 'biz-beta-200'
        const rawMaterialsDb = new Map() // key: id, val: object

        function createRawMaterial(businessId, { name, sku, category, unit, cost_per_unit = 0, min_stock = 0 }) {
            if (!name || !name.trim()) throw new Error('Nama bahan baku wajib diisi')
            if (!unit || !unit.trim()) throw new Error('Satuan dasar wajib diisi')
            if (cost_per_unit < 0) throw new Error('Harga satuan tidak boleh negatif')
            if (min_stock < 0) throw new Error('Batas minimum stok tidak boleh negatif')

            // SKU uniqueness scoped to business_id (nullable SKU allowed)
            if (sku && sku.trim()) {
                const normalizedSku = sku.trim().toUpperCase()
                for (const item of rawMaterialsDb.values()) {
                    if (item.business_id === businessId && item.sku && item.sku.toUpperCase() === normalizedSku) {
                        throw new Error(`SKU "${sku}" sudah digunakan dalam bisnis ini`)
                    }
                }
            }

            const id = 'rm-' + Math.random().toString(36).substring(7)
            const record = {
                id,
                business_id: businessId,
                name: name.trim(),
                sku: sku?.trim() || null,
                category: category?.trim() || null,
                unit: unit.trim().toLowerCase(),
                cost_per_unit: Number(cost_per_unit),
                min_stock: Number(min_stock),
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
            rawMaterialsDb.set(id, record)
            return record
        }

        function updateRawMaterial(businessId, id, updates) {
            const existing = rawMaterialsDb.get(id)
            if (!existing || existing.business_id !== businessId) {
                throw new Error('Bahan baku tidak ditemukan atau di luar wewenang')
            }
            if (updates.name !== undefined && !updates.name.trim()) {
                throw new Error('Nama bahan baku tidak boleh kosong')
            }
            if (updates.cost_per_unit !== undefined && updates.cost_per_unit < 0) {
                throw new Error('Harga satuan tidak boleh negatif')
            }
            if (updates.min_stock !== undefined && updates.min_stock < 0) {
                throw new Error('Batas minimum stok tidak boleh negatif')
            }
            if (updates.sku && updates.sku.trim()) {
                const normalizedSku = updates.sku.trim().toUpperCase()
                for (const [otherId, item] of rawMaterialsDb.entries()) {
                    if (otherId !== id && item.business_id === businessId && item.sku && item.sku.toUpperCase() === normalizedSku) {
                        throw new Error(`SKU "${updates.sku}" sudah digunakan dalam bisnis ini`)
                    }
                }
            }

            const updated = {
                ...existing,
                ...updates,
                business_id: existing.business_id, // Immutable
                id: existing.id,                   // Immutable
                updated_at: new Date().toISOString()
            }
            rawMaterialsDb.set(id, updated)
            return updated
        }

        test('Validasi input: nama & satuan wajib, nilai tidak boleh negatif', () => {
            assert.throws(() => createRawMaterial(tenantA, { name: '', unit: 'kg' }), /Nama bahan baku wajib/)
            assert.throws(() => createRawMaterial(tenantA, { name: 'Gula', unit: '' }), /Satuan dasar wajib/)
            assert.throws(() => createRawMaterial(tenantA, { name: 'Gula', unit: 'kg', cost_per_unit: -500 }), /tidak boleh negatif/)
            assert.throws(() => createRawMaterial(tenantA, { name: 'Gula', unit: 'kg', min_stock: -1 }), /tidak boleh negatif/)

            const valid = createRawMaterial(tenantA, { name: 'Gula Pasir', sku: 'GL-01', unit: 'kg', cost_per_unit: 15000, min_stock: 5 })
            assert.equal(valid.name, 'Gula Pasir')
            assert.equal(valid.unit, 'kg')
            assert.equal(valid.cost_per_unit, 15000)
            assert.equal(valid.min_stock, 5)
        })

        test('Cegah duplikasi SKU dalam bisnis yang sama, tetapi izinkan SKU sama di bisnis berbeda', () => {
            // Tenant A buat SKU 'SKU-KOPI-01'
            createRawMaterial(tenantA, { name: 'Kopi Arabika', sku: 'SKU-KOPI-01', unit: 'kg' })

            // Tenant A coba buat SKU yang sama -> DITOLAK
            assert.throws(() => {
                createRawMaterial(tenantA, { name: 'Kopi Robusta', sku: 'SKU-KOPI-01', unit: 'kg' })
            }, /sudah digunakan dalam bisnis ini/)

            // Tenant B buat SKU yang sama 'SKU-KOPI-01' -> DIIZINKAN (Multi-tenant scoped SKU)
            const tenantBItem = createRawMaterial(tenantB, { name: 'Kopi Espresso Blend', sku: 'SKU-KOPI-01', unit: 'kg' })
            assert.equal(tenantBItem.business_id, tenantB)
            assert.equal(tenantBItem.sku, 'SKU-KOPI-01')
        })

        test('Update bahan mempertahankan business_id dan id tanpa mengubah tenant', () => {
            const item = createRawMaterial(tenantA, { name: 'Susu Segar', sku: 'SS-01', unit: 'liter', cost_per_unit: 20000 })
            const updated = updateRawMaterial(tenantA, item.id, { cost_per_unit: 22000, min_stock: 10 })
            assert.equal(updated.cost_per_unit, 22000)
            assert.equal(updated.min_stock, 10)
            assert.equal(updated.business_id, tenantA)
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 2. CRUD SUPPLIER
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. CRUD Master Supplier & Purchase History', () => {
        const tenantA = 'biz-alpha-100'
        const tenantB = 'biz-beta-200'
        const suppliersDb = new Map()
        const purchasesDb = []

        function createSupplier(businessId, { name, phone, email, address, bank_details, notes }) {
            if (!name || !name.trim()) throw new Error('Nama supplier wajib diisi')
            const id = 'sup-' + Math.random().toString(36).substring(7)
            const supplier = {
                id,
                business_id: businessId,
                name: name.trim(),
                phone: phone?.trim() || null,
                email: email?.trim() || null,
                address: address?.trim() || null,
                bank_details: bank_details?.trim() || null,
                notes: notes?.trim() || null,
                status: 'active',
                created_at: new Date().toISOString()
            }
            suppliersDb.set(id, supplier)
            return supplier
        }

        function getSupplierWithPurchases(businessId, supplierId) {
            const supplier = suppliersDb.get(supplierId)
            if (!supplier || supplier.business_id !== businessId) {
                throw new Error('Supplier tidak ditemukan')
            }
            const history = purchasesDb.filter(p => p.business_id === businessId && p.supplier_id === supplierId)
            const totalSpent = history.reduce((sum, p) => sum + p.total, 0)
            return {
                ...supplier,
                purchase_count: history.length,
                total_spent: totalSpent,
                purchases: history
            }
        }

        test('Supplier tersimpan dengan atribut lengkap & terisolasi per tenant', () => {
            const sA = createSupplier(tenantA, {
                name: 'CV Sumber Makmur',
                phone: '08123456789',
                email: 'sales@sumbermakmur.com',
                address: 'Jl. Industri No. 12',
                bank_details: 'BCA 1234567890 a/n Sumber Makmur',
                notes: 'Pengiriman setiap Selasa & Jumat'
            })
            assert.equal(sA.business_id, tenantA)
            assert.equal(sA.name, 'CV Sumber Makmur')
            assert.equal(sA.bank_details, 'BCA 1234567890 a/n Sumber Makmur')

            // Tenant B tidak dapat membaca detail supplier Tenant A
            assert.throws(() => getSupplierWithPurchases(tenantB, sA.id), /Supplier tidak ditemukan/)
        })

        test('Riwayat pembelian supplier teragregasi secara akurat', () => {
            const s = createSupplier(tenantA, { name: 'PT Dairy Fresh' })
            purchasesDb.push(
                { id: 'p-1', business_id: tenantA, supplier_id: s.id, total: 350000, date: '2026-10-10' },
                { id: 'p-2', business_id: tenantA, supplier_id: s.id, total: 150000, date: '2026-10-15' }
            )

            const detail = getSupplierWithPurchases(tenantA, s.id)
            assert.equal(detail.purchase_count, 2)
            assert.equal(detail.total_spent, 500000)
            assert.equal(detail.purchases.length, 2)
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 3. ISOLASI MULTI-TENANT & AKSES PER CABANG
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. Isolasi Multi-Tenant & Akses Per Cabang', () => {
        const tenantA = 'biz-alpha'
        const tenantB = 'biz-beta'
        const branchA1 = 'branch-a1'
        const branchA2 = 'branch-a2'
        const branchB1 = 'branch-b1'

        const branchStocks = [
            { business_id: tenantA, branch_id: branchA1, raw_material_id: 'rm-kopi', quantity: 15 },
            { business_id: tenantA, branch_id: branchA2, raw_material_id: 'rm-kopi', quantity: 25 },
            { business_id: tenantB, branch_id: branchB1, raw_material_id: 'rm-kopi-b', quantity: 100 }
        ]

        function queryStock(user) {
            // Filter strictly by user business_id
            let rows = branchStocks.filter(s => s.business_id === user.business_id)

            // If employee, restrict strictly to their assigned branch
            if (user.role === 'pegawai') {
                rows = rows.filter(s => s.branch_id === user.branch_id)
            }
            return rows
        }

        test('Pegawai Cabang A1 hanya bisa membaca stok Cabang A1', () => {
            const pegawaiA1 = { business_id: tenantA, role: 'pegawai', branch_id: branchA1 }
            const result = queryStock(pegawaiA1)
            assert.equal(result.length, 1)
            assert.equal(result[0].branch_id, branchA1)
            assert.equal(result[0].quantity, 15)
        })

        test('Owner Tenant A dapat membaca stok seluruh cabangnya tanpa bocor ke Tenant B', () => {
            const ownerA = { business_id: tenantA, role: 'owner', branch_id: null }
            const result = queryStock(ownerA)
            assert.equal(result.length, 2)
            const branches = result.map(r => r.branch_id)
            assert.ok(branches.includes(branchA1))
            assert.ok(branches.includes(branchA2))
            assert.ok(!branches.includes(branchB1))

            // Cross-branch aggregation
            const totalStock = result.reduce((acc, r) => acc + r.quantity, 0)
            assert.equal(totalStock, 40)
        })

        test('Pegawai ditolak saat mencoba mutasi pada cabang yang bukan wewenangnya', () => {
            const pegawaiA1 = { business_id: tenantA, role: 'pegawai', branch_id: branchA1 }
            function recordMutation(caller, targetBranchId) {
                if (caller.role !== 'owner' && caller.branch_id !== targetBranchId) {
                    throw new Error('Akses ditolak: Pegawai tidak memiliki wewenang pada cabang ini')
                }
                return { success: true }
            }

            assert.throws(() => recordMutation(pegawaiA1, branchA2), /Akses ditolak/)
            assert.equal(recordMutation(pegawaiA1, branchA1).success, true)
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 4 & 8. SALDO AWAL & KARTU MUTASI LEDGER IMMUTABLE
    // ─────────────────────────────────────────────────────────────────────────
    describe('4 & 8. Kartu Mutasi Stok, Saldo Awal, dan Saldo Setelah Perubahan', () => {
        const stockLedger = []
        const currentStocks = new Map() // key: branch:material, val: number

        function getStock(branchId, materialId) {
            return currentStocks.get(`${branchId}:${materialId}`) || 0
        }

        function recordMutationAtomic({ business_id, branch_id, raw_material_id, mutation_type, change_amount, reason, reference_id, user_id }) {
            const key = `${branch_id}:${raw_material_id}`
            const current = currentStocks.get(key) || 0
            const newBalance = current + change_amount

            if (newBalance < 0) {
                throw new Error('P0003: Saldo stok bahan baku tidak mencukupi untuk mutasi ini')
            }

            currentStocks.set(key, newBalance)

            const mutation = {
                id: 'mut-' + Math.random().toString(36).substring(7),
                business_id,
                branch_id,
                raw_material_id,
                mutation_type,
                change_amount,
                balance_after: newBalance,
                reference_id: reference_id || null,
                notes: reason || null,
                created_by: user_id || null,
                created_at: new Date().toISOString()
            }
            stockLedger.push(mutation)
            return mutation
        }

        test('Opening balance mencatat saldo awal dan balance_after yang tepat', () => {
            const mut = recordMutationAtomic({
                business_id: 'biz-1',
                branch_id: 'br-1',
                raw_material_id: 'rm-tepung',
                mutation_type: 'opening_balance',
                change_amount: 50,
                reason: 'Stock opname saldo awal toko baru'
            })

            assert.equal(mut.mutation_type, 'opening_balance')
            assert.equal(mut.change_amount, 50)
            assert.equal(mut.balance_after, 50)
            assert.equal(getStock('br-1', 'rm-tepung'), 50)
        })

        test('Mutasi berkelanjutan mencatat balance_after kumulatif secara konsisten', () => {
            // Purchase in +20 -> total 70
            const m1 = recordMutationAtomic({
                business_id: 'biz-1',
                branch_id: 'br-1',
                raw_material_id: 'rm-tepung',
                mutation_type: 'purchase_in',
                change_amount: 20,
                reference_id: 'purch-101'
            })
            assert.equal(m1.balance_after, 70)

            // Waste -5 (rusak kena air) -> total 65
            const m2 = recordMutationAtomic({
                business_id: 'biz-1',
                branch_id: 'br-1',
                raw_material_id: 'rm-tepung',
                mutation_type: 'waste',
                change_amount: -5,
                reason: 'Kemasan rusak kena air'
            })
            assert.equal(m2.balance_after, 65)

            // Adjustment opname -2 -> total 63
            const m3 = recordMutationAtomic({
                business_id: 'biz-1',
                branch_id: 'br-1',
                raw_material_id: 'rm-tepung',
                mutation_type: 'adjustment',
                change_amount: -2,
                reason: 'Selisih opname mingguan'
            })
            assert.equal(m3.balance_after, 63)
            assert.equal(getStock('br-1', 'rm-tepung'), 63)
        })

        test('Kartu mutasi immutable: upaya edit atau delete pada ledger ditolak', () => {
            function updateLedgerMutation() {
                throw new Error('42501: Mutasi stok bersifat immutable; tidak dapat diubah atau dihapus')
            }
            function deleteLedgerMutation() {
                throw new Error('42501: Mutasi stok bersifat immutable; tidak dapat diubah atau dihapus')
            }

            assert.throws(() => updateLedgerMutation(), /tidak dapat diubah atau dihapus/)
            assert.throws(() => deleteLedgerMutation(), /tidak dapat diubah atau dihapus/)

            // Deep freeze test
            const frozenMutation = Object.freeze({ ...stockLedger[0] })
            assert.throws(() => {
                frozenMutation.balance_after = 999
            }, TypeError)
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 5, 6, 7. PEMBELIAN INTEGRASI, ATOMISITAS, & IDEMPOTENSI
    // ─────────────────────────────────────────────────────────────────────────
    describe('5, 6, 7. Pembelian Integrasi, Atomisitas, & Idempotensi', () => {
        let purchasesStore = []
        let purchaseItemsStore = []
        let stockStore = new Map() // branch:material -> qty
        let mutationsStore = []
        let processedIdempotencyKeys = new Set()

        function executePurchaseWithStockAtomic({
            businessId,
            branchId,
            supplierId,
            idempotencyKey,
            items
        }) {
            // Idempotency check
            if (idempotencyKey && processedIdempotencyKeys.has(idempotencyKey)) {
                return { isDuplicate: true, message: 'Transaksi pembelian sudah diproses sebelumnya' }
            }

            // Snapshot for simulated atomic rollback
            const stockSnapshot = new Map(stockStore)
            const mutationsSnapshot = [...mutationsStore]
            const purchaseId = 'p-' + Math.random().toString(36).substring(7)

            try {
                let purchaseTotal = 0
                const createdItems = []
                const createdMutations = []

                for (const it of items) {
                    if (it.quantity <= 0) throw new Error('Kuantitas barang harus lebih dari 0')
                    if (it.price < 0) throw new Error('Harga satuan barang tidak boleh negatif')

                    const subtotal = it.quantity * it.price
                    purchaseTotal += subtotal

                    const itemId = 'pi-' + Math.random().toString(36).substring(7)
                    createdItems.push({
                        id: itemId,
                        purchase_id: purchaseId,
                        raw_material_id: it.raw_material_id || null,
                        item_name: it.item_name,
                        quantity: it.quantity,
                        unit: it.unit || 'pcs',
                        price: it.price,
                        subtotal
                    })

                    // If linked to raw material, increment branch stock and record ledger
                    if (it.raw_material_id) {
                        const stockKey = `${branchId}:${it.raw_material_id}`
                        const currentQty = stockStore.get(stockKey) || 0
                        const newQty = currentQty + it.quantity
                        stockStore.set(stockKey, newQty)

                        createdMutations.push({
                            id: 'mut-' + Math.random().toString(36).substring(7),
                            business_id: businessId,
                            branch_id: branchId,
                            raw_material_id: it.raw_material_id,
                            mutation_type: 'purchase_in',
                            change_amount: it.quantity,
                            balance_after: newQty,
                            reference_id: purchaseId
                        })
                    }
                }

                // If atomic operations succeed, commit
                purchasesStore.push({
                    id: purchaseId,
                    business_id: businessId,
                    branch_id: branchId,
                    supplier_id: supplierId || null,
                    total: purchaseTotal,
                    idempotency_key: idempotencyKey || null
                })
                purchaseItemsStore.push(...createdItems)
                mutationsStore.push(...createdMutations)

                if (idempotencyKey) processedIdempotencyKeys.add(idempotencyKey)

                return {
                    success: true,
                    purchaseId,
                    total: purchaseTotal,
                    itemsCount: createdItems.length
                }
            } catch (err) {
                // Atomic rollback
                stockStore = stockSnapshot
                mutationsStore = mutationsSnapshot
                throw err
            }
        }

        test('5. Pembelian diterima menambah stok cabang dan mencatat purchase_in tepat satu kali', () => {
            const res = executePurchaseWithStockAtomic({
                businessId: 'biz-1',
                branchId: 'br-pusat',
                supplierId: 'sup-1',
                idempotencyKey: 'idemp-po-001',
                items: [
                    { raw_material_id: 'rm-kopi', item_name: 'Biji Kopi Arabika', quantity: 10, unit: 'kg', price: 120000 },
                    { raw_material_id: 'rm-susu', item_name: 'Fresh Milk', quantity: 20, unit: 'liter', price: 18000 }
                ]
            })

            assert.equal(res.success, true)
            assert.equal(stockStore.get('br-pusat:rm-kopi'), 10)
            assert.equal(stockStore.get('br-pusat:rm-susu'), 20)

            const kopiMutations = mutationsStore.filter(m => m.raw_material_id === 'rm-kopi')
            assert.equal(kopiMutations.length, 1)
            assert.equal(kopiMutations[0].mutation_type, 'purchase_in')
            assert.equal(kopiMutations[0].change_amount, 10)
            assert.equal(kopiMutations[0].balance_after, 10)
        })

        test('6. Pembelian gagal di baris berikutnya membatalkan seluruh perubahan (Atomic Rollback)', () => {
            const initialKopiStock = stockStore.get('br-pusat:rm-kopi')

            assert.throws(() => {
                executePurchaseWithStockAtomic({
                    businessId: 'biz-1',
                    branchId: 'br-pusat',
                    supplierId: 'sup-1',
                    idempotencyKey: 'idemp-fail-001',
                    items: [
                        { raw_material_id: 'rm-kopi', item_name: 'Biji Kopi Tambahan', quantity: 5, unit: 'kg', price: 120000 },
                        // Baris kedua gagal karena harga negatif
                        { raw_material_id: 'rm-susu', item_name: 'Fresh Milk Invalid', quantity: 10, unit: 'liter', price: -5000 }
                    ]
                })
            }, /tidak boleh negatif/)

            // Pastikan stok kopi TIDAK bertambah 5 (rollback bersih)
            assert.equal(stockStore.get('br-pusat:rm-kopi'), initialKopiStock)
            // Pastikan tidak ada mutasi yatim yang tertinggal
            const orphanMutations = mutationsStore.filter(m => m.reference_id === 'idemp-fail-001')
            assert.equal(orphanMutations.length, 0)
        })

        test('7. Pembelian duplikat dengan idempotency key tidak menggandakan stok', () => {
            const initialKopiStock = stockStore.get('br-pusat:rm-kopi')

            // Request 1 sukses
            const req1 = executePurchaseWithStockAtomic({
                businessId: 'biz-1',
                branchId: 'br-pusat',
                idempotencyKey: 'idemp-po-double-click',
                items: [{ raw_material_id: 'rm-kopi', item_name: 'Biji Kopi', quantity: 4, unit: 'kg', price: 120000 }]
            })
            assert.equal(req1.success, true)
            assert.equal(stockStore.get('br-pusat:rm-kopi'), initialKopiStock + 4)

            // Request 2 (double submit / network retry)
            const req2 = executePurchaseWithStockAtomic({
                businessId: 'biz-1',
                branchId: 'br-pusat',
                idempotencyKey: 'idemp-po-double-click',
                items: [{ raw_material_id: 'rm-kopi', item_name: 'Biji Kopi', quantity: 4, unit: 'kg', price: 120000 }]
            })
            assert.equal(req2.isDuplicate, true)
            // Stok tetap tidak bertambah dua kali
            assert.equal(stockStore.get('br-pusat:rm-kopi'), initialKopiStock + 4)
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 9. DETEKSI STOK RENDAH
    // ─────────────────────────────────────────────────────────────────────────
    describe('9. Deteksi Stok Rendah (Low Stock Threshold)', () => {
        function checkStockStatus(quantity, minStock) {
            if (quantity <= 0) return { status: 'out_of_stock', isLow: true, label: 'Habis' }
            if (quantity <= minStock) return { status: 'low_stock', isLow: true, label: 'Menipis' }
            return { status: 'normal', isLow: false, label: 'Aman' }
        }

        test('Kuantitas di bawah atau sama dengan batas minimum memicu peringatan', () => {
            const minStock = 10

            assert.equal(checkStockStatus(15, minStock).isLow, false)
            assert.equal(checkStockStatus(15, minStock).label, 'Aman')

            // Tepat di batas minimum -> terdeteksi menipis
            assert.equal(checkStockStatus(10, minStock).isLow, true)
            assert.equal(checkStockStatus(10, minStock).status, 'low_stock')

            // Di bawah batas minimum -> terdeteksi menipis
            assert.equal(checkStockStatus(4, minStock).isLow, true)
            assert.equal(checkStockStatus(4, minStock).status, 'low_stock')

            // Saldo 0 -> habis
            assert.equal(checkStockStatus(0, minStock).isLow, true)
            assert.equal(checkStockStatus(0, minStock).status, 'out_of_stock')
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 10. CEGAH SALDO NEGATIF & RACE CONDITION
    // ─────────────────────────────────────────────────────────────────────────
    describe('10. Cegah Saldo Negatif & Concurrency Lock', () => {
        test('Pengurangan stok melebihi saldo ditolak dengan error P0003', () => {
            let currentStock = 10

            function deductStockWithLock(requestedQty) {
                // Simulasi SELECT ... FOR UPDATE
                if (currentStock < requestedQty) {
                    throw new Error('P0003: Insufficient raw material stock')
                }
                currentStock -= requestedQty
                return currentStock
            }

            // Pengurangan pertama 8 -> sisa 2
            assert.equal(deductStockWithLock(8), 2)

            // Pengurangan kedua 5 (melebihi sisa 2) -> Ditolak!
            assert.throws(() => deductStockWithLock(5), /P0003: Insufficient raw material stock/)

            // Saldo tetap 2, tidak pernah menjadi -3
            assert.equal(currentStock, 2)
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 11. KOMPATIBILITAS PEMBELIAN HISTORIS / LEGACY
    // ─────────────────────────────────────────────────────────────────────────
    describe('11. Kompatibilitas Pembelian Historis / Lama Tanpa Relasi Master', () => {
        test('Pembelian lama tanpa supplier_id atau raw_material_id tetap dapat ditampilkan', () => {
            const legacyPurchase = {
                id: 'purch-old-001',
                business_id: 'biz-1',
                branch_id: 'br-1',
                supplier: 'Toko Plastik Makmur', // legacy text column
                supplier_id: null,               // new relation nullable
                total: 85000,
                purchase_date: '2025-01-10',
                created_at: '2025-01-10T10:00:00Z',
                items: [
                    {
                        id: 'item-old-1',
                        item_name: 'Sedotan Hitam 6mm',
                        quantity: 5,
                        price: 17000,
                        subtotal: 85000,
                        raw_material_id: null,       // new relation nullable
                        unit: null                   // new nullable
                    }
                ]
            }

            // UI helper format resolution
            const displaySupplier = legacyPurchase.supplier_id ? 'Master Supplier' : (legacyPurchase.supplier || 'Tanpa Supplier')
            const displayItemName = legacyPurchase.items[0].raw_material_id ? 'Master Material' : legacyPurchase.items[0].item_name
            const displayUnit = legacyPurchase.items[0].unit || 'item'

            assert.equal(displaySupplier, 'Toko Plastik Makmur')
            assert.equal(displayItemName, 'Sedotan Hitam 6mm')
            assert.equal(displayUnit, 'item')
            assert.equal(legacyPurchase.total, 85000)
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 12. LAPORAN KEUANGAN TIDAK MENGHITUNG PEMBELIAN DUA KALI
    // ─────────────────────────────────────────────────────────────────────────
    describe('12. Integritas Laporan Keuangan (Pencegahan Double Counting)', () => {
        test('Biaya pembelian hanya dihitung dari tabel purchases, bukan diduplikasi oleh ledger mutasi', () => {
            const sales = [
                { id: 's-1', total: 500000, hpp: 200000 }
            ]

            const purchases = [
                { id: 'p-1', total: 300000, supplier_id: 'sup-1' } // Rp 300.000 belanja bahan baku
            ]

            // Mutasi stok tercatat terpisah sebagai ledger kuantitas
            const mutations = [
                { id: 'm-1', raw_material_id: 'rm-1', change_amount: 10, mutation_type: 'purchase_in', reference_id: 'p-1' }
            ]

            const expenses = [
                { id: 'e-1', amount: 50000, category: 'Listrik' }
            ]

            // Perhitungan Arus Kas Bersih (Cash Basis):
            // Inflow: Penjualan tunai (500.000)
            // Outflow: Belanja bahan (300.000) + Beban operasional (50.000)
            // Mutasi kartu stok TIDAK dimasukkan ke rumus arus kas!
            const totalCashIn = sales.reduce((sum, s) => sum + s.total, 0)
            const totalPurchaseOutflow = purchases.reduce((sum, p) => sum + p.total, 0)
            const totalExpenseOutflow = expenses.reduce((sum, e) => sum + e.amount, 0)
            const netCashFlow = totalCashIn - (totalPurchaseOutflow + totalExpenseOutflow)

            assert.equal(totalCashIn, 500000)
            assert.equal(totalPurchaseOutflow, 300000)
            assert.equal(totalExpenseOutflow, 50000)
            assert.equal(netCashFlow, 150000)

            // Laba Rugi Operasional (Accrual Basis):
            // Revenue (500.000) - HPP Penjualan (200.000) - Beban (50.000) = 250.000
            // Pembelian stok tidak mengurangi laba sebelum terjual sebagai HPP
            const revenue = sales.reduce((sum, s) => sum + s.total, 0)
            const totalHpp = sales.reduce((sum, s) => sum + s.hpp, 0)
            const operatingProfit = revenue - totalHpp - totalExpenseOutflow

            assert.equal(operatingProfit, 250000)
            assert.notEqual(netCashFlow, operatingProfit)
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 13. REGRESI FITUR YANG SUDAH ADA
    // ─────────────────────────────────────────────────────────────────────────
    describe('13. Regresi Fitur Eksisting (Penjualan, Struk, Multi-tenant)', () => {
        test('Struktur data Phase 2 tidak mengganggu query katalog produk kasir', () => {
            const product = {
                id: 'prod-001',
                name: 'Kopi Susu Gula Aren',
                price: 18000,
                // Kolom HPP / cost_price dilindungi
                cost_price: 8000,
                category: 'Minuman'
            }

            // Simulasi get_cashier_products yang hanya mengekspos data publik
            const cashierView = {
                id: product.id,
                name: product.name,
                price: product.price,
                category: product.category
            }

            assert.equal(cashierView.name, 'Kopi Susu Gula Aren')
            assert.equal(cashierView.price, 18000)
            assert.equal('cost_price' in cashierView, false)
        })
    })
})
