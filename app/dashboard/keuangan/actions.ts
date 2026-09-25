'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const EXPENSE_CATEGORIES = [
    'gaji', 'listrik', 'air', 'sewa', 'gas',
    'transportasi', 'marketing', 'packaging', 'peralatan', 'lainnya',
] as const

type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]

export async function addExpense(payload: {
    category: ExpenseCategory
    amount: number
    description?: string
    expense_date: string
    branch_id?: string
}) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil tidak ditemukan.' }
    if (profile.role !== 'owner') return { error: 'Hanya Owner yang dapat mencatat pengeluaran.' }

    if (!EXPENSE_CATEGORIES.includes(payload.category as any)) {
        return { error: 'Kategori pengeluaran tidak valid.' }
    }

    const amount = Number(payload.amount)
    if (!amount || amount <= 0) return { error: 'Nominal harus lebih dari 0.' }
    if (!payload.expense_date) return { error: 'Tanggal wajib diisi.' }

    const { error } = await supabase.from('expenses').insert({
        business_id: profile.business_id,
        branch_id: payload.branch_id || null,
        category: payload.category,
        amount,
        expense_date: payload.expense_date,
        description: payload.description?.trim() || null,
    })

    if (error) return { error: error.message }

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard')
    return { success: true }
}

export async function deleteExpense(expenseId: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'owner') {
        return { error: 'Hanya Owner yang dapat menghapus pengeluaran.' }
    }

    const { error } = await supabase.from('expenses').delete().eq('id', expenseId)
    if (error) return { error: error.message }

    revalidatePath('/dashboard/keuangan')
    revalidatePath('/dashboard')
    return { success: true }
}
