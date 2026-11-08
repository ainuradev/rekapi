'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { checkActiveSubscription } from '@/lib/subscription-access'

const EXPENSE_CATEGORIES = [
    'gaji', 'listrik', 'air', 'sewa', 'gas',
    'transportasi', 'marketing', 'packaging', 'peralatan', 'lainnya',
] as const

type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]

async function getAuthorizedOwner() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized', supabase: null, user: null, profile: null }

    const { data: profile } = await supabase
        .from('profiles')
        .select('id, business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil tidak ditemukan.', supabase: null, user: null, profile: null }
    if (profile.role !== 'owner' || !profile.business_id) {
        return { error: 'Hanya Owner yang berhak mengelola pembukuan keuangan.', supabase: null, user: null, profile: null }
    }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Langganan Anda telah berakhir.', supabase: null, user: null, profile: null }
    }

    return { error: null, supabase, user, profile }
}

// ─── BEBAN & PENGELUARAN ──────────────────────────────────────────────────────

export async function addExpense(payload: {
    category: ExpenseCategory
    amount: number
    description?: string
    expense_date: string
    branch_id?: string
    account_id?: string
}) {
    const { error: authErr, supabase, profile } = await getAuthorizedOwner()
    if (authErr || !supabase || !profile) return { error: authErr || 'Unauthorized' }

    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(payload.category)) {
        return { error: 'Kategori pengeluaran tidak valid.' }
    }

    const amount = Number(payload.amount)
    if (!amount || amount <= 0) return { error: 'Nominal harus lebih dari 0.' }
    if (!payload.expense_date) return { error: 'Tanggal wajib diisi.' }

    // Validasi akun kas/bank jika dipilih
    if (payload.account_id) {
        const { data: accCheck } = await supabase
            .from('financial_accounts')
            .select('id, name, current_balance')
            .eq('id', payload.account_id)
            .eq('business_id', profile.business_id)
            .single()

        if (!accCheck) {
            return { error: 'Akun kas / rekening yang dipilih tidak valid.' }
        }
    }

    // Jika branch_id tidak disediakan (atau 'all'), targetkan ke Cabang Utama (cabang tertua)
    let targetBranchId = payload.branch_id
    if (!targetBranchId || targetBranchId === 'all') {
        const { data: primaryB } = await supabase
            .from('branches')
            .select('id')
            .eq('business_id', profile.business_id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
        targetBranchId = primaryB?.id || undefined
    }

    const { data: exp, error } = await supabase.from('expenses').insert({
        business_id: profile.business_id,
        branch_id: targetBranchId || null,
        category: payload.category,
        amount,
        expense_date: payload.expense_date,
        description: payload.description?.trim() || null,
    }).select('id').single()

    if (error) return { error: error.message }

    // Jika dipilih akun kas/bank, kurangi saldo akun secara otomatis
    if (payload.account_id) {
        const { data: acc } = await supabase
            .from('financial_accounts')
            .select('current_balance, name')
            .eq('id', payload.account_id)
            .eq('business_id', profile.business_id)
            .single()

        if (acc) {
            const newBal = Number(acc.current_balance || 0) - amount
            await supabase.from('financial_accounts').update({
                current_balance: newBal,
                updated_at: new Date().toISOString(),
            }).eq('id', payload.account_id)

            await supabase.from('financial_transactions').insert({
                business_id: profile.business_id,
                account_id: payload.account_id,
                type: 'expense',
                category: 'expense',
                amount,
                reference_id: exp?.id || null,
                description: `Beban ${payload.category}: ${payload.description?.trim() || 'Biaya operasional'}`,
                transaction_date: payload.expense_date,
            })
        }
    }

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/beban')
    revalidatePath('/dashboard/keuangan/kas-rekening')
    revalidatePath('/dashboard/keuangan/neraca')
    revalidatePath('/dashboard/keuangan/arus-kas')
    revalidatePath('/dashboard/keuangan/laba-rugi')
    return { success: true }
}

