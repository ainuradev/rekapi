'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
    userId: string
    businessId: string
    currentFullName: string
    googleName: string
}

export default function OnboardingClient({ userId, businessId, currentFullName, googleName }: Props) {
    const router = useRouter()
    const supabase = createClient()

    const [businessName, setBusinessName] = useState('')
    const [fullName, setFullName] = useState(currentFullName || googleName)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!businessName.trim()) return

        setLoading(true)
        setError(null)

        // Update nama bisnis
        const { error: bizError } = await supabase
            .from('businesses')
            .update({ name: businessName.trim() })
            .eq('id', businessId)

        if (bizError) {
            setError('Gagal menyimpan nama bisnis. Coba lagi.')
            setLoading(false)
            return
        }

        // Update nama lengkap di profil kalau diubah
        if (fullName.trim() && fullName.trim() !== currentFullName) {
            await supabase
                .from('profiles')
                .update({ full_name: fullName.trim() })
                .eq('id', userId)
        }

        router.push('/dashboard')
        router.refresh()
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <div className="mb-8 text-center">
                    <div className="text-4xl mb-3">⚡</div>
                    <h1 className="text-2xl font-bold text-gray-900">Selamat Datang!</h1>
                    <p className="mt-2 text-sm text-gray-600">
                        Satu langkah lagi — lengkapi info bisnis Anda.
                    </p>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4"
                >
                    <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                            Nama Bisnis / Brand <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            value={businessName}
                            onChange={(e) => setBusinessName(e.target.value)}
                            placeholder="Contoh: Dimsum Mentai"
                            autoFocus
                            className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">Nama Pemilik</label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="Nama lengkap Anda"
                            className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                        />
                    </div>

                    {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

                    <button
                        type="submit"
                        disabled={loading || !businessName.trim()}
                        className="w-full rounded-lg bg-black py-2.5 text-sm font-semibold text-white shadow hover:bg-gray-800 transition active:scale-[0.99] disabled:opacity-50"
                    >
                        {loading ? 'Menyimpan...' : 'Mulai Gunakan Rekapin →'}
                    </button>
                </form>
            </div>
        </div>
    )
}
