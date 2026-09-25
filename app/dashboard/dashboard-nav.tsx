'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

type NavItem = {
    href?: string
    label: string
    icon: string
    children?: NavItem[]
}

const OWNER_NAV: NavItem[] = [
    { href: '/dashboard', label: 'Beranda', icon: '🏠' },
    {
        label: 'Transaksi',
        icon: '🧾',
        children: [
            { href: '/dashboard/penjualan', label: 'Kasir', icon: '💳' },
            { href: '/dashboard/penjualan/riwayat', label: 'Riwayat', icon: '📋' },
        ],
    },
    {
        label: 'Inventori',
        icon: '📦',
        children: [
            { href: '/dashboard/produk', label: 'Produk', icon: '🛍️' },
            { href: '/dashboard/bahan-baku', label: 'Bahan Baku', icon: '🥬' },
        ],
    },
    {
        label: 'Manajemen',
        icon: '🏢',
        children: [
            { href: '/dashboard/keuangan', label: 'Keuangan', icon: '💵' },
            { href: '/dashboard/cabang', label: 'Cabang', icon: '🏪' },
            { href: '/dashboard/pegawai', label: 'Pegawai', icon: '👥' },
        ],
    },
    { href: '/dashboard/subscription', label: 'Langganan', icon: '⭐' },
]

