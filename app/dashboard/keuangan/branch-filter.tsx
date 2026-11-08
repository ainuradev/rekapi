'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface BranchFilterProps {
    branches: { id: string; name: string }[]
    selectedBranchId: string
    period: string
}

export default function BranchFilter({
    branches,
    selectedBranchId,
    period,
}: BranchFilterProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    if (branches.length === 0) return null

    function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const val = e.target.value
        const params = new URLSearchParams(searchParams?.toString() ?? '')
        if (val === 'all') {
            params.delete('branch')
        } else {
            params.set('branch', val)
        }
        if (period) {
            params.set('period', period)
        }
        router.push(`/dashboard/keuangan?${params.toString()}`)
    }

    const activeBranch = branches.find((b) => b.id === selectedBranchId)

    return (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-3.5 shadow-2xs">
            <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 text-base font-bold">
                    <svg className="w-5 h-5 text-emerald-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                </span>
                <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        Filter Cabang
                    </span>
                    <span className="text-xs font-extrabold text-gray-900">
                        {selectedBranchId === 'all'
                            ? `Semua Cabang (${branches.length} cabang)`
                            : `Cabang ${activeBranch?.name ?? ''}`}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <select
                    value={selectedBranchId}
                    onChange={handleChange}
                    className="rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-bold text-gray-800 shadow-2xs focus:border-indigo-600 focus:bg-white focus:outline-none cursor-pointer"
                >
                    <option value="all">Semua Cabang ({branches.length})</option>
                    {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                            Cabang {b.name}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    )
}
