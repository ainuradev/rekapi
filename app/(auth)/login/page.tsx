'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
    const router = useRouter()
    const supabase = createClient()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [googleLoading, setGoogleLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // State untuk Modal Lupa Password
    const [showForgotModal, setShowForgotModal] = useState(false)
    const [forgotEmail, setForgotEmail] = useState('')
    const [forgotLoading, setForgotLoading] = useState(false)
    const [forgotSuccess, setForgotSuccess] = useState<string | null>(null)
    const [forgotError, setForgotError] = useState<string | null>(null)

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
            setError('Email atau kata sandi salah. Silakan coba lagi.')
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
    }

    async function handleForgotPassword(e: React.FormEvent) {
        e.preventDefault()
        setForgotLoading(true)
        setForgotError(null)
        setForgotSuccess(null)

        const cleanEmail = forgotEmail.trim()
        if (!cleanEmail) {
            setForgotError('Harap masukkan alamat email Anda.')
            setForgotLoading(false)
            return
        }

        const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
            redirectTo: `${location.origin}/reset-password`,
        })

        setForgotLoading(false)

        if (resetError) {
            setForgotError(resetError.message || 'Gagal mengirim instruksi reset kata sandi.')
            return
        }

        setForgotSuccess('Tautan reset kata sandi telah dikirim ke email Anda. Silakan cek kotak masuk atau folder spam.')
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-sm">
                <div className="mb-6 text-center">
                    <div className="flex justify-center mb-3">
                        <Link href="/" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white text-xl shadow-lg shadow-blue-600/25 hover:scale-105 transition-transform">
                            ⚡
                        </Link>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Masuk ke Rekapi</h1>
                    <p className="mt-1 text-sm text-slate-500">Catat sekali, rekap otomatis setiap cabang.</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                    {/* Tombol Google */}
                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={googleLoading || loading}
                        className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                    >
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
                            <label className="mb-1 block text-xs font-semibold text-slate-700">Email</label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="nama@bisnis.com"
                                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 transition"
                            />
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-semibold text-slate-700">Kata Sandi</label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setForgotEmail(email)
                                        setForgotSuccess(null)
                                        setForgotError(null)
                                        setShowForgotModal(true)
                                    }}
                                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition cursor-pointer"
                                >
                                    Lupa Kata Sandi?
                                </button>
                            </div>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full rounded-xl border border-slate-300 bg-white pl-3.5 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 transition"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                                    title={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                                    tabIndex={-1}
                                >
                                    {showPassword ? (
                                        // Icon Eye Slash (Mata tertutup)
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                                        </svg>
                                    ) : (
                                        // Icon Eye (Mata terbuka)
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {error && <p className="text-xs font-semibold text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">{error}</p>}

                        <button
                            type="submit"
                            disabled={loading || googleLoading}
                            className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                        >
                            {loading ? 'Memproses...' : 'Masuk'}
                        </button>
                    </form>
                </div>

                <p className="mt-6 text-center text-sm text-slate-500">
                    Belum punya akun?{' '}
                    <Link href="/register" className="font-semibold text-blue-600 hover:underline">
                        Daftar di sini
                    </Link>
                </p>
            </div>

            {/* ── Modal Lupa Kata Sandi ── */}
            {showForgotModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs px-4">
                    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 text-base">
                                    🔑
                                </span>
                                <h3 className="text-base font-bold text-slate-900">Lupa Kata Sandi?</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowForgotModal(false)}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition cursor-pointer"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                            Masukkan email yang terdaftar pada akun Rekapi Anda. Kami akan mengirimkan tautan untuk mengatur ulang kata sandi.
                        </p>

                        <form onSubmit={handleForgotPassword} className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-700">Email Akun</label>
                                <input
                                    type="email"
                                    required
                                    value={forgotEmail}
                                    onChange={(e) => setForgotEmail(e.target.value)}
                                    placeholder="nama@bisnis.com"
                                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 transition"
                                />
                            </div>

                            {forgotError && (
                                <p className="text-xs font-medium text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                                    {forgotError}
                                </p>
                            )}

                            {forgotSuccess && (
                                <div className="text-xs font-medium text-emerald-700 bg-emerald-50 p-3 rounded-lg border border-emerald-200 leading-relaxed">
                                    {forgotSuccess}
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setShowForgotModal(false)}
                                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                >
                                    Tutup
                                </button>
                                <button
                                    type="submit"
                                    disabled={forgotLoading}
                                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-500/20 transition disabled:opacity-50 cursor-pointer"
                                >
                                    {forgotLoading ? 'Mengirim...' : 'Kirim Tautan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}