const PEGAWAI_NAV: NavItem[] = [
    { href: '/dashboard/penjualan', label: 'Kasir', icon: '🧾' },
    { href: '/dashboard/penjualan/riwayat', label: 'Riwayat', icon: '📋' },
]

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
    const items = isOwner ? OWNER_NAV : PEGAWAI_NAV

    const isActiveParent = (children?: NavItem[]) => {
        if (!children) return false
        return children.some((child) => child.href === pathname)
    }

    // Auto-expand parent menu if child is active
    const getInitialExpanded = () => {
        const expanded: string[] = []
        items.forEach((item) => {
            if (item.children && isActiveParent(item.children)) {
                expanded.push(item.label)
            }
        })
        return expanded
    }

    const [expandedItems, setExpandedItems] = useState<string[]>(getInitialExpanded)

    const toggleExpand = (label: string) => {
        setExpandedItems((prev) =>
            prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
        )
    }

    return (
        <>
            {/* ── Mobile: Top Header ── */}
            <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm sm:hidden">
                <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white text-sm shadow-sm">
                        ⚡
                    </span>
                    <div>
                        <span className="font-bold text-slate-900 tracking-tight text-sm">Rekapin</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                                className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                    isOwner
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-blue-50 text-blue-700 border border-blue-200'
                                }`}
                            >
                                {isOwner ? 'Owner' : branchName || 'Pegawai'}
                            </span>
                            {subscriptionStatus === 'trial' && (
                                <span
                                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                        isExpired
                                            ? 'bg-red-100 text-red-700'
                                            : daysRemaining <= 2
                                                ? 'bg-amber-100 text-amber-800'
                                                : 'bg-blue-100 text-blue-700'
                                    }`}
                                >
                                    {isExpired ? 'Trial Expired' : `Trial ${daysRemaining}h`}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {isSuperAdminUser && (
                        <Link
                            href="/admin"
                            className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 transition"
                            title="Buka Portal Super Admin"
                        >
                            <span>👑</span>
                            <span className="hidden xs:inline">Admin</span>
                        </Link>
                    )}

                    <form
                        action="/api/auth/signout"
                        method="post"
                        onSubmit={(e) => {
                            if (!confirm('Yakin ingin keluar dari akun?')) {
                                e.preventDefault()
                            }
                        }}
                    >
                    <button
                        type="submit"
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                    >
                        <span>🚪</span>
                        <span>Keluar</span>
                    </button>
                </form>
                </div>
            </header>

            {/* ── Mobile: Bottom Nav ── */}
            <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white sm:hidden shadow-lg">
                {items.map((item, idx) => {
                    const active = item.href ? pathname === item.href : isActiveParent(item.children)
                    const href = item.href || item.children?.[0]?.href || '#'
                    return (
                        <Link
                            key={item.label + idx}
                            href={href}
                            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[9px] transition ${
                                active
                                    ? 'font-bold text-blue-600'
                                    : 'text-slate-400 hover:text-slate-700'
                            }`}
                        >
                            <span className={`text-lg ${active ? 'scale-110' : ''} transition-transform`}>
                                {item.icon}
                            </span>
                            <span className="truncate max-w-[46px] text-center">{item.label}</span>
                        </Link>
                    )
                })}
            </nav>

            {/* ── Desktop: Sidebar ── */}
            <nav className="fixed inset-y-0 left-0 hidden w-56 flex-col justify-between border-r border-slate-200 bg-white sm:flex">
                {/* Brand */}
                <div>
                    <div className="border-b border-slate-100 p-4">
                        <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white text-sm shadow-sm">
                                ⚡
                            </span>
                            <span className="text-base font-extrabold tracking-tight text-slate-900">
                                Rekapin
                            </span>
                        </div>
                        {businessName && (
                            <p className="mt-1 truncate text-xs text-slate-400">{businessName}</p>
                        )}
                        {subscriptionStatus === 'trial' && (
                            <div
                                className={`mt-2.5 rounded-lg border p-2 text-xs ${
                                    isExpired
                                        ? 'border-red-200 bg-red-50 text-red-700'
                                        : daysRemaining <= 2
                                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                                            : 'border-blue-100 bg-blue-50/80 text-blue-800'
                                }`}
                            >
                                <div className="flex items-center justify-between text-[11px] font-bold">
                                    <span>{isExpired ? '⚠️ Trial Selesai' : '⏱️ Trial 7 Hari'}</span>
                                    <span className="font-extrabold text-[10px]">
                                        {isExpired ? '0 hari' : `${daysRemaining} hari`}
                                    </span>
                                </div>
                                <p className="mt-0.5 text-[10px] text-slate-500">
                                    {isExpired
                                        ? 'Masa uji coba gratis berakhir'
                                        : 'Akses penuh seluruh fitur'}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Nav items */}
                    <div className="space-y-0.5 p-3">
                        {/* Section label */}
                        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                            {isOwner ? 'Menu Utama' : 'Kasir'}
                        </p>
                        {items.map((item, idx) => {
                            const hasChildren = item.children && item.children.length > 0
                            const isExpanded = expandedItems.includes(item.label)
                            const isParentActive = isActiveParent(item.children)
                            const isSelfActive = item.href === pathname

                            if (hasChildren) {
                                return (
                                    <div key={item.label + idx}>
                                        <button
                                            onClick={() => toggleExpand(item.label)}
                                            className={`flex w-full items-center justify-between gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                                                isParentActive
                                                    ? 'bg-blue-50 text-blue-700'
                                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <span className="text-base">{item.icon}</span>
                                                {item.label}
                                            </div>
                                            <span
                                                className={`text-xs transition-transform ${
                                                    isExpanded ? 'rotate-180' : ''
                                                }`}
                                            >
                                                ▼
                                            </span>
                                        </button>
                                        {isExpanded && (
                                            <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-slate-200 pl-2">
                                                {item.children?.map((child) => {
                                                    const childActive = pathname === child.href
                                                    return (
                                                        <Link
                                                            key={child.href}
                                                            href={child.href!}
                                                            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${
                                                                childActive
                                                                    ? 'bg-blue-600 text-white shadow-sm'
                                                                    : 'text-slate-600 hover:bg-slate-100'
                                                            }`}
                                                        >
                                                            <span className="text-sm">{child.icon}</span>
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
                                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                                        isSelfActive
                                            ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                    }`}
                                >
                                    <span className="text-base">{item.icon}</span>
                                    {item.label}
                                </Link>
                            )
                        })}
                    </div>
                </div>

                {/* Footer sidebar: user info & logout */}
                <div className="border-t border-slate-200 bg-slate-50 p-3 space-y-2">
                    {/* User info */}
                    <div className="rounded-lg bg-white border border-slate-200 px-3 py-2.5">
                        <p className="truncate text-xs font-semibold text-slate-900" title={userName}>
                            {userName}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <span
                                className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                    isOwner
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-blue-100 text-blue-700'
                                }`}
                            >
                                {isOwner ? 'Owner' : 'Pegawai'}
                            </span>
                            {branchName && (
                                <span className="truncate text-[11px] text-slate-500" title={branchName}>
                                    {branchName}
                                </span>
                            )}
                        </div>
                    </div>

                    {isSuperAdminUser && (
                        <Link
                            href="/admin"
                            className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100 shadow-2xs"
                        >
                            <span>👑</span>
                            <span>Portal Super Admin</span>
                        </Link>
                    )}

                    {isOwner && (
                        <Link
                            href="/dashboard/profil"
                            className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition cursor-pointer ${
                                pathname === '/dashboard/profil'
                                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                            }`}
                        >
                            <span>⚙️</span>
                            <span>Profil & Pengaturan</span>
                        </Link>
                    )}

                    <form
                        action="/api/auth/signout"
                        method="post"
                        onSubmit={(e) => {
                            if (!confirm('Yakin ingin keluar dari akun?')) {
                                e.preventDefault()
                            }
                        }}
                    >
                        <button
                            type="submit"
                            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        >
                            <span>🚪</span>
                            <span>Keluar / Logout</span>
                        </button>
                    </form>
                </div>
            </nav>
        </>
    )
}