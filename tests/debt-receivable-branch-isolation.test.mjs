import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('Debt & Receivable Branch Isolation Logic Verification', () => {
    // Mock sample dataset matching Supabase query structure
    const sampleDebts = [
        {
            id: 'debt-1',
            branch_id: 'branch-a',
            title: 'Utang Supplier A',
            total_amount: 300000,
            paid_amount: 0,
            purchases: { branch_id: 'branch-a' },
        },
        {
            id: 'debt-2',
            branch_id: null,
            title: 'Utang Bahan Baku Lama (via purchases)',
            total_amount: 150000,
            paid_amount: 0,
            purchases: { branch_id: 'branch-a' },
        },
        {
            id: 'debt-3',
            branch_id: null,
            title: 'Utang Kantor Pusat (Unassigned)',
            total_amount: 500000,
            paid_amount: 0,
            purchases: null,
        },
        {
            id: 'debt-4',
            branch_id: 'branch-c',
            title: 'Utang Cabang C',
            total_amount: 200000,
            paid_amount: 50000,
            purchases: { branch_id: 'branch-c' },
        },
    ]

    const sampleReceivables = [
        {
            id: 'rec-1',
            branch_id: 'branch-a',
            debtor_name: 'Pelanggan Cabang A',
            total_amount: 100000,
            paid_amount: 0,
            sales: { branch_id: 'branch-a' },
        },
        {
            id: 'rec-2',
            branch_id: null,
            debtor_name: 'Piutang Kasir Lama',
            total_amount: 75000,
            paid_amount: 0,
            sales: { branch_id: 'branch-a' },
        },
        {
            id: 'rec-3',
            branch_id: null,
            debtor_name: 'Piutang Non-Cabang / Unassigned',
            total_amount: 250000,
            paid_amount: 0,
            sales: null,
        },
        {
            id: 'rec-4',
            branch_id: 'branch-c',
            debtor_name: 'Pelanggan Cabang C',
            total_amount: 120000,
            paid_amount: 20000,
            sales: { branch_id: 'branch-c' },
        },
    ]

    // Helper functions matching production filtering logic in neraca, utang-piutang, keuangan & dashboard
    function filterDebts(debts, selectedBranchId) {
        if (selectedBranchId === 'all') return debts
        return debts.filter((d) => {
            const bId = d.branch_id || d.purchases?.branch_id
            return bId === selectedBranchId
        })
    }

    function calculateTradePayables(debts, selectedBranchId) {
        const filtered = filterDebts(debts, selectedBranchId)
        return filtered.reduce((acc, d) => acc + Math.max(0, Number(d.total_amount || 0) - Number(d.paid_amount || 0)), 0)
    }

    function filterReceivables(recs, selectedBranchId) {
        if (selectedBranchId === 'all') return recs
        return recs.filter((r) => {
            const bId = r.branch_id || r.sales?.branch_id
            return bId === selectedBranchId
        })
    }

    function calculateTradeReceivables(recs, selectedBranchId) {
        const filtered = filterReceivables(recs, selectedBranchId)
        return filtered.reduce((acc, r) => acc + Math.max(0, Number(r.total_amount || 0) - Number(r.paid_amount || 0)), 0)
    }

    it('Branch B (Mentai Cilodong) with 0 debts MUST show Utang = Rp 0, not leaking Branch A or unassigned debts', () => {
        const payablesBranchB = calculateTradePayables(sampleDebts, 'branch-b')
        assert.equal(payablesBranchB, 0, 'Branch B with no debts must yield exactly 0')

        const filteredDebtsB = filterDebts(sampleDebts, 'branch-b')
        assert.equal(filteredDebtsB.length, 0, 'Branch B debts list must be empty')
    })

    it('Branch A debts query must correctly aggregate Branch A debts (including fallback via purchases.branch_id)', () => {
        const payablesBranchA = calculateTradePayables(sampleDebts, 'branch-a')
        // debt-1: 300,000 + debt-2: 150,000 = 450,000
        assert.equal(payablesBranchA, 450000, 'Branch A must aggregate its direct and purchase-linked debts')

        const filteredDebtsA = filterDebts(sampleDebts, 'branch-a')
        assert.equal(filteredDebtsA.length, 2)
    })

    it('Konsolidasi Semua Cabang (all) must include all debts including unassigned/legacy ones', () => {
        const payablesAll = calculateTradePayables(sampleDebts, 'all')
        // 300,000 + 150,000 + 500,000 + (200,000 - 50,000 = 150,000) = 1,100,000
        assert.equal(payablesAll, 1100000, 'Konsolidasi must include all debts')

        const filteredAll = filterDebts(sampleDebts, 'all')
        assert.equal(filteredAll.length, 4)
    })

    it('Branch B with 0 receivables MUST show Piutang = Rp 0, not leaking Branch A or unassigned receivables', () => {
        const recsBranchB = calculateTradeReceivables(sampleReceivables, 'branch-b')
        assert.equal(recsBranchB, 0, 'Branch B with no receivables must yield exactly 0')

        const filteredRecsB = filterReceivables(sampleReceivables, 'branch-b')
        assert.equal(filteredRecsB.length, 0, 'Branch B receivables list must be empty')
    })

    it('Branch A receivables query must correctly aggregate Branch A receivables (including fallback via sales.branch_id)', () => {
        const recsBranchA = calculateTradeReceivables(sampleReceivables, 'branch-a')
        // rec-1: 100,000 + rec-2: 75,000 = 175,000
        assert.equal(recsBranchA, 175000)

        const filteredRecsA = filterReceivables(sampleReceivables, 'branch-a')
        assert.equal(filteredRecsA.length, 2)
    })

    it('Konsolidasi Semua Cabang (all) must include all receivables', () => {
        const recsAll = calculateTradeReceivables(sampleReceivables, 'all')
        // 100,000 + 75,000 + 250,000 + (120,000 - 20,000 = 100,000) = 525,000
        assert.equal(recsAll, 525000)

        const filteredAll = filterReceivables(sampleReceivables, 'all')
        assert.equal(filteredAll.length, 4)
    })
})

