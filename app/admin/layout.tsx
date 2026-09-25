import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth-admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const metadata = {
    title: 'Super Admin Portal — Rekapin',
    description: 'Portal pemantauan pengguna, bisnis, dan transaksi Rekapin',
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
        <div className="min-h-screen bg-slate-100 text-slate-900">
            {/* ── Top Bar Super Admin ── */}
            <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900 text-white shadow-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
                    {/* Brand */}
                    <div className="flex items-center gap-3">
                        <Link href="/admin" className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500 font-bold text-white shadow-sm">
                                ⚡
                            </span>
                            <span className="text-base font-extrabold tracking-tight">Rekapin</span>
                        </Link>
                        <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] font-black tracking-wide text-amber-300">
                            👑 SUPER ADMIN
                        </span>
                    </div>

                    {/* Nav Actions */}
                    <div className="flex items-center gap-3">
                        <Link
                            href="/dashboard"
                            className="hidden items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white sm:flex"
                        >
                            <span>🏠</span>
                            <span>Buka Dashboard Bisnis</span>
                        </Link>

                        <div className="hidden items-center gap-2 border-l border-slate-700 pl-3 md:flex">
                            <span className="text-xs text-slate-400">Login sebagai:</span>
                            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-semibold text-blue-300">
                                {user.email}
                            </span>
                        </div>

                        <form action="/api/auth/signout" method="post">
                            <button
                                type="submit"
                                className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 hover:text-red-200 cursor-pointer"
                            >
                                <span>🚪</span>
                                <span className="hidden sm:inline">Keluar</span>
                            </button>
                        </form>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
        </div>
    )
}
