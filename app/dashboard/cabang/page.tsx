import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { addBranch, deleteBranch } from './actions'
import { canAddBranch } from '@/lib/subscription-limits'

export default async function CabangPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select(
            `role, business_id,
             businesses(
               subscription_status,
               subscription_plan_id,
               subscription_plans(max_branches, max_employees, can_advanced_reports, can_api_access, duration_days)
             )`
        )
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'owner') {
        redirect('/dashboard')
    }

    const { data: branches } = await supabase
        .from('branches')
        .select('id, name, created_at')
        .order('created_at', { ascending: true })

    const businessData = (profile as any)?.businesses
    const subscriptionStatus = businessData?.subscription_status || 'trial'
    const planLimits = businessData?.subscription_plans ?? null

    const branchCount = branches?.length ?? 0
    const { allowed, reason } = canAddBranch(branchCount, planLimits, subscriptionStatus)

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

                {!allowed && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        <p className="font-medium">⚠️ Batas cabang tercapai</p>
                        <p className="mt-1 text-xs">{reason}</p>
                        <a
                            href="/dashboard/subscription"
                            className="mt-2 inline-block text-xs font-semibold text-blue-600 hover:text-blue-700 underline"
                        >
                            Upgrade paket →
                        </a>
                    </div>
                )}

                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nama Cabang</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            name="name"
                            required
                            disabled={!allowed}
                            placeholder="Contoh: Cabang Kemang / Cabang Tebet"
                            className="flex-1 rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                        />
                        <button
                            type="submit"
                            disabled={!allowed}
                            className="rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-gray-800 transition active:scale-[0.99] disabled:bg-gray-400 disabled:cursor-not-allowed"
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