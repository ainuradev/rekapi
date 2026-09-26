'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canAddBranch } from '@/lib/subscription-limits'

export async function addBranch(formData: FormData) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Ambil business_id dari profile user yang login — jangan pernah percaya
    // business_id dari form/client, karena itu bisa dimanipulasi.
    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role, businesses(subscription_status, subscription_plan_id, subscription_plans(code))')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner') {
        return { error: 'Hanya owner yang bisa menambah cabang.' }
    }

    // Check subscription limits
    const businessData = (profile as any)?.businesses
    const subscriptionStatus = businessData?.subscription_status || 'trial'
    const planCode = businessData?.subscription_plans?.code || null

    // Count existing branches
    const { count } = await supabase
        .from('branches')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', profile.business_id)

    const branchCount = count ?? 0
    const { allowed, reason } = canAddBranch(branchCount, planCode, subscriptionStatus)

    if (!allowed) {
        return { error: reason }
    }

    const name = String(formData.get('name') ?? '').trim()
    if (!name) return { error: 'Nama cabang wajib diisi.' }

    const { error } = await supabase.from('branches').insert({
        business_id: profile.business_id,
        name,
    })

    if (error) return { error: error.message }

    revalidatePath('/dashboard/cabang')
    return { success: true }
}

export async function deleteBranch(branchId: string) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner') {
        return { error: 'Hanya owner yang bisa menghapus cabang.' }
    }

    const { error } = await supabase
        .from('branches')
        .delete()
        .eq('id', branchId)
        .eq('business_id', profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/cabang')
    return { success: true }
}