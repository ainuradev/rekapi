'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { checkEmailExists } from './actions'

export default function RegisterPage() {
    const router = useRouter()
    const supabase = createClient()

    const [businessName, setBusinessName] = useState('')
    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [googleLoading, setGoogleLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleRegister(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError(null)

        // Crosscheck: cek apakah email sudah terdaftar
        const alreadyExists = await checkEmailExists(email)
        if (alreadyExists) {
            setError('Email ini sudah terdaftar. Silakan masuk atau gunakan email lain.')
            setLoading(false)
            return
        }

        const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    business_name: businessName,
                    full_name: fullName,
                },
            },
        })

        setLoading(false)

        if (signUpError) {
            setError(signUpError.message)
            return
        }

        router.push('/login?registered=1')
    }

    async function handleGoogleRegister() {
        setGoogleLoading(true)
        setError(null)

        // Setelah OAuth selesai, callback akan cek apakah user baru
        // dan redirect ke /dashboard/onboarding untuk isi nama bisnis
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                // Arahkan ke profil agar user bisa langsung isi nama bisnis
                redirectTo: `${location.origin}/api/auth/callback?next=/dashboard/profil`,
            },
        })

        if (oauthError) {
            setError('Gagal mendaftar dengan Google. Coba lagi.')
            setGoogleLoading(false)
        }
    }

    return (
        <div className="mx-auto max-w-sm px-4 py-16">
            <div className="mb-6 text-center">
                <div className="text-3xl mb-2">⚡</div>
                <h1 className="text-2xl font-bold text-gray-900">Daftar Rekapin</h1>
                <p className="mt-1 text-sm text-gray-600">Mulai kelola cabang dan keuangan UMKM Anda.</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
                {/* Tombol Google */}
                <button
                    type="button"
                    onClick={handleGoogleRegister}
                    disabled={googleLoading || loading}
                    className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition active:scale-[0.99] disabled:opacity-50"
                >
                    {/* Google logo SVG */}
                    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                        <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                    {googleLoading ? 'Mengarahkan...' : 'Daftar dengan Google'}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                    <div className="flex-1 border-t border-gray-200" />
                    <span className="text-xs text-gray-400">atau daftar dengan email</span>
                    <div className="flex-1 border-t border-gray-200" />
                </div>

                {/* Form email/password */}
                <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">Nama Bisnis / Brand</label>
                        <input
                            type="text"
                            required
                            value={businessName}
                            onChange={(e) => setBusinessName(e.target.value)}
                            placeholder="Contoh: Dimsum Mentai"
                            className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">Nama Pemilik (Owner)</label>
                        <input
                            type="text"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="Budi Santoso"
                            className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">Email Login</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="owner@dimsum.com"
                            className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">Password (Minimal 6 karakter)</label>
                        <input
                            type="password"
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                        />
                    </div>

                    {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

                    <button
                        type="submit"
                        disabled={loading || googleLoading}
                        className="w-full rounded-lg bg-black py-2.5 text-sm font-semibold text-white shadow hover:bg-gray-800 transition active:scale-[0.99] disabled:opacity-50"
                    >
                        {loading ? 'Mendaftarkan...' : 'Daftar Sekarang'}
                    </button>
                </form>
            </div>

            <p className="mt-6 text-center text-sm text-gray-600">
                Sudah punya akun?{' '}
                <a href="/login" className="font-semibold text-black underline hover:text-gray-800">
                    Masuk di sini
                </a>
            </p>
        </div>
    )
}