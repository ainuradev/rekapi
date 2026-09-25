'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function addEmployee(formData: FormData) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Verifikasi manual: cuma owner yang boleh manggil fungsi ini.
    // Ini WAJIB dicek di sini karena admin client di bawah bypass semua RLS.
    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner') {
        return { error: 'Hanya owner yang bisa menambah akun pegawai.' }
    }

    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    const fullName = String(formData.get('full_name') ?? '').trim()
    const branchId = String(formData.get('branch_id') ?? '')

    if (!email || !password || !fullName || !branchId) {
        return { error: 'Semua field wajib diisi.' }
    }
    if (password.length < 6) {
        return { error: 'Password minimal 6 karakter.' }
    }

    // Pastikan branch itu memang milik business si owner (bukan business lain).
    const { data: branch } = await supabase
        .from('branches')
        .select('id')
        .eq('id', branchId)
        .eq('business_id', profile.business_id)
        .single()

    if (!branch) return { error: 'Cabang tidak valid.' }

    const admin = createAdminClient()

    const { error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // langsung aktif, tidak perlu verifikasi email
        user_metadata: {
            invited_business_id: profile.business_id,
            invited_role: 'pegawai',
            invited_branch_id: branchId,
            full_name: fullName,
        },
    })

    if (createError) {
        return { error: createError.message }
    }

    revalidatePath('/dashboard/pegawai')
    return { success: true }
}

export async function removeEmployee(profileId: string) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner') {
        return { error: 'Hanya owner yang bisa menghapus akun pegawai.' }
    }

    const admin = createAdminClient()

    // Hapus dari auth.users — profiles akan ikut terhapus lewat on delete cascade.
    const { error } = await admin.auth.admin.deleteUser(profileId)
    if (error) return { error: error.message }

    revalidatePath('/dashboard/pegawai')
    return { success: true }
}