export async function deleteExpense(expenseId: string) {
    const { error: authErr, supabase, profile } = await getAuthorizedOwner()
    if (authErr || !supabase || !profile) return { error: authErr || 'Unauthorized' }

    // 1. Periksa apakah pengeluaran ini memiliki mutasi akun kas/bank yang terhubung
    const { data: txs } = await supabase
        .from('financial_transactions')
        .select('id, account_id, amount')
        .eq('business_id', profile.business_id)
        .eq('reference_id', expenseId)
        .eq('category', 'expense')

    if (txs && txs.length > 0) {
        for (const tx of txs) {
            // Pulihkan saldo akun kas/bank yang sebelumnya terpotong
            const { data: acc } = await supabase
                .from('financial_accounts')
                .select('current_balance')
                .eq('id', tx.account_id)
                .eq('business_id', profile.business_id)
                .single()

            if (acc) {
                await supabase
                    .from('financial_accounts')
                    .update({
                        current_balance: Number(acc.current_balance || 0) + Number(tx.amount || 0),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', tx.account_id)
            }

            // Hapus rekaman mutasi kas terkait
            await supabase
                .from('financial_transactions')
                .delete()
                .eq('id', tx.id)
                .eq('business_id', profile.business_id)
        }
    }

    // 2. Hapus catatan pengeluaran
    const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId)
        .eq('business_id', profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/beban')
    revalidatePath('/dashboard/keuangan/kas-rekening')
    revalidatePath('/dashboard/keuangan/neraca')
    revalidatePath('/dashboard/keuangan/arus-kas')
    revalidatePath('/dashboard/keuangan/laba-rugi')
    return { success: true }
}

// ─── KAS & REKENING BANK (FINANCIAL ACCOUNTS) ──────────────────────────────────

export async function createFinancialAccount(payload: {
    name: string
    type: 'cash' | 'bank' | 'e_wallet'
    bank_name?: string
    account_number?: string
    initial_balance?: number
    is_default_cash?: boolean
    is_default_bank?: boolean
}) {
    const { error: authErr, supabase, profile } = await getAuthorizedOwner()
    if (authErr || !supabase || !profile) return { error: authErr || 'Unauthorized' }

    if (!payload.name?.trim()) return { error: 'Nama kas / rekening wajib diisi.' }
    const initialBal = Math.max(0, Number(payload.initial_balance || 0))

    if (payload.is_default_cash) {
        await supabase
            .from('financial_accounts')
            .update({ is_default_cash: false })
            .eq('business_id', profile.business_id)
    }

    if (payload.is_default_bank) {
        await supabase
            .from('financial_accounts')
            .update({ is_default_bank: false })
            .eq('business_id', profile.business_id)
    }

    const { data: newAcc, error } = await supabase
        .from('financial_accounts')
        .insert({
            business_id: profile.business_id,
            name: payload.name.trim(),
            type: payload.type,
            bank_name: payload.bank_name?.trim() || null,
            account_number: payload.account_number?.trim() || null,
            initial_balance: initialBal,
            current_balance: initialBal,
            is_default_cash: !!payload.is_default_cash,
            is_default_bank: !!payload.is_default_bank,
            status: 'active',
        })
        .select('id')
        .single()

    if (error) return { error: error.message }

    if (initialBal > 0 && newAcc) {
        await supabase.from('financial_transactions').insert({
            business_id: profile.business_id,
            account_id: newAcc.id,
            type: 'income',
            category: 'opening_balance',
            amount: initialBal,
            description: `Saldo Awal ${payload.name.trim()}`,
            transaction_date: new Date().toISOString().split('T')[0],
        })
    }

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/kas-rekening')
    revalidatePath('/dashboard/keuangan/neraca')
    return { success: true }
}

export async function updateFinancialAccount(payload: {
    id: string
    name: string
    bank_name?: string
    account_number?: string
    is_default_cash?: boolean
    is_default_bank?: boolean
}) {
    const { error: authErr, supabase, profile } = await getAuthorizedOwner()
    if (authErr || !supabase || !profile) return { error: authErr || 'Unauthorized' }

    if (!payload.name?.trim()) return { error: 'Nama kas / rekening wajib diisi.' }

    if (payload.is_default_cash) {
        await supabase
            .from('financial_accounts')
            .update({ is_default_cash: false })
            .eq('business_id', profile.business_id)
    }

    if (payload.is_default_bank) {
        await supabase
            .from('financial_accounts')
            .update({ is_default_bank: false })
            .eq('business_id', profile.business_id)
    }

    const { error } = await supabase
        .from('financial_accounts')
        .update({
            name: payload.name.trim(),
            bank_name: payload.bank_name?.trim() || null,
            account_number: payload.account_number?.trim() || null,
            is_default_cash: !!payload.is_default_cash,
            is_default_bank: !!payload.is_default_bank,
            updated_at: new Date().toISOString(),
        })
        .eq('id', payload.id)
        .eq('business_id', profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/kas-rekening')
    return { success: true }
}

export async function deleteFinancialAccount(accountId: string) {
    const { error: authErr, supabase, profile } = await getAuthorizedOwner()
    if (authErr || !supabase || !profile) return { error: authErr || 'Unauthorized' }

    // 1. Verifikasi akun yang akan dihapus
    const { data: acc } = await supabase
        .from('financial_accounts')
        .select('id, name, is_default_cash, is_default_bank, type, current_balance')
        .eq('id', accountId)
        .eq('business_id', profile.business_id)
        .single()

    if (!acc) return { error: 'Akun kas / rekening tidak ditemukan.' }

    // 2. Pastikan bisnis memiliki minimal 1 akun tersisa
    const { count } = await supabase
        .from('financial_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', profile.business_id)

    if (count !== null && count <= 1) {
        return { error: 'Tidak dapat menghapus akun terakhir. Bisnis harus memiliki minimal 1 akun kas atau rekening aktif.' }
    }

    // 3. Jika akun yang dihapus adalah default, alihkan default ke akun sejenis yang lain (jika ada)
    if (acc.is_default_cash) {
        const { data: fallbackCash } = await supabase
            .from('financial_accounts')
            .select('id')
            .eq('business_id', profile.business_id)
            .eq('type', 'cash')
            .neq('id', accountId)
            .limit(1)
            .maybeSingle()

        if (fallbackCash) {
            await supabase
                .from('financial_accounts')
                .update({ is_default_cash: true })
                .eq('id', fallbackCash.id)
        }
    }

    if (acc.is_default_bank) {
        const { data: fallbackBank } = await supabase
            .from('financial_accounts')
            .select('id')
            .eq('business_id', profile.business_id)
            .in('type', ['bank', 'e_wallet'])
            .neq('id', accountId)
            .limit(1)
            .maybeSingle()

        if (fallbackBank) {
            await supabase
                .from('financial_accounts')
                .update({ is_default_bank: true })
                .eq('id', fallbackBank.id)
        }
    }

    // 4. Hapus akun (cascade mutasi internal atau set null pada relasi pembayaran)
    const { error } = await supabase
        .from('financial_accounts')
        .delete()
        .eq('id', accountId)
        .eq('business_id', profile.business_id)

    if (error) return { error: `Gagal menghapus akun: ${error.message}` }

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/kas-rekening')
    revalidatePath('/dashboard/keuangan/neraca')
    revalidatePath('/dashboard/keuangan/arus-kas')
    return { success: true }
}

export async function setAccountInitialBalance(accountId: string, newInitialBalance: number) {
    const { error: authErr, supabase, profile } = await getAuthorizedOwner()
    if (authErr || !supabase || !profile) return { error: authErr || 'Unauthorized' }

    const newBal = Number(newInitialBalance)
    if (isNaN(newBal) || newBal < 0) return { error: 'Saldo awal harus berupa angka non-negatif.' }

    const { data: currentAcc } = await supabase
        .from('financial_accounts')
        .select('initial_balance, current_balance')
        .eq('id', accountId)
        .eq('business_id', profile.business_id)
        .single()

    if (!currentAcc) return { error: 'Akun tidak ditemukan.' }

    const diff = newBal - Number(currentAcc.initial_balance || 0)
    const updatedCurrent = Number(currentAcc.current_balance || 0) + diff

    const { error } = await supabase
        .from('financial_accounts')
        .update({
            initial_balance: newBal,
            current_balance: updatedCurrent,
            updated_at: new Date().toISOString(),
        })
        .eq('id', accountId)
        .eq('business_id', profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/kas-rekening')
    revalidatePath('/dashboard/keuangan/neraca')
    return { success: true }
}

export async function transferBetweenAccounts(payload: {
    from_account_id: string
    to_account_id: string
    amount: number
    notes?: string
    transfer_date: string
}) {
    const { error: authErr, supabase, profile } = await getAuthorizedOwner()
    if (authErr || !supabase || !profile) return { error: authErr || 'Unauthorized' }

    if (payload.from_account_id === payload.to_account_id) {
        return { error: 'Akun asal dan akun tujuan tidak boleh sama.' }
    }

    const amt = Number(payload.amount)
    if (!amt || amt <= 0) return { error: 'Nominal transfer harus lebih dari 0.' }

    const { data: fromAcc } = await supabase
        .from('financial_accounts')
        .select('id, name, current_balance')
        .eq('id', payload.from_account_id)
        .eq('business_id', profile.business_id)
        .single()

    const { data: toAcc } = await supabase
        .from('financial_accounts')
        .select('id, name, current_balance')
        .eq('id', payload.to_account_id)
        .eq('business_id', profile.business_id)
        .single()

    if (!fromAcc || !toAcc) return { error: 'Akun asal atau akun tujuan tidak ditemukan.' }

    if (Number(fromAcc.current_balance || 0) < amt) {
        return { error: `Saldo akun asal (${fromAcc.name}) tidak mencukupi untuk transfer ini.` }
    }

    // 1. Kurangi akun asal
    await supabase.from('financial_accounts').update({
        current_balance: Number(fromAcc.current_balance || 0) - amt,
        updated_at: new Date().toISOString(),
    }).eq('id', fromAcc.id)

    // 2. Tambah akun tujuan
    await supabase.from('financial_accounts').update({
        current_balance: Number(toAcc.current_balance || 0) + amt,
        updated_at: new Date().toISOString(),
    }).eq('id', toAcc.id)

    const dateStr = payload.transfer_date || new Date().toISOString().split('T')[0]

    // 3. Catat jurnal mutasi transfer out & transfer in
    await supabase.from('financial_transactions').insert([
        {
            business_id: profile.business_id,
            account_id: fromAcc.id,
            type: 'transfer_out',
            category: 'transfer',
            amount: amt,
            description: `Transfer keluar ke ${toAcc.name}${payload.notes ? ` (${payload.notes.trim()})` : ''}`,
            transaction_date: dateStr,
        },
        {
            business_id: profile.business_id,
            account_id: toAcc.id,
            type: 'transfer_in',
            category: 'transfer',
            amount: amt,
            description: `Transfer masuk dari ${fromAcc.name}${payload.notes ? ` (${payload.notes.trim()})` : ''}`,
            transaction_date: dateStr,
        },
    ])

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/kas-rekening')
    return { success: true }
}

// ─── UTANG USAHA (DEBTS / PAYABLES) ──────────────────────────────────────────

export async function createDebtPayable(payload: {
    title: string
    creditor_name: string
    supplier_id?: string
    branch_id?: string | null
    total_amount: number
    due_date?: string
    notes?: string
}) {
    const { error: authErr, supabase, profile } = await getAuthorizedOwner()
    if (authErr || !supabase || !profile) return { error: authErr || 'Unauthorized' }

    if (!payload.title?.trim()) return { error: 'Judul atau keperluan utang wajib diisi.' }
    if (!payload.creditor_name?.trim()) return { error: 'Nama pemberi pinjaman/supplier wajib diisi.' }

    const total = Number(payload.total_amount)
    if (!total || total <= 0) return { error: 'Total nominal utang harus lebih dari 0.' }

    // Jika branch_id tidak disediakan (atau 'all'), targetkan ke Cabang Utama
    let targetBranchId = payload.branch_id
    if (!targetBranchId || targetBranchId === 'all') {
        const { data: primaryB } = await supabase
            .from('branches')
            .select('id')
            .eq('business_id', profile.business_id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
        targetBranchId = primaryB?.id || undefined
    }

    const insertPayload: Record<string, unknown> = {
        business_id: profile.business_id,
        supplier_id: payload.supplier_id || null,
        branch_id: targetBranchId || null,
        title: payload.title.trim(),
        creditor_name: payload.creditor_name.trim(),
        total_amount: total,
        paid_amount: 0,
        due_date: payload.due_date || null,
        status: 'unpaid',
        notes: payload.notes?.trim() || null,
    }

    let { error } = await supabase.from('debts_payables').insert(insertPayload)
    if (error && error.code === '42703') {
        delete insertPayload.branch_id
        const fallback = await supabase.from('debts_payables').insert(insertPayload)
        error = fallback.error
    }

    if (error) return { error: error.message }

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/utang-piutang')
    revalidatePath('/dashboard/keuangan/neraca')
    return { success: true }
}

export async function payDebt(payload: {
    debt_id: string
    payment_amount: number
    account_id: string
    payment_date: string
    notes?: string
}) {
    const { error: authErr, supabase, profile } = await getAuthorizedOwner()
    if (authErr || !supabase || !profile) return { error: authErr || 'Unauthorized' }

    const amt = Number(payload.payment_amount)
    if (!amt || amt <= 0) return { error: 'Nominal pembayaran harus lebih dari 0.' }

    const { data: debt } = await supabase
        .from('debts_payables')
        .select('*')
        .eq('id', payload.debt_id)
        .eq('business_id', profile.business_id)
        .single()

    if (!debt) return { error: 'Data utang tidak ditemukan.' }

    const currentPaid = Number(debt.paid_amount || 0)
    const totalAmount = Number(debt.total_amount || 0)
    const remaining = totalAmount - currentPaid

    if (amt > remaining) {
        return { error: `Nominal melebihi sisa utang yang belum dibayar (Sisa: Rp${remaining.toLocaleString('id-ID')}).` }
    }

    const { data: acc } = await supabase
        .from('financial_accounts')
        .select('id, name, current_balance')
        .eq('id', payload.account_id)
        .eq('business_id', profile.business_id)
        .single()

    if (!acc) return { error: 'Akun kas / rekening sumber dana tidak ditemukan.' }

    const newPaid = currentPaid + amt
    const newStatus = newPaid >= totalAmount ? 'paid' : 'partial'

    // 1. Update data utang
    await supabase.from('debts_payables').update({
        paid_amount: newPaid,
        status: newStatus,
        updated_at: new Date().toISOString(),
    }).eq('id', debt.id)

    // Jika utang berasal dari pembelian bahan baku (debt.purchase_id != null),
    // sinkronkan juga paid_amount dan payment_status pada tabel purchases
    if (debt.purchase_id) {
        await supabase.from('purchases').update({
            paid_amount: newPaid,
            payment_status: newStatus === 'paid' ? 'paid' : 'unpaid',
            updated_at: new Date().toISOString(),
        }).eq('id', debt.purchase_id)
    }

    // 2. Kurangi saldo akun kas/bank
    await supabase.from('financial_accounts').update({
        current_balance: Number(acc.current_balance || 0) - amt,
        updated_at: new Date().toISOString(),
    }).eq('id', acc.id)

    // 3. Catat transaksi jurnal pengeluaran pelunasan utang
    await supabase.from('financial_transactions').insert({
        business_id: profile.business_id,
        account_id: acc.id,
        type: 'expense',
        category: 'debt_payment',
        amount: amt,
        reference_id: debt.id,
        description: `Bayar Utang: ${debt.title} (${debt.creditor_name})${payload.notes ? ` - ${payload.notes.trim()}` : ''}`,
        transaction_date: payload.payment_date || new Date().toISOString().split('T')[0],
    })

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/utang-piutang')
    revalidatePath('/dashboard/keuangan/kas-rekening')
    revalidatePath('/dashboard/keuangan/neraca')
    revalidatePath('/dashboard/keuangan/arus-kas')
    revalidatePath('/dashboard/bahan-baku')
    return { success: true }
}

export async function deleteDebtPayable(debtId: string) {
    const { error: authErr, supabase, profile } = await getAuthorizedOwner()
    if (authErr || !supabase || !profile) return { error: authErr || 'Unauthorized' }

    const { data: debt } = await supabase
        .from('debts_payables')
        .select('id, paid_amount, purchase_id')
        .eq('id', debtId)
        .eq('business_id', profile.business_id)
        .single()

    if (!debt) return { error: 'Data utang tidak ditemukan.' }

    if (debt.purchase_id) {
        return {
            error: 'Utang dari pembelian bahan baku tidak boleh dihapus manual. Silakan batalkan (hapus) data pembelian terkait di menu Bahan Baku.',
        }
    }

    if (debt && Number(debt.paid_amount || 0) > 0) {
        return {
            error: 'Tidak dapat menghapus utang yang sudah memiliki riwayat pembayaran/cicilan. Harap sesuaikan saldo via mutasi kas.',
        }
    }

    const { error } = await supabase
        .from('debts_payables')
        .delete()
        .eq('id', debtId)
        .eq('business_id', profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/utang-piutang')
    revalidatePath('/dashboard/keuangan/neraca')
    return { success: true }
}

// ─── PIUTANG USAHA (RECEIVABLES) ──────────────────────────────────────────────

export async function createReceivable(payload: {
    title: string
    debtor_name: string
    customer_id?: string
    sale_id?: string
    branch_id?: string | null
    total_amount: number
    due_date?: string
    notes?: string
}) {
    const { error: authErr, supabase, profile } = await getAuthorizedOwner()
    if (authErr || !supabase || !profile) return { error: authErr || 'Unauthorized' }

    if (!payload.title?.trim()) return { error: 'Keterangan piutang wajib diisi.' }
    if (!payload.debtor_name?.trim()) return { error: 'Nama pelanggan / peminjam wajib diisi.' }

    const total = Number(payload.total_amount)
    if (!total || total <= 0) return { error: 'Nominal piutang harus lebih dari 0.' }

    // Jika branch_id tidak disediakan (atau 'all'), targetkan ke Cabang Utama
    let targetBranchId = payload.branch_id
    if (!targetBranchId || targetBranchId === 'all') {
        const { data: primaryB } = await supabase
            .from('branches')
            .select('id')
            .eq('business_id', profile.business_id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
        targetBranchId = primaryB?.id || undefined
    }

    const insertPayload: Record<string, unknown> = {
        business_id: profile.business_id,
        customer_id: payload.customer_id || null,
        sale_id: payload.sale_id || null,
        branch_id: targetBranchId || null,
        title: payload.title.trim(),
        debtor_name: payload.debtor_name.trim(),
        total_amount: total,
        paid_amount: 0,
        due_date: payload.due_date || null,
        status: 'unpaid',
        notes: payload.notes?.trim() || null,
    }

    let { error } = await supabase.from('receivables').insert(insertPayload)
    if (error && error.code === '42703') {
        delete insertPayload.branch_id
        const fallback = await supabase.from('receivables').insert(insertPayload)
        error = fallback.error
    }

    if (error) return { error: error.message }

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/utang-piutang')
    revalidatePath('/dashboard/keuangan/neraca')
    return { success: true }
}

export async function payReceivable(payload: {
    receivable_id: string
    payment_amount: number
    account_id: string
    payment_date: string
    notes?: string
    payment_method?: string
}) {
    const { error: authErr, supabase, user, profile } = await getAuthorizedOwner()
    if (authErr || !supabase || !profile || !user) return { error: authErr || 'Unauthorized' }

    const amt = Number(payload.payment_amount)
    if (!amt || amt <= 0) return { error: 'Nominal pembayaran harus lebih dari 0.' }

    const { data: rec } = await supabase
        .from('receivables')
        .select('*')
        .eq('id', payload.receivable_id)
        .eq('business_id', profile.business_id)
        .single()

    if (!rec) return { error: 'Data piutang tidak ditemukan.' }

    const currentPaid = Number(rec.paid_amount || 0)
    const totalAmount = Number(rec.total_amount || 0)
    const remaining = totalAmount - currentPaid

    if (amt > remaining + 0.01) {
        return { error: `Nominal melebihi sisa piutang (Sisa: Rp${remaining.toLocaleString('id-ID')}).` }
    }

    const { data: acc } = await supabase
        .from('financial_accounts')
        .select('id, name, type, current_balance')
        .eq('id', payload.account_id)
        .eq('business_id', profile.business_id)
        .single()

    if (!acc) return { error: 'Akun kas / rekening penampung dana tidak ditemukan.' }

    // Jika piutang berasal dari penjualan kasir (rec.sale_id != null),
    // Wajib didelegasikan ke RPC record_sale_payment_atomic agar sales, sale_payments,
    // receivables, financial_accounts, dan financial_transactions terupdate simultan secara atomik!
    if (rec.sale_id) {
        let method: 'cash' | 'transfer' | 'qris' | 'lainnya' =
            (payload.payment_method as 'cash' | 'transfer' | 'qris' | 'lainnya' | undefined) || 'transfer'
        if (!payload.payment_method && acc) {
            if (acc.type === 'cash') method = 'cash'
            else if (acc.type === 'e_wallet') method = 'qris'
            else method = 'transfer'
        }

        const cleanPaymentDate = payload.payment_date
            ? payload.payment_date.split('T')[0]
            : new Date().toISOString().split('T')[0]

        const idempotencyKey = crypto.randomUUID()

        const { data: rpcResult, error: rpcError } = await supabase.rpc('record_sale_payment_atomic', {
            p_sale_id: rec.sale_id,
            p_business_id: profile.business_id,
            p_user_id: user.id,
            p_recorded_by: user.id,
            p_amount: amt,
            p_payment_method: method,
            p_account_id: payload.account_id || null,
            p_payment_date: cleanPaymentDate,
            p_notes: payload.notes?.trim() || `Pelunasan piutang melalui menu Keuangan`,
            p_idempotency_key: idempotencyKey,
        })

        if (rpcError) {
            return { error: `Gagal mencatat pembayaran piutang penjualan: ${rpcError.message}` }
        }

        if (!rpcResult?.success) {
            return { error: rpcResult?.message || 'Gagal memproses pembayaran piutang penjualan.' }
        }

        revalidatePath('/dashboard/keuangan')
        revalidatePath('/dashboard/keuangan/utang-piutang')
        revalidatePath('/dashboard/keuangan/kas-rekening')
        revalidatePath('/dashboard/keuangan/neraca')
        revalidatePath('/dashboard/keuangan/arus-kas')
        revalidatePath('/dashboard/penjualan/riwayat')
        revalidatePath('/dashboard')
        return { success: true, payment: rpcResult }
    }

    // Jika piutang non-penjualan (rec.sale_id == null):
    const newPaid = currentPaid + amt
    const newStatus = newPaid >= totalAmount ? 'paid' : 'partial'

    // 1. Update data piutang
    await supabase.from('receivables').update({
        paid_amount: newPaid,
        status: newStatus,
        updated_at: new Date().toISOString(),
    }).eq('id', rec.id)

    // 2. Tambah saldo akun kas/bank penampung
    await supabase.from('financial_accounts').update({
        current_balance: Number(acc.current_balance || 0) + amt,
        updated_at: new Date().toISOString(),
    }).eq('id', acc.id)

    // 3. Catat mutasi penerimaan piutang
    await supabase.from('financial_transactions').insert({
        business_id: profile.business_id,
        account_id: acc.id,
        type: 'income',
        category: 'receivable_payment',
        amount: amt,
        reference_id: rec.id,
        description: `Penerimaan Piutang: ${rec.title} (${rec.debtor_name})${payload.notes ? ` - ${payload.notes.trim()}` : ''}`,
        transaction_date: payload.payment_date || new Date().toISOString().split('T')[0],
    })

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/utang-piutang')
    revalidatePath('/dashboard/keuangan/kas-rekening')
    revalidatePath('/dashboard/keuangan/neraca')
    return { success: true }
}

export async function deleteReceivable(receivableId: string) {
    const { error: authErr, supabase, profile } = await getAuthorizedOwner()
    if (authErr || !supabase || !profile) return { error: authErr || 'Unauthorized' }

    const { data: rec } = await supabase
        .from('receivables')
        .select('id, sale_id')
        .eq('id', receivableId)
        .eq('business_id', profile.business_id)
        .single()

    if (!rec) return { error: 'Data piutang tidak ditemukan.' }

    if (rec.sale_id) {
        return {
            error: 'Piutang dari penjualan kasir tidak boleh dihapus manual. Silakan batalkan (void) transaksi penjualan terkait di menu Riwayat Penjualan.',
        }
    }

    const { error } = await supabase
        .from('receivables')
        .delete()
        .eq('id', receivableId)
        .eq('business_id', profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/utang-piutang')
    revalidatePath('/dashboard/keuangan/neraca')
    return { success: true }
}

// ─── MODAL & EKUITAS USAHA (EQUITY) ───────────────────────────────────────────

export async function createEquityRecord(payload: {
    title: string
    type: 'initial_capital' | 'additional_capital' | 'drawings_prive'
    amount: number
    account_id?: string
    entry_date: string
    notes?: string
}) {
    const { error: authErr, supabase, profile } = await getAuthorizedOwner()
    if (authErr || !supabase || !profile) return { error: authErr || 'Unauthorized' }

    if (!payload.title?.trim()) return { error: 'Keterangan transaksi modal wajib diisi.' }
    const amt = Number(payload.amount)
    if (!amt || amt <= 0) return { error: 'Nominal modal harus lebih dari 0.' }

    const { data: eq, error } = await supabase.from('equity_records').insert({
        business_id: profile.business_id,
        title: payload.title.trim(),
        type: payload.type,
        amount: amt,
        account_id: payload.account_id || null,
        entry_date: payload.entry_date || new Date().toISOString().split('T')[0],
        notes: payload.notes?.trim() || null,
    }).select('id').single()

    if (error) return { error: error.message }

    // Jika dihubungkan ke akun kas/bank
    if (payload.account_id) {
        const { data: acc } = await supabase
            .from('financial_accounts')
            .select('id, name, current_balance')
            .eq('id', payload.account_id)
            .eq('business_id', profile.business_id)
            .single()

        if (acc) {
            const isDeposit = payload.type !== 'drawings_prive'
            const newBal = isDeposit
                ? Number(acc.current_balance || 0) + amt
                : Number(acc.current_balance || 0) - amt

            await supabase.from('financial_accounts').update({
                current_balance: newBal,
                updated_at: new Date().toISOString(),
            }).eq('id', acc.id)

            await supabase.from('financial_transactions').insert({
                business_id: profile.business_id,
                account_id: acc.id,
                type: isDeposit ? 'income' : 'expense',
                category: isDeposit ? 'equity_deposit' : 'equity_withdraw',
                amount: amt,
                reference_id: eq?.id || null,
                description: `${payload.type === 'initial_capital' ? 'Setoran Modal Awal' : payload.type === 'additional_capital' ? 'Tambahan Modal Disetor' : 'Prive Penarikan Owner'}: ${payload.title.trim()}`,
                transaction_date: payload.entry_date || new Date().toISOString().split('T')[0],
            })
        }
    }

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/modal')
    revalidatePath('/dashboard/keuangan/kas-rekening')
    revalidatePath('/dashboard/keuangan/neraca')
    return { success: true }
}

export async function deleteEquityRecord(equityId: string) {
    const { error: authErr, supabase, profile } = await getAuthorizedOwner()
    if (authErr || !supabase || !profile) return { error: authErr || 'Unauthorized' }

    // 1. Ambil mutasi kas terkait di financial_transactions
    const { data: tx } = await supabase
        .from('financial_transactions')
        .select('id, account_id, type, category, amount')
        .eq('reference_id', equityId)
        .eq('business_id', profile.business_id)
        .in('category', ['equity_deposit', 'equity_withdraw'])
        .maybeSingle()

    // 2. Jika ada mutasi kas riil, lakukan reversal saldo kas/bank
    if (tx && tx.account_id) {
        const { data: acc } = await supabase
            .from('financial_accounts')
            .select('id, current_balance')
            .eq('id', tx.account_id)
            .eq('business_id', profile.business_id)
            .single()

        if (acc) {
            const txAmt = Number(tx.amount || 0)
            // Jika sebelumnya setoran modal (equity_deposit), kurangi saldo kembali
            // Jika sebelumnya prive (equity_withdraw), tambahkan saldo kembali
            const newBal = tx.category === 'equity_deposit'
                ? Number(acc.current_balance || 0) - txAmt
                : Number(acc.current_balance || 0) + txAmt

            await supabase
                .from('financial_accounts')
                .update({
                    current_balance: newBal,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', acc.id)
                .eq('business_id', profile.business_id)
        }

        // Hapus rekaman mutasi jurnal
        await supabase
            .from('financial_transactions')
            .delete()
            .eq('id', tx.id)
            .eq('business_id', profile.business_id)
    }

    // 3. Hapus entri modal
    const { error } = await supabase
        .from('equity_records')
        .delete()
        .eq('id', equityId)
        .eq('business_id', profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard/keuangan/modal')
    revalidatePath('/dashboard/keuangan/kas-rekening')
    revalidatePath('/dashboard/keuangan/neraca')
    revalidatePath('/dashboard/keuangan/arus-kas')
    return { success: true }
}
