import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getIndonesianPeriodRange } from '@/lib/date-utils'

function fmt(n: number) {
    return 'Rp' + n.toLocaleString('id-ID')
}

export default async function DashboardPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, role, business_id, businesses(name)')
        .eq('id', user.id)
        .single()

    const isOwner = profile?.role === 'owner'
    const businessName = (profile as any)?.businesses?.name ?? 'Bisnis'

    // ── Ringkasan keuangan hari ini (hanya untuk owner) ──
    let todaySales = 0
    let todayHPP = 0
    let todayPurchases = 0
    let todayExpenses = 0

    if (isOwner && profile?.business_id) {
        const { dateFrom, timestampFrom, timestampTo } = getIndonesianPeriodRange('today')

        const [
            { data: salesData },
            { data: saleItemsData },
            { data: purchasesData },
            { data: expensesData },
        ] = await Promise.all([
            supabase
                .from('sales')
                .select('total')
                .eq('business_id', profile.business_id)
                .gte('transaction_date', timestampFrom)
                .lte('transaction_date', timestampTo),
            supabase
                .from('sale_items')
                .select('cost_price, quantity, sales!inner(business_id, transaction_date)')
                .eq('sales.business_id', profile.business_id)
                .gte('sales.transaction_date', timestampFrom)
                .lte('sales.transaction_date', timestampTo),
            supabase
                .from('purchases')
                .select('total')
                .eq('business_id', profile.business_id)
                .eq('purchase_date', dateFrom),
            supabase
                .from('expenses')
                .select('amount')
                .eq('business_id', profile.business_id)
                .eq('expense_date', dateFrom),
        ])

        todaySales = (salesData ?? []).reduce((s, r) => s + Number(r.total), 0)
        todayHPP = (saleItemsData ?? []).reduce(
            (s, i) => s + Number(i.cost_price) * Number(i.quantity),
            0
        )
        todayPurchases = (purchasesData ?? []).reduce((s, r) => s + Number(r.total), 0)
        todayExpenses = (expensesData ?? []).reduce((s, r) => s + Number(r.amount), 0)
    }

    const netProfit = todaySales - todayHPP - todayPurchases - todayExpenses

    return (
        <div className="mx-auto max-w-2xl px-4 py-8 sm:py-16">
            <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Dashboard</h1>
                    <p className="text-sm text-gray-500">{businessName}</p>
                </div>
                <div className="mt-2 sm:mt-0">
                    <span
                        className={`inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                            isOwner ? 'bg-black text-white' : 'bg-gray-200 text-gray-700'
                        }`}
                    >
                        {profile?.role ?? 'User'}
                    </span>
                </div>
            </div>

            {profileError && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    <p className="font-medium">Gagal memuat profil: {profileError.message}</p>
                    <p className="mt-1 text-xs text-red-500">
                        Pastikan trigger `handle_new_user` aktif atau RLS mengizinkan select profile.
                    </p>
                </div>
            )}

            {/* Ringkasan Keuangan Hari Ini — hanya owner */}
            {isOwner && (
                <div className="mb-8">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                            💵 Keuangan Hari Ini
                        </h2>
                        <Link
                            href="/dashboard/keuangan"
                            className="text-xs font-medium text-gray-500 hover:text-black"
                        >
                            Lihat Detail →
                        </Link>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <MiniCard
                            icon="💰"
                            label="Pendapatan"
                            value={fmt(todaySales)}
                            color="text-gray-900"
                        />
                        <MiniCard
                            icon="🛒"
                            label="Belanja Bahan"
                            value={fmt(todayPurchases)}
                            color="text-amber-700"
                        />
                        <MiniCard
                            icon="💸"
                            label="Pengeluaran"
                            value={fmt(todayExpenses)}
                            color="text-red-600"
                        />
                        <div
                            className={`rounded-2xl border p-4 shadow-sm ${
                                netProfit >= 0
                                    ? 'border-green-200 bg-green-50'
                                    : 'border-red-200 bg-red-50'
                            }`}
                        >
                            <div className="mb-2 flex items-center gap-1.5">
                                <span className="text-xl">{netProfit >= 0 ? '🟢' : '🔴'}</span>
                                <span className="text-[11px] font-medium text-gray-500">Laba Bersih</span>
                            </div>
                            <p
                                className={`text-base font-extrabold ${
                                    netProfit >= 0 ? 'text-green-700' : 'text-red-600'
                                }`}
                            >
                                {netProfit < 0 ? '−' : ''}
                                {fmt(Math.abs(netProfit))}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Action Shortcuts */}
            <h2 className="mb-3 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Menu Utama
            </h2>
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Link
                    href="/dashboard/penjualan"
                    className="flex flex-col items-center justify-center rounded-xl border bg-white p-4 text-center transition hover:border-black"
                >
                    <span className="text-3xl">🧾</span>
                    <span className="mt-2 font-medium text-sm">Kasir</span>
                    <span className="text-xs text-gray-400">Input penjualan</span>
                </Link>

                <Link
                    href="/dashboard/penjualan/riwayat"
                    className="flex flex-col items-center justify-center rounded-xl border bg-white p-4 text-center transition hover:border-black"
                >
                    <span className="text-3xl">📋</span>
                    <span className="mt-2 font-medium text-sm">Riwayat</span>
                    <span className="text-xs text-gray-400">Cek & edit transaksi</span>
                </Link>

                {isOwner && (
                    <>
                        <Link
                            href="/dashboard/produk"
                            className="flex flex-col items-center justify-center rounded-xl border bg-white p-4 text-center transition hover:border-black"
                        >
                            <span className="text-3xl">📦</span>
                            <span className="mt-2 font-medium text-sm">Produk</span>
                            <span className="text-xs text-gray-400">Katalog & Stok</span>
                        </Link>
                        <Link
                            href="/dashboard/bahan-baku"
                            className="flex flex-col items-center justify-center rounded-xl border bg-white p-4 text-center transition hover:border-black"
                        >
                            <span className="text-3xl">🥬</span>
                            <span className="mt-2 font-medium text-sm">Bahan Baku</span>
                            <span className="text-xs text-gray-400">Belanja & stok bahan</span>
                        </Link>

                        <Link
                            href="/dashboard/keuangan"
                            className="flex flex-col items-center justify-center rounded-xl border bg-white p-4 text-center transition hover:border-black"
                        >
                            <span className="text-3xl">💵</span>
                            <span className="mt-2 font-medium text-sm">Keuangan</span>
                            <span className="text-xs text-gray-400">Laba & pengeluaran</span>
                        </Link>

                        <Link
                            href="/dashboard/cabang"
                            className="flex flex-col items-center justify-center rounded-xl border bg-white p-4 text-center transition hover:border-black"
                        >
                            <span className="text-3xl">🏢</span>
                            <span className="mt-2 font-medium text-sm">Cabang</span>
                            <span className="text-xs text-gray-400">Kelola cabang</span>
                        </Link>

                        <Link
                            href="/dashboard/pegawai"
                            className="flex flex-col items-center justify-center rounded-xl border bg-white p-4 text-center transition hover:border-black"
                        >
                            <span className="text-3xl">👥</span>
                            <span className="mt-2 font-medium text-sm">Pegawai</span>
                            <span className="text-xs text-gray-400">Akun shared per cabang</span>
                        </Link>
                    </>
                )}
            </div>

            {/* Profile Info Card */}
            <div className="rounded-xl border bg-white p-5 space-y-3">
                <h3 className="font-semibold text-gray-900">Informasi Pengguna</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div>
                        <span className="text-gray-500">Nama:</span>{' '}
                        <span className="font-medium">{profile?.full_name ?? '-'}</span>
                    </div>
                    <div>
                        <span className="text-gray-500">Email:</span>{' '}
                        <span className="font-medium">{user.email}</span>
                    </div>
                    <div>
                        <span className="text-gray-500">Bisnis:</span>{' '}
                        <span className="font-medium">{businessName}</span>
                    </div>
                    <div>
                        <span className="text-gray-500">Role:</span>{' '}
                        <span className="font-medium capitalize">{profile?.role ?? '-'}</span>
                    </div>
                </div>

                <form action="/api/auth/signout" method="post" className="pt-2">
                    <button
                        type="submit"
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
                    >
                        Logout
                    </button>
                </form>
            </div>
        </div>
    )
}

function MiniCard({
    icon,
    label,
    value,
    color,
}: {
    icon: string
    label: string
    value: string
    color: string
}) {
    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5">
                <span className="text-xl">{icon}</span>
                <span className="text-[11px] font-medium text-gray-500">{label}</span>
            </div>
            <p className={`text-base font-extrabold ${color}`}>{value}</p>
        </div>
    )
}