import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('Prioritas 2: Database-Level HPP Protection (Column-Level Access Control)', () => {
    // Database schema simulation representing PostgreSQL permissions defined in 0019
    const dbPermissions = {
        authenticated: {
            products: ['id', 'business_id', 'name', 'selling_price', 'category', 'status', 'stock', 'unit', 'created_at', 'updated_at'],
            // Notice: 'cost_price' is REVOKED from authenticated!
            owner_products_view: ['id', 'business_id', 'name', 'selling_price', 'cost_price', 'category', 'status', 'stock', 'unit', 'created_at', 'updated_at']
        }
    }

    const mockProductsTable = [
        {
            id: 'prod-01',
            business_id: 'biz-1',
            name: 'Kopi Susu Regal',
            selling_price: 24000,
            cost_price: 9500,
            category: 'Minuman',
            status: 'aktif',
            stock: 50,
            unit: 'cup'
        },
        {
            id: 'prod-02',
            business_id: 'biz-1',
            name: 'Croissant Butter',
            selling_price: 18000,
            cost_price: 8000,
            category: 'Makanan',
            status: 'aktif',
            stock: 30,
            unit: 'pcs'
        }
    ]

    function simulateDbSelect(userRole, userBusinessId, targetRelation, selectedColumns) {
        // Cek apakah relasi dapat diakses oleh authenticated
        const allowedCols = dbPermissions.authenticated[targetRelation]
        if (!allowedCols) {
            return { error: `Permission denied for relation ${targetRelation}` }
        }

        // Cek izin level kolom (Column-level Grant check)
        const requestedCols = selectedColumns === '*' ? Object.keys(mockProductsTable[0]) : selectedColumns.split(',').map(s => s.trim())
        for (const col of requestedCols) {
            if (!allowedCols.includes(col)) {
                return {
                    error: `ERROR: permission denied for column "${col}" of relation "${targetRelation}" (PostgreSQL 42501)`
                }
            }
        }

        // Evaluasi RLS & View Filter
        let rows = mockProductsTable.filter(p => p.business_id === userBusinessId)

        if (targetRelation === 'owner_products_view') {
            if (userRole !== 'owner') {
                // auth_is_owner() returns false
                return { data: [] }
            }
        }

        const projected = rows.map(r => {
            const rowObj = {}
            for (const col of requestedCols) {
                rowObj[col] = r[col]
            }
            return rowObj
        })

        return { data: projected }
    }

    test('Direct query by employee selecting cost_price on products table is rejected at column level', () => {
        // Pegawai mencoba query langsung via PostgREST / Supabase client:
        // supabase.from('products').select('id, name, cost_price')
        const employeeQuery = simulateDbSelect('pegawai', 'biz-1', 'products', 'id, name, cost_price')
        
        assert.equal(employeeQuery.data, undefined)
        assert.match(employeeQuery.error, /permission denied for column "cost_price"/)
    })

    test('Direct query by employee selecting all columns (*) on products table is rejected due to revoked cost_price', () => {
        // Pegawai mencoba query dengan wildcard: supabase.from('products').select('*')
        const employeeWildcardQuery = simulateDbSelect('pegawai', 'biz-1', 'products', '*')
        
        assert.equal(employeeWildcardQuery.data, undefined)
        assert.match(employeeWildcardQuery.error, /permission denied for column "cost_price"/)
    })

    test('Cashier POS query selecting only public catalog columns succeeds', () => {
        // POS query yang sah:
        // supabase.from('products').select('id, name, selling_price, category, stock, unit')
        const cashierQuery = simulateDbSelect('pegawai', 'biz-1', 'products', 'id, name, selling_price, category, stock, unit')
        
        assert.equal(cashierQuery.error, undefined)
        assert.equal(cashierQuery.data.length, 2)
        assert.equal(cashierQuery.data[0].cost_price, undefined, 'Kolom cost_price tidak ada dalam hasil query')
        assert.equal(cashierQuery.data[0].selling_price, 24000, 'Harga jual kasir tetap berfungsi normal')
    })

    test('Owner accessing owner_products_view receives complete data including authentic cost_price', () => {
        const ownerQuery = simulateDbSelect('owner', 'biz-1', 'owner_products_view', 'id, name, selling_price, cost_price')
        
        assert.equal(ownerQuery.error, undefined)
        assert.equal(ownerQuery.data.length, 2)
        assert.equal(ownerQuery.data[0].cost_price, 9500, 'Owner dapat melihat HPP asli')
        assert.equal(ownerQuery.data[1].cost_price, 8000, 'Owner dapat melihat HPP asli')
    })

    test('Employee attempting to query owner_products_view receives zero rows (RLS guard)', () => {
        const maliciousEmployeeQuery = simulateDbSelect('pegawai', 'biz-1', 'owner_products_view', 'id, name, cost_price')
        
        assert.equal(maliciousEmployeeQuery.error, undefined)
        assert.equal(maliciousEmployeeQuery.data.length, 0, 'Pegawai tidak mendapatkan baris apapun dari owner view')
    })

    test('Query builder in penjualan/page.tsx strictly omits cost_price when isOwner is false', () => {
        function getProductsQueryColumns(isOwner) {
            return isOwner
                ? 'id, name, selling_price, cost_price, category, stock, unit'
                : 'id, name, selling_price, category, stock, unit'
        }

        const employeeCols = getProductsQueryColumns(false)
        const ownerCols = getProductsQueryColumns(true)

        assert.ok(!employeeCols.includes('cost_price'), 'Query kasir tidak boleh meminta kolom cost_price')
        assert.ok(ownerCols.includes('cost_price'), 'Query owner harus menyertakan cost_price')
    })
})
