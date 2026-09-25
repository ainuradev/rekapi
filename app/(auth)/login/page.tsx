'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
    const router = useRouter()
    const supabase = createClient()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [googleLoading, setGoogleLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        setLoading(false)

        if (signInError) {
            setError('Email atau password salah.')
            return
        }

        router.push('/dashboard')
        router.refresh()
    }

    async function handleGoogleLogin() {
        setGoogleLoading(true)
        setError(null)

        const { error: oauthError } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${location.origin}/api/auth/callback`,
            },
        })

        if (oauthError) {
            setError('Gagal masuk dengan Google. Coba lagi.')
            setGoogleLoading(false)
        }
        // Kalau sukses, browser otomatis diarahkan ke Google — tidak perlu setLoading(false)
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-sm">
            <div className="mb-6 text-center">
                <div className="flex justify-center mb-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white text-xl shadow-lg shadow-blue-600/25">⚡</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-900">Masuk ke Rekapin</h1>
                <p className="mt-1 text-sm text-slate-500">Catat sekali, rekap otomatis setiap cabang.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                {/* Tombol Google */}
                <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={googleLoading || loading}
                    className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition active:scale-[0.99] disabled:opacity-50"
                >
                    {/* Google logo SVG */}
                    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                        <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                    {googleLoading ? 'Mengarahkan...' : 'Lanjutkan dengan Google'}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                    <div className="flex-1 border-t border-slate-200" />
                    <span className="text-xs text-slate-400">atau masuk dengan email</span>
                    <div className="flex-1 border-t border-slate-200" />
                </div>

                {/* Form email/password */}
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">Email</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="nama@bisnis.com"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">Password</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>

                    {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

                    <button
                        type="submit"
                        disabled={loading || googleLoading}
                        className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow shadow-blue-600/20 hover:bg-blue-700 transition active:scale-[0.99] disabled:opacity-50"
                    >
                        {loading ? 'Memproses...' : 'Masuk'}
                    </button>
                </form>
            </div>

            <p className="mt-6 text-center text-sm text-slate-500">
                Belum punya akun?{' '}
                <a href="/register" className="font-semibold text-blue-600 hover:underline">
                    Daftar di sini
                </a>
            </p>
          </div>
        </div>
    )
}