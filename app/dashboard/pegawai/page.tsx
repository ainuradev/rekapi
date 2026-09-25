import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { addEmployee, removeEmployee } from './actions'

export default async function PegawaiPage() {
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

    const { data: employees } = await supabase
        .from('profiles')
        .select('id, full_name, role, branches(name)')
        .eq('role', 'pegawai')
        .order('full_name')

    const { data: branches } = await supabase.from('branches').select('id, name').order('name')

    return (
        <div className="mx-auto max-w-lg px-4 py-8 sm:py-16">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Kelola Pegawai</h1>
                <p className="mt-1 text-sm text-gray-600">
                    Akun shared login kasir per cabang (1 cabang = 1 login).
                </p>
            </div>

            <form
                action={async (formData: FormData) => {
                    'use server'
                    await addEmployee(formData)
                }}
                className="mb-8 space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
                <h2 className="text-base font-semibold text-gray-900">Tambah Akun Pegawai</h2>

                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nama Pegawai</label>
                    <input
                        type="text"
                        name="full_name"
                        required
                        placeholder="Contoh: Kasir Cabang Kemang"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Email Login</label>
                    <input
                        type="email"
                        name="email"
                        required
                        placeholder="kasir.kemang@dimsum.com"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Password (Minimal 6 karakter)</label>
                    <input
                        type="password"
                        name="password"
                        required
                        minLength={6}
                        placeholder="••••••••"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Pilih Cabang</label>
                    <select
                        name="branch_id"
                        required
                        className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                    >
                        <option value="">-- Pilih Cabang --</option>
                        {branches?.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.name}
                            </option>
                        ))}
                    </select>
                </div>

                <button
                    type="submit"
                    className="w-full rounded-lg bg-black py-3 text-sm font-semibold text-white shadow hover:bg-gray-800 transition active:scale-[0.99]"
                >
                    Tambah Pegawai
                </button>

                <p className="text-xs text-gray-500 leading-relaxed">
                    ℹ️ Pegawai ini otomatis fixed ke 1 cabang yang dipilih — kasir login menggunakan email &amp;
                    password di atas tanpa melihat data HPP atau laba.
                </p>
            </form>

            <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                    Daftar Akun Pegawai ({employees?.length ?? 0})
                </h2>

                {employees?.map((emp: any) => (
                    <div
                        key={emp.id}
                        className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                    >
                        <div>
                            <div className="font-semibold text-gray-900">{emp.full_name}</div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                                <span>🏢</span>
                                <span>{emp.branches?.name ?? 'Belum ada cabang'}</span>
                            </div>
                        </div>
                        <form
                            action={async () => {
                                'use server'
                                await removeEmployee(emp.id)
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

                {employees?.length === 0 && (
                    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
                        Belum ada akun pegawai. Buat akun pertama menggunakan form di atas.
                    </div>
                )}
            </div>
        </div>
    )
}
