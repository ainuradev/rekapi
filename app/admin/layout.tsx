import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth-admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

export const metadata = {
    title: 'Super Admin Portal — Rekapi',
    description: 'Portal pemantauan pengguna, bisnis UMKM, dan override langganan Rekapi',
}

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login?next=/admin')
    }

    if (!isSuperAdmin(user.email)) {
        redirect('/dashboard?unauthorized=admin')
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
            {/* ── Top Bar Super Admin (Deep Forest Green #06281b) ── */}
            <header className="sticky top-0 z-50 border-b border-[#0e442f] bg-[#06281b] text-white shadow-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-3 sm:px-6 h-16">
                    {/* Brand */}
                    <div className="flex items-center gap-3">
                        <Link href="/admin" className="flex items-center gap-2.5 group">
                            <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center shrink-0">
                                <Image
                                    src="/logo.png?v=2"
                                    alt="Logo Rekapi"
                                    width={32}
                                    height={32}
                                    className="w-full h-full object-contain"
                                    priority
                                    unoptimized
                                />
                            </div>
                            <span className="text-lg font-bold tracking-tight text-white flex items-center font-sans">
                                Rekapi
                            </span>
                        </Link>
                        <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-300 uppercase">
                            Super Admin
                        </span>
                    </div>

                    {/* Nav Actions */}
                    <div className="flex items-center gap-2.5 sm:gap-3">
                        <Link
                            href="/dashboard"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#0e442f] bg-[#0f4a33]/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-[#0f4a33] hover:text-white"
                        >
                            <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            <span className="hidden sm:inline">Dashboard Tenant</span>
                        </Link>

                        <div className="hidden items-center gap-2 border-l border-[#0e442f] pl-3 md:flex">
                            <span className="text-[11px] text-[#84a595]">Admin:</span>
                            <span className="rounded bg-[#041f15] border border-[#0e442f] px-2 py-0.5 text-xs font-medium text-emerald-300">
                                {user.email}
                            </span>
                        </div>

                        <form action="/api/auth/signout" method="post">
                            <button
                                type="submit"
                                className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 hover:text-rose-200 cursor-pointer"
                            >
                                <svg className="w-3.5 h-3.5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                <span className="hidden sm:inline">Keluar</span>
                            </button>
                        </form>
                    </div>
                </div>
            </header>

            {/* Content Container */}
            <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-8">{children}</main>
        </div>
    )
}
