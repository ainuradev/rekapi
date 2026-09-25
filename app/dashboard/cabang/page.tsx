import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { addBranch, deleteBranch } from './actions'

export default async function CabangPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'owner') {
        redirect('/dashboard')
    }

    const { data: branches } = await supabase
        .from('branches')
        .select('id, name, created_at')
        .order('created_at', { ascending: true })

    return (
        <div className="mx-auto max-w-lg px-4 py-8 sm:py-16">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Kelola Cabang</h1>
                <p className="mt-1 text-sm text-gray-600">
                    Tambah dan kelola cabang toko fisik atau outlet bisnis Anda.
                </p>
            </div>

            <form
                action={async (formData: FormData) => {
                    'use server'
                    await addBranch(formData)
                }}
                className="mb-8 space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
                <h2 className="text-base font-semibold text-gray-900">Tambah Cabang Baru</h2>
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nama Cabang</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            name="name"
                            required
                            placeholder="Contoh: Cabang Kemang / Cabang Tebet"
                            className="flex-1 rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                        />
                        <button
                            type="submit"
                            className="rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-gray-800 transition active:scale-[0.99]"
                        >
                            Tambah
                        </button>
                    </div>
                </div>
            </form>

            <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                    Daftar Cabang ({branches?.length ?? 0})
                </h2>

                {branches?.map((branch) => (
                    <div
                        key={branch.id}
                        className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-lg">🏢</span>
                            <span className="font-semibold text-gray-900">{branch.name}</span>
                        </div>
                        <form
                            action={async () => {
                                'use server'
                                await deleteBranch(branch.id)
                            }}
                        >
                            <button
                                type="submit"
                                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition"
                            >
                                Hapus
                            </button>
                        </form>
                    </div>
                ))}

                {branches?.length === 0 && (
                    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
                        Belum ada cabang. Tambahkan cabang pertama menggunakan form di atas.
                    </div>
                )}
            </div>
        </div>
    )
}