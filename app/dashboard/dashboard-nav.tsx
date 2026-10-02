'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

type NavItem = {
    href?: string
    label: string
    icon: React.ReactNode
    children?: { href: string; label: string; icon?: React.ReactNode }[]
}

const HomeIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
)

const TransaksiIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
)

const ProdukIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
)

const LaporanIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
)

const CabangIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
)

const PengaturanIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
)

const PegawaiIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
)

const BellIcon = () => (
    <svg className="w-5 h-5 text-slate-500 hover:text-slate-800 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
)

const SearchIcon = () => (
    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
)

interface DashboardNavProps {
    isOwner: boolean
    userName: string
    branchName?: string | null
    businessName?: string | null
    subscriptionStatus?: string
    trialEndsAt?: string | null
    daysRemaining?: number
    isExpired?: boolean
    isSuperAdminUser?: boolean
}

export default function DashboardNav({
    isOwner,
    userName,
    branchName,
    businessName,
    subscriptionStatus = 'trial',
    trialEndsAt,
    daysRemaining = 0,
    isExpired = false,
    isSuperAdminUser = false,
}: DashboardNavProps) {
    const pathname = usePathname()

    const OWNER_NAV: NavItem[] = [
        { href: '/dashboard', label: 'Beranda', icon: <HomeIcon /> },
        {
            label: 'Transaksi',
            icon: <TransaksiIcon />,
            children: [
                { href: '/dashboard/penjualan', label: 'Kasir POS' },
                { href: '/dashboard/penjualan/riwayat', label: 'Riwayat Transaksi' },
            ],
        },
        {
            label: 'Produk',
            icon: <ProdukIcon />,
            children: [
                { href: '/dashboard/produk', label: 'Katalog Produk' },
                { href: '/dashboard/bahan-baku', label: 'Bahan Baku' },
            ],
        },
        { href: '/dashboard/keuangan', label: 'Laporan', icon: <LaporanIcon /> },
        { href: '/dashboard/cabang', label: 'Cabang', icon: <CabangIcon /> },
        {
            label: 'Pengaturan',
            icon: <PengaturanIcon />,
            children: [
                { href: '/dashboard/profil', label: 'Profil Bisnis' },
                { href: '/dashboard/pegawai', label: 'Kelola Pegawai' },
                { href: '/dashboard/subscription', label: 'Paket Langganan' },
            ],
        },
    ]

    const PEGAWAI_NAV: NavItem[] = [
        { href: '/dashboard/penjualan', label: 'Kasir', icon: <TransaksiIcon /> },
        { href: '/dashboard/penjualan/riwayat', label: 'Riwayat', icon: <HomeIcon /> },
    ]

    const items = isOwner ? OWNER_NAV : PEGAWAI_NAV

    const isActiveParent = (children?: { href: string }[]) => {
        if (!children) return false
        return children.some((child) => child.href === pathname)
    }

    const [expandedItems, setExpandedItems] = useState<string[]>(() => {
        const expanded: string[] = []
        items.forEach((item) => {
            if (item.children && isActiveParent(item.children)) {
                expanded.push(item.label)
            }
        })
        return expanded
    })

    const toggleExpand = (label: string) => {
        setExpandedItems((prev) =>
            prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
        )
    }

    // Avatar initials
    const initial = (businessName || userName || 'R').charAt(0).toUpperCase()
    const userInitial = userName.charAt(0).toUpperCase()

    return (
        <>
            {/* ── Desktop: Left Sidebar (Deep Dark SaaS Navy) ── */}
            <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col justify-between bg-[#0b1329] text-white z-40 sm:flex shadow-2xl">
                <div className="flex flex-col flex-1 overflow-y-auto">
                    {/* Brand Header */}
                    <div className="px-6 py-6 border-b border-slate-800/80 flex items-center justify-between">
                        <Link href="/dashboard" className="flex items-center gap-2.5 group">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-black text-sm shadow-md shadow-blue-500/30 group-hover:scale-105 transition-transform">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <span className="text-xl font-bold tracking-tight text-white flex items-center">
                                Rekapi
                            </span>
                        </Link>
                        {isSuperAdminUser && (
                            <Link
                                href="/admin"
                                className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition"
                            >
                                Admin
                            </Link>
                        )}
                    </div>

                    {/* Navigation Items */}
                    <div className="px-3 py-5 space-y-1">
                        {items.map((item, idx) => {
                            const hasChildren = item.children && item.children.length > 0
                            const isExpanded = expandedItems.includes(item.label)
                            const isParentActive = isActiveParent(item.children)
                            const isSelfActive = item.href === pathname

                            if (hasChildren) {
                                return (
                                    <div key={item.label + idx} className="space-y-1">
                                        <button
                                            type="button"
                                            onClick={() => toggleExpand(item.label)}
                                            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                                                isParentActive
                                                    ? 'bg-blue-600/15 text-blue-400 font-semibold'
                                                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className={isParentActive ? 'text-blue-400' : 'text-slate-400'}>
                                                    {item.icon}
                                                </span>
                                                <span>{item.label}</span>
                                            </div>
                                            <svg
                                                className={`w-4 h-4 transition-transform text-slate-400 ${
                                                    isExpanded ? 'rotate-180 text-blue-400' : ''
                                                }`}
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>

                                        {isExpanded && (
                                            <div className="ml-8 pl-3 border-l border-slate-800 space-y-1 py-1">
                                                {item.children?.map((child) => {
                                                    const childActive = pathname === child.href
                                                    return (
                                                        <Link
                                                            key={child.href}
                                                            href={child.href}
                                                            className={`block px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                                                childActive
                                                                    ? 'bg-blue-600 text-white font-semibold shadow-sm shadow-blue-500/20'
                                                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                                                            }`}
                                                        >
                                                            {child.label}
                                                        </Link>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )
                            }

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href!}
                                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                                        isSelfActive
                                            ? 'bg-blue-600 text-white font-semibold shadow-lg shadow-blue-600/30'
                                            : 'text-slate-300 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    <span className={isSelfActive ? 'text-white' : 'text-slate-400'}>
                                        {item.icon}
                                    </span>
                                    <span>{item.label}</span>
                                </Link>
                            )
                        })}
                    </div>
                </div>

                {/* Bottom Profile & Business Pill Card */}
                <div className="p-3 border-t border-slate-800/80 bg-[#080d1d] space-y-2.5">
                    {/* Business Card */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xs flex-shrink-0">
                                {initial}
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-white truncate">
                                    {businessName || 'Bisnis Anda'}
                                </p>
                                <span className="inline-block text-[10px] font-bold text-blue-400 tracking-wide uppercase">
                                    {subscriptionStatus === 'active' ? 'Pro Plan' : isExpired ? 'Expired' : `Trial (${daysRemaining}h)`}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* User Profile & Logout */}
                    <div className="flex items-center justify-between px-2 pt-1">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-300 text-xs font-bold flex-shrink-0">
                                {userInitial}
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-200 truncate" title={userName}>
                                    {userName}
                                </p>
                                <p className="text-[10px] text-slate-400 capitalize">
                                    {isOwner ? 'Owner' : branchName || 'Pegawai'}
                                </p>
                            </div>
                        </div>

                        <form
                            action="/api/auth/signout"
                            method="post"
                            onSubmit={(e) => {
                                if (!confirm('Keluar dari akun?')) e.preventDefault()
                            }}
                        >
                            <button
                                type="submit"
                                title="Keluar"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                            </button>
                        </form>
                    </div>
                </div>
            </aside>

            {/* ── Top Header on Desktop & Mobile ── */}
            <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 backdrop-blur-md px-4 sm:px-8 sm:left-64 shadow-xs">
                {/* Search Bar */}
                <div className="flex items-center flex-1 max-w-md">
                    <div className="relative w-full">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <SearchIcon />
                        </div>
                        <input
                            type="text"
                            placeholder="Cari transaksi, produk, atau laporan..."
                            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
                        />
                    </div>
                </div>

                {/* Right Header items */}
                <div className="flex items-center gap-3 sm:gap-4 ml-4">
                    {/* Notifications */}
                    <div className="relative cursor-pointer p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition">
                        <BellIcon />
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white"></span>
                    </div>

                    {/* User profile dropdown button */}
                    <Link
                        href="/dashboard/profil"
                        className="flex items-center gap-2.5 pl-3 border-l border-slate-200 group"
                    >
                        <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 font-bold text-xs shadow-xs group-hover:ring-2 group-hover:ring-blue-400 transition-all">
                            {userInitial}
                        </div>
                        <div className="hidden md:block text-left">
                            <p className="text-xs font-semibold text-slate-800 leading-tight group-hover:text-blue-600 transition">
                                {userName}
                            </p>
                            <p className="text-[10px] text-slate-400 capitalize">
                                {isOwner ? 'Owner' : branchName || 'Pegawai'}
                            </p>
                        </div>
                    </Link>
                </div>
            </header>

            {/* ── Mobile Floating Bottom Bar ── */}
            <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around h-16 border-t border-slate-200 bg-white/95 backdrop-blur-md px-2 sm:hidden shadow-xl">
                <Link
                    href="/dashboard"
                    className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] transition ${
                        pathname === '/dashboard' ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-700'
                    }`}
                >
                    <HomeIcon />
                    <span>Beranda</span>
                </Link>

                <Link
                    href="/dashboard/penjualan/riwayat"
                    className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] transition ${
                        pathname.startsWith('/dashboard/penjualan/riwayat') ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-700'
                    }`}
                >
                    <TransaksiIcon />
                    <span>Transaksi</span>
                </Link>

                {/* Center Floating Action Button (Kasir / Tambah Transaksi) */}
                <div className="relative -top-4 flex items-center justify-center">
                    <Link
                        href="/dashboard/penjualan"
                        title="Buka Kasir"
                        className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/40 hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                    </Link>
                </div>

                <Link
                    href="/dashboard/keuangan"
                    className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] transition ${
                        pathname.startsWith('/dashboard/keuangan') ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-700'
                    }`}
                >
                    <LaporanIcon />
                    <span>Laporan</span>
                </Link>

                <Link
                    href="/dashboard/profil"
                    className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] transition ${
                        pathname.startsWith('/dashboard/profil') ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-700'
                    }`}
                >
                    <PengaturanIcon />
                    <span>Akun</span>
                </Link>
            </nav>
        </>
    )
}