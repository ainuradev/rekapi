'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import ProductTour from '@/components/product-tour'

type NavItem = {
    href?: string
    label: string
    icon: React.ReactNode
    tourId?: string
    children?: { href: string; label: string }[]
}

// ── Icons tailored for the Forest Green theme ──
const HomeIcon = () => (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
)

const KasirIcon = () => (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
)

const TransaksiIcon = () => (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
)

const StokIcon = () => (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
)

const KeuanganIcon = () => (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
)

const PelangganIcon = () => (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
)

const CabangIcon = () => (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
)

const PengaturanIcon = () => (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
)

const ProfilIcon = () => (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
)

import { switchActiveBranch } from './branch-actions'
import {
    markNotificationAsRead,
    markAllNotificationsAsRead,
    getLatestUserNotifications,
    DashboardNotificationItem,
} from './notification-actions'

function formatRelativeTime(dateStr: string): string {
    try {
        const date = new Date(dateStr)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffSec = Math.floor(diffMs / 1000)
        const diffMin = Math.floor(diffSec / 60)
        const diffHour = Math.floor(diffMin / 60)
        const diffDay = Math.floor(diffHour / 24)

        if (diffSec < 60) return 'Baru saja'
        if (diffMin < 60) return `${diffMin} mnt lalu`
        if (diffHour < 24) return `${diffHour} jam lalu`
        if (diffDay === 1) return 'Kemarin'
        if (diffDay < 7) return `${diffDay} hr lalu`

        return date.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
        })
    } catch {
        return '-'
    }
}

interface DashboardNavProps {
    children?: React.ReactNode
    userId?: string
    isOwner: boolean
    userName: string
    activeBranchId?: string
    branchName?: string | null
    branchAddress?: string | null
    businessName?: string | null
    subscriptionStatus?: string
    planName?: string
    trialEndsAt?: string | null
    subscriptionExpiresAt?: string | null
    daysRemaining?: number
    isExpired?: boolean
    branchesList?: { id: string; name: string; address?: string | null; code?: string | null; status?: string | null; is_primary?: boolean }[]
    maxBranches?: number
    isSuperAdminUser?: boolean
    initialNotifications?: DashboardNotificationItem[]
}

export default function DashboardNav({
    children,
    userId,
    isOwner,
    userName,
    activeBranchId = 'all',
    branchName,
    branchAddress,
    businessName,
    subscriptionStatus = 'trial',
    planName = 'Pro',
    trialEndsAt,
    subscriptionExpiresAt,
    daysRemaining: _daysRemaining = 0,
    isExpired: _isExpired = false,
    branchesList = [],
    maxBranches = 5,
    isSuperAdminUser = false,
    initialNotifications = [],
}: DashboardNavProps) {
    const pathname = usePathname()
    const router = useRouter()
    const searchParams = useSearchParams()

    const OWNER_NAV: NavItem[] = [
        { href: '/dashboard', label: 'Dashboard', icon: <HomeIcon /> },
        { href: '/dashboard/penjualan', label: 'Kasir', icon: <KasirIcon />, tourId: 'nav-kasir' },
        { href: '/dashboard/penjualan/riwayat', label: 'Riwayat Transaksi', icon: <TransaksiIcon />, tourId: 'nav-riwayat' },
        {
            label: 'Stok & Bahan',
            icon: <StokIcon />,
            tourId: 'nav-stok',
            children: [
                { href: '/dashboard/produk', label: 'Stok Produk' },
                { href: '/dashboard/bahan-baku', label: 'Bahan Baku & Pembelian' },
                { href: '/dashboard/bahan-baku?tab=supplier', label: 'Data Supplier' },
            ],
        },
        {
            label: 'Keuangan',
            icon: <KeuanganIcon />,
            tourId: 'nav-keuangan',
            children: [
                { href: '/dashboard/keuangan', label: 'Ringkasan Keuangan' },
                { href: '/dashboard/keuangan/laba-rugi', label: 'Laba Rugi' },
                { href: '/dashboard/keuangan/arus-kas', label: 'Arus Kas' },
                { href: '/dashboard/keuangan/neraca', label: 'Neraca Keuangan' },
                { href: '/dashboard/keuangan/beban', label: 'Beban Operasional' },
                { href: '/dashboard/keuangan/utang-piutang', label: 'Utang & Piutang' },
                { href: '/dashboard/keuangan/modal', label: 'Modal Usaha' },
                { href: '/dashboard/keuangan/kas-rekening', label: 'Kas & Rekening' },
            ],
        },
        { href: '/dashboard/pelanggan', label: 'Pelanggan', icon: <PelangganIcon /> },
        { href: '/dashboard/cabang', label: 'Cabang', icon: <CabangIcon />, tourId: 'nav-cabang-pegawai' },
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
        { href: '/dashboard', label: 'Dashboard', icon: <HomeIcon /> },
        { href: '/dashboard/penjualan', label: 'Kasir', icon: <KasirIcon />, tourId: 'nav-kasir' },
        { href: '/dashboard/penjualan/riwayat', label: 'Riwayat Transaksi', icon: <TransaksiIcon />, tourId: 'nav-riwayat' },
        { href: '/dashboard/produk', label: 'Katalog Produk', icon: <StokIcon />, tourId: 'nav-stok' },
        { href: '/dashboard/profil', label: 'Profil Saya', icon: <PengaturanIcon /> },
    ]

    const items = isOwner ? OWNER_NAV : PEGAWAI_NAV

    const checkChildActive = (childHref: string) => {
        const [cleanHref, query] = childHref.split('?')
        if (pathname !== cleanHref) return false
        if (query) {
            const urlParams = new URLSearchParams(query)
            const targetTab = urlParams.get('tab')
            const currentTab = searchParams.get('tab')
            return targetTab === currentTab
        }
        const currentTab = searchParams.get('tab')
        if (currentTab === 'supplier') return false
        return true
    }

    const isActiveParent = (children?: { href: string }[]) => {
        if (!children) return false
        return children.some((child) => checkChildActive(child.href))
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

    const [userMenuOpen, setUserMenuOpen] = useState(false)
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
    const [branchPickerOpen, setBranchPickerOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const searchInputRef = useRef<HTMLInputElement>(null)

    // Interactive Spotlight Product Tour State
    const [tourOpen, setTourOpen] = useState(false)
    const [tourStep, setTourStep] = useState(0)

    const handleAutoOpenTour = useCallback(() => {
        setTourStep(0)
        setTourOpen(true)
    }, [])

    const handleStartTour = () => {
        setUserMenuOpen(false)
        setMobileDrawerOpen(false)
        setNotifDropdownOpen(false)
        setBranchPickerOpen(false)
        setTourStep(0)
        if (pathname !== '/dashboard') {
            router.push('/dashboard')
            window.setTimeout(() => {
                setTourOpen(true)
            }, 350)
        } else {
            setTourOpen(true)
        }
    }

    // Notification Bell & Popover State
    const [localReadIds, setLocalReadIds] = useState<string[]>([])
    const [fetchedAdminNotifs, setFetchedAdminNotifs] = useState<DashboardNotificationItem[] | null>(null)
    const [notifDropdownOpen, setNotifDropdownOpen] = useState(false)
    const [markingAll, setMarkingAll] = useState(false)

    const refreshNotifications = async () => {
        try {
            const res = await getLatestUserNotifications()
            if (!res.error) {
                setFetchedAdminNotifs(res.notifications)
            }
        } catch {
            // Abaikan error jaringan sementara
        }
    }

    useEffect(() => {
        let active = true
        getLatestUserNotifications()
            .then((res) => {
                if (active && !res.error) {
                    setFetchedAdminNotifs(res.notifications)
                }
            })
            .catch(() => {})

        const handleWindowFocus = () => {
            getLatestUserNotifications()
                .then((res) => {
                    if (active && !res.error) {
                        setFetchedAdminNotifs(res.notifications)
                    }
                })
                .catch(() => {})
        }

        window.addEventListener('focus', handleWindowFocus)
        return () => {
            active = false
            window.removeEventListener('focus', handleWindowFocus)
        }
    }, [])

    const systemAlerts = initialNotifications.filter((n) => n.source === 'system')
    const adminBroadcasts = fetchedAdminNotifs ?? initialNotifications.filter((n) => n.source === 'admin')
    const combinedNotifications = [...systemAlerts, ...adminBroadcasts]

    const notifications = combinedNotifications.map((n) => ({
        ...n,
        is_read: n.is_read || localReadIds.includes(n.id),
    }))
    const unreadCount = notifications.filter((n) => !n.is_read).length

    const handleNotificationClick = async (notif: DashboardNotificationItem) => {
        if (!notif.is_read) {
            setLocalReadIds((prev) => (prev.includes(notif.id) ? prev : [...prev, notif.id]))
            await markNotificationAsRead(notif.id)
        }
        setNotifDropdownOpen(false)
        if (notif.action_url) {
            router.push(notif.action_url)
        }
    }

    const handleMarkAllRead = async () => {
        const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id)
        if (unreadIds.length === 0) return

        setLocalReadIds((prev) => Array.from(new Set([...prev, ...unreadIds])))
        setMarkingAll(true)
        await markAllNotificationsAsRead(unreadIds)
        setMarkingAll(false)
    }

    // Keyboard shortcut ⌘K or Ctrl+K to focus search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault()
                searchInputRef.current?.focus()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    const toggleExpand = (label: string) => {
        setExpandedItems((prev) =>
            prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
        )
    }

    // Format Expiry Date e.g. "23 Nov 2026"
    const expiryTarget = subscriptionStatus === 'active' ? subscriptionExpiresAt : trialEndsAt
    let formattedExpiry = '23 Nov 2026'
    if (expiryTarget) {
        try {
            const d = new Date(expiryTarget)
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
            formattedExpiry = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
        } catch {
            formattedExpiry = '23 Nov 2026'
        }
    }

    const handleBranchSelect = async (targetId: string) => {
        setBranchPickerOpen(false)
        try {
            document.cookie = `rekapi_active_branch_id=${targetId}; path=/; max-age=31536000; SameSite=Lax`
            await switchActiveBranch(targetId)
        } catch (err) {
            console.error('Failed to switch active branch:', err)
        }
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href)
            if (url.searchParams.has('branch')) {
                url.searchParams.delete('branch')
                router.push(url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''))
            } else {
                router.refresh()
            }
        } else {
            router.refresh()
        }
    }

    const currentBranchObj = branchesList.find((b) => b.id === activeBranchId)
    const activeBranchDisplay = activeBranchId === 'all'
        ? 'Semua Cabang'
        : currentBranchObj?.name || branchName || (branchesList.length > 0 ? branchesList[0].name : 'Cabang Utama')
    const activeAddressDisplay = activeBranchId === 'all'
        ? 'Konsolidasi Seluruh Outlet'
        : currentBranchObj?.address || branchAddress || (branchesList.length > 0 && branchesList[0].address) || 'Jl. Melati No. 12, Bandung'
    const totalBranchesCount = branchesList.length > 0 ? branchesList.length : 1
    const activeBranchesCount = branchesList.length > 0 ? branchesList.length : 1

    const userInitial = userName.charAt(0).toUpperCase()

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!searchQuery.trim()) return
        const q = searchQuery.toLowerCase()
        if (q.includes('kasir') || q.includes('jual')) router.push('/dashboard/penjualan')
        else if (q.includes('beli') || q.includes('belanja')) router.push('/dashboard/bahan-baku?tab=pembelian')
        else if (q.includes('stok') || q.includes('produk')) router.push('/dashboard/produk')
        else if (q.includes('uang') || q.includes('laba') || q.includes('rugi')) router.push('/dashboard/keuangan')
        else if (q.includes('pelanggan')) router.push('/dashboard/pelanggan')
        else if (q.includes('supplier')) router.push('/dashboard/bahan-baku?tab=supplier')
        else if (q.includes('cabang')) router.push('/dashboard/cabang')
        else router.push(`/dashboard/penjualan/riwayat?q=${encodeURIComponent(searchQuery)}`)
    }

    return (
        <>
            {/* ── Desktop: Left Sidebar (Deep Forest Pine Green #06281b) ── */}
            <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col justify-between bg-[#06281b] text-white z-40 sm:flex shadow-2xl border-r border-[#093d2a]">
                <div className="flex flex-col flex-1 overflow-y-auto px-4 py-5 scrollbar-thin scrollbar-thumb-emerald-950">
                    {/* Brand Header */}
                    <div className="px-2 pb-5 flex items-center justify-between">
                        <Link href="/dashboard" className="flex items-center gap-2.5 group">
                            <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                                <Image
                                    src="/logo.png?v=2"
                                    alt="Logo Rekapi"
                                    width={36}
                                    height={36}
                                    className="w-full h-full object-contain"
                                    priority
                                    unoptimized
                                />
                            </div>
                            <span className="text-xl font-bold tracking-tight text-white flex items-center font-sans">
                                Rekapi
                            </span>
                        </Link>
                        {isSuperAdminUser && (
                            <Link
                                href="/admin"
                                className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition"
                            >
                                Admin
                            </Link>
                        )}
                    </div>

                    {/* Navigation Items */}
                    <nav className="space-y-1">
                        {items.map((item, idx) => {
                            const hasChildren = item.children && item.children.length > 0
                            const isExpanded = expandedItems.includes(item.label)
                            const isParentActive = isActiveParent(item.children)
                            const isSelfActive =
                                item.href === '/dashboard'
                                    ? pathname === '/dashboard'
                                    : item.href
                                        ? pathname === item.href || pathname.startsWith(item.href + '/')
                                        : false

                            if (hasChildren) {
                                return (
                                    <div key={item.label + idx} data-tour={item.tourId} className="space-y-1">
                                        <button
                                            type="button"
                                            onClick={() => toggleExpand(item.label)}
                                            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${isParentActive
                                                ? 'bg-[#0f4a33] text-white font-semibold'
                                                : 'text-[#94b3a4] hover:text-white hover:bg-white/5'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className={isParentActive ? 'text-emerald-400' : 'text-[#94b3a4]'}>
                                                    {item.icon}
                                                </span>
                                                <span>{item.label}</span>
                                            </div>
                                            <svg
                                                className={`w-3.5 h-3.5 transition-transform text-[#94b3a4] ${isExpanded ? 'rotate-180 text-white' : ''
                                                    }`}
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>

                                        {isExpanded && (
                                            <div className="ml-5 pl-3 border-l border-[#0e442f] space-y-1 py-1">
                                                {item.children?.map((child) => {
                                                    const childActive = checkChildActive(child.href)
                                                    return (
                                                        <Link
                                                            key={child.href}
                                                            href={child.href}
                                                            className={`block px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${childActive
                                                                ? 'bg-emerald-600/30 text-emerald-300 font-semibold'
                                                                : 'text-[#84a595] hover:text-white hover:bg-white/5'
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
                                    data-tour={item.tourId}
                                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${isSelfActive
                                        ? 'bg-[#0f4a33] text-white font-semibold shadow-xs'
                                        : 'text-[#94b3a4] hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    <span className={isSelfActive ? 'text-emerald-400' : 'text-[#94b3a4]'}>
                                        {item.icon}
                                    </span>
                                    <span>{item.label}</span>
                                </Link>
                            )
                        })}
                    </nav>
                </div>

                {/* Bottom Plan Card & Branch Info Card (Exact match with mockup) */}
                <div className="p-3 bg-[#041f15] border-t border-[#093d2a] space-y-2.5">
                    {/* Subscription Status Card */}
                    <Link
                        href="/dashboard/subscription"
                        className="block p-3 rounded-xl bg-[#06281b] border border-[#0e442f] hover:border-emerald-500/40 transition group"
                    >
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wide">
                                {planName}
                            </span>
                        </div>
                        <p className="text-xs font-medium text-slate-200">
                            Sampai {formattedExpiry}
                        </p>
                        <p className="text-[10px] text-[#84a595] mt-0.5">
                            {totalBranchesCount} cabang • {activeBranchesCount}/{maxBranches} cabang aktif
                        </p>
                    </Link>

                    {/* Branch Location Card */}
                    <div className="p-3 rounded-xl bg-[#06281b] border border-[#0e442f]">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-1">
                            <span className="text-emerald-400">
                                <CabangIcon />
                            </span>
                            <span className="truncate">{activeBranchDisplay}</span>
                        </div>
                        <p className="text-[10px] text-[#84a595] truncate mb-2">
                            {activeAddressDisplay}
                        </p>
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-400">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span>Online</span>
                        </div>
                    </div>

                    {/* Quick Logout Button directly in sidebar */}
                    <form
                        action="/api/auth/signout"
                        method="post"
                        onSubmit={(e) => {
                            if (!confirm('Yakin ingin keluar dari akun?')) e.preventDefault()
                        }}
                        className="pt-0.5"
                    >
                        <button
                            type="submit"
                            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-rose-300 hover:text-white hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                        >
                            <span className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                <span>Keluar Akun</span>
                            </span>
                            <span className="text-[10px] text-rose-400/80">Logout →</span>
                        </button>
                    </form>
                </div>
            </aside>

            {/* ── Right Main Column (Header + Content) ── */}
            <div className="sm:pl-64 flex-1 min-w-0 max-w-full w-full flex flex-col min-h-screen">
                {/* ── Top Header on Desktop & Mobile ── */}
                <header className="sticky top-0 z-30 h-16 w-full bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
                    {/* Left: Mobile hamburger & Branch Selector Pill */}
                    <div className="flex items-center gap-2 min-w-0 shrink">
                        <button
                            type="button"
                            onClick={() => setMobileDrawerOpen(true)}
                            className="sm:hidden p-1.5 -ml-1 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer shrink-0"
                            aria-label="Buka Menu Navigasi"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>

                        {/* Branch Selector Dropdown (Owner) or Static Badge (Pegawai) */}
                        {isOwner ? (
                            <div data-tour="branch-selector" className="relative min-w-0 max-w-full">
                                <button
                                    type="button"
                                    onClick={() => setBranchPickerOpen(!branchPickerOpen)}
                                    className="min-w-0 max-w-full flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 transition cursor-pointer shadow-xs"
                                >
                                    <span className="text-emerald-700 shrink-0">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                        </svg>
                                    </span>
                                    <span className="truncate max-w-[130px] sm:max-w-[200px]">{activeBranchDisplay}</span>
                                    {activeBranchId === 'all' && (
                                        <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80 shrink-0">
                                            Konsolidasi
                                        </span>
                                    )}
                                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {branchPickerOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setBranchPickerOpen(false)} />
                                        <div className="absolute left-0 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white py-2 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
                                            <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pilih Cabang</p>
                                                <span className="text-[10px] text-emerald-700 font-semibold">{branchesList.length} Cabang</span>
                                            </div>
                                            <div className="max-h-64 overflow-y-auto py-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleBranchSelect('all')}
                                                    className={`w-full text-left px-3 py-2.5 hover:bg-emerald-50/70 flex items-center justify-between text-xs transition cursor-pointer ${activeBranchId === 'all' ? 'bg-emerald-50/80 text-emerald-900 font-bold' : ''
                                                        }`}
                                                >
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-slate-800">Semua Cabang (Konsolidasi)</p>
                                                        <p className="text-[10px] text-slate-500">Seluruh Outlet Aktif</p>
                                                    </div>
                                                    {activeBranchId === 'all' && (
                                                        <span className="text-emerald-700 font-bold ml-2">✓</span>
                                                    )}
                                                </button>

                                                {branchesList.map((b, idx) => {
                                                    const isPrimary = b.is_primary ?? (idx === 0 || b.code === 'PUSAT' || b.name.toLowerCase().includes('cabang utama') || b.name.toLowerCase().includes('pusat'))
                                                    const isInactive = b.status && b.status !== 'active'
                                                    return (
                                                        <button
                                                            key={b.id}
                                                            type="button"
                                                            disabled={Boolean(isInactive)}
                                                            onClick={() => {
                                                                if (isInactive) {
                                                                    alert(`Cabang "${b.name}" sedang nonaktif. Aktifkan cabang terlebih dahulu di menu Cabang untuk menggunakannya.`)
                                                                    return
                                                                }
                                                                handleBranchSelect(b.id)
                                                            }}
                                                            title={isInactive ? 'Cabang sedang nonaktif. Aktifkan di menu Cabang untuk menggunakannya.' : undefined}
                                                            className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs transition ${
                                                                isInactive
                                                                    ? 'opacity-50 bg-slate-50/50 cursor-not-allowed'
                                                                    : 'hover:bg-emerald-50/70 cursor-pointer'
                                                            } ${activeBranchId === b.id ? 'bg-emerald-50/80 text-emerald-900 font-bold' : ''}`}
                                                        >
                                                            <div className="min-w-0 flex-1 pr-2">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <p className={`font-semibold truncate ${isInactive ? 'text-slate-400' : 'text-slate-800'}`}>{b.name}</p>
                                                                    {isPrimary && (
                                                                        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200/80 px-1 py-0.2 rounded shrink-0">
                                                                            Utama / Pusat
                                                                        </span>
                                                                    )}
                                                                    {isInactive && (
                                                                        <span className="text-[9px] font-medium text-rose-700 bg-rose-50 border border-rose-200/80 px-1 py-0.2 rounded shrink-0">
                                                                            Nonaktif
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {b.address && <p className="text-[10px] text-slate-400 truncate">{b.address}</p>}
                                                            </div>
                                                            {activeBranchId === b.id && (
                                                                <span className="text-emerald-700 font-bold ml-1 shrink-0">✓</span>
                                                            )}
                                                        </button>
                                                    )
                                                })}

                                                {branchesList.length === 0 && (
                                                    <div className="px-3 py-2 text-xs text-slate-500">Cabang Utama</div>
                                                )}
                                            </div>
                                            <div className="border-t border-slate-100 pt-1 px-1">
                                                <Link
                                                    href="/dashboard/cabang"
                                                    onClick={() => setBranchPickerOpen(false)}
                                                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                    </svg>
                                                    <span>Kelola / Tambah Cabang</span>
                                                </Link>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="min-w-0 max-w-full flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-emerald-200/70 bg-emerald-50/60 text-xs font-medium text-emerald-950 shadow-2xs">
                                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse shrink-0" />
                                <span className="font-semibold text-slate-900 truncate max-w-[130px] sm:max-w-[200px]">
                                    {activeBranchDisplay}
                                </span>
                                <span className="hidden sm:inline text-slate-300">|</span>
                                <span className="hidden sm:inline-flex text-[10px] font-bold text-emerald-800 uppercase tracking-wider whitespace-nowrap">
                                    Kasir / Pegawai
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Center: Search Bar with ⌘ K */}
                    <form onSubmit={handleSearchSubmit} className="hidden md:flex flex-1 max-w-md mx-2 min-w-0">
                        <div className="relative w-full">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Cari menu, produk, atau transaksi..."
                                className="w-full pl-9 pr-14 py-2 text-xs rounded-xl bg-slate-50/90 border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                            />
                            <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
                                <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 rounded-md shadow-2xs">
                                    ⌘ K
                                </kbd>
                            </div>
                        </div>
                    </form>

                    {/* Right: Notifications & User Profile */}
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
                        {/* Notification Bell Dropdown */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => {
                                    const nextOpen = !notifDropdownOpen
                                    setNotifDropdownOpen(nextOpen)
                                    if (nextOpen) {
                                        refreshNotifications()
                                    }
                                }}
                                title="Notifikasi & Pengumuman"
                                className="p-1.5 sm:p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition block relative cursor-pointer focus:outline-none"
                                aria-label="Notifikasi & Pengumuman"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                                {unreadCount > 0 && (
                                    <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 ring-2 ring-white"></span>
                                    </span>
                                )}
                            </button>

                            {/* Dropdown Popover (Responsive Mobile 360px & Desktop) */}
                            {notifDropdownOpen && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setNotifDropdownOpen(false)}
                                    />
                                    <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-96 sm:max-w-sm rounded-2xl border border-slate-200 bg-white shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150 overflow-hidden flex flex-col max-h-[80vh] sm:max-h-[85vh]">
                                        {/* Header */}
                                        <div className="shrink-0 px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-xs sm:text-sm text-slate-900">
                                                    Notifikasi & Pengumuman
                                                </h3>
                                                {unreadCount > 0 && (
                                                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                        {unreadCount} baru
                                                    </span>
                                                )}
                                            </div>

                                            {unreadCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={handleMarkAllRead}
                                                    disabled={markingAll}
                                                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 transition cursor-pointer disabled:opacity-50"
                                                >
                                                    {markingAll ? 'Memproses...' : 'Tandai Semua Dibaca'}
                                                </button>
                                            )}
                                        </div>

                                        {/* Body Notification List */}
                                        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 min-h-0">
                                            {notifications.length === 0 ? (
                                                <div className="p-8 text-center">
                                                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                                        </svg>
                                                    </div>
                                                    <p className="text-xs font-semibold text-slate-700">Tidak ada notifikasi baru</p>
                                                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                                                        Pengumuman resmi dari Admin Rekapi dan notifikasi sistem toko akan muncul di sini.
                                                    </p>
                                                </div>
                                            ) : (
                                                notifications.map((item) => {
                                                    const isAdmin = item.source === 'admin'
                                                    return (
                                                        <div
                                                            key={item.id}
                                                            onClick={() => handleNotificationClick(item)}
                                                            className={`p-3.5 transition cursor-pointer flex items-start gap-3 ${
                                                                item.is_read
                                                                    ? 'bg-white hover:bg-slate-50/80 text-slate-600'
                                                                    : 'bg-emerald-50/30 hover:bg-emerald-50/60 text-slate-900 font-medium'
                                                            }`}
                                                        >
                                                            {/* Status Unread Dot */}
                                                            <div className="pt-1 shrink-0">
                                                                {!item.is_read ? (
                                                                    <span className="block w-2 h-2 rounded-full bg-emerald-600 ring-2 ring-emerald-200"></span>
                                                                ) : (
                                                                    <span className="block w-2 h-2 rounded-full bg-slate-300"></span>
                                                                )}
                                                            </div>

                                                            {/* Content */}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                                    <span
                                                                        className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                                                                            isAdmin
                                                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                                                : 'bg-amber-50 text-amber-800 border-amber-200'
                                                                        }`}
                                                                    >
                                                                        {isAdmin ? 'ADMIN REKAPI' : 'SISTEM TOKO'}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-400 font-normal shrink-0">
                                                                        {formatRelativeTime(item.created_at)}
                                                                    </span>
                                                                </div>

                                                                <h4
                                                                    className={`text-xs leading-snug line-clamp-1 ${
                                                                        item.is_read ? 'font-medium text-slate-800' : 'font-bold text-slate-900'
                                                                    }`}
                                                                >
                                                                    {item.title}
                                                                </h4>

                                                                <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                                                                    {item.message}
                                                                </p>

                                                                {item.action_url && (
                                                                    <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                                                                        <span>Buka Tautan</span>
                                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                        </svg>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* User profile dropdown */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setUserMenuOpen(!userMenuOpen)}
                                className="flex items-center gap-1.5 sm:gap-2.5 pl-1.5 sm:pl-3 border-l border-slate-200 group cursor-pointer focus:outline-none"
                            >
                                <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 font-bold text-xs shadow-xs group-hover:ring-2 group-hover:ring-emerald-400 transition-all shrink-0">
                                    {userInitial}
                                </div>
                                <div className="hidden md:block text-left min-w-0">
                                    <p className="text-xs font-semibold text-slate-800 leading-tight group-hover:text-emerald-700 transition truncate max-w-[140px] lg:max-w-[200px]">
                                        {userName}
                                    </p>
                                    <p className="text-[10px] text-slate-400 capitalize">
                                        {isOwner ? 'Owner' : 'Kasir'}
                                    </p>
                                </div>
                                <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {userMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                                    <div className="absolute right-0 mt-2 w-60 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 bg-white py-2 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-right">
                                        <div className="px-4 py-2.5 border-b border-slate-100">
                                            <p className="text-xs font-bold text-slate-900 truncate">{userName}</p>
                                            <p className="text-[11px] text-slate-500 capitalize">{isOwner ? 'Owner Bisnis' : 'Kasir'}</p>
                                            {businessName && <p className="text-[10px] text-emerald-600 font-medium truncate mt-0.5">{businessName}</p>}
                                        </div>

                                        <div className="py-1">
                                            <Link
                                                href="/dashboard/profil"
                                                onClick={() => setUserMenuOpen(false)}
                                                className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-emerald-700 transition"
                                            >
                                                <PengaturanIcon />
                                                <span>Pengaturan Profil</span>
                                            </Link>
                                            <button
                                                type="button"
                                                onClick={handleStartTour}
                                                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-emerald-700 transition cursor-pointer text-left"
                                            >
                                                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                                </svg>
                                                <span>Panduan Aplikasi</span>
                                            </button>
                                            {isOwner && (
                                                <Link
                                                    href="/dashboard/subscription"
                                                    onClick={() => setUserMenuOpen(false)}
                                                    className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-emerald-700 transition"
                                                >
                                                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                                    </svg>
                                                    <span>Paket Langganan</span>
                                                </Link>
                                            )}
                                            {isSuperAdminUser && (
                                                <Link
                                                    href="/admin"
                                                    onClick={() => setUserMenuOpen(false)}
                                                    className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition"
                                                >
                                                    <svg className="w-4 h-4 text-emerald-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                    </svg>
                                                    <span>Portal Super Admin</span>
                                                </Link>
                                            )}
                                        </div>

                                        <div className="border-t border-slate-100 pt-1">
                                            <form
                                                action="/api/auth/signout"
                                                method="post"
                                                onSubmit={(e) => {
                                                    if (!confirm('Yakin ingin keluar dari akun?')) e.preventDefault()
                                                }}
                                            >
                                                <button
                                                    type="submit"
                                                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition cursor-pointer text-left"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                                    </svg>
                                                    <span>Keluar / Logout</span>
                                                </button>
                                            </form>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {children}
            </div>

            {/* ── Mobile Floating Bottom Bar (Disembunyikan di halaman Kasir agar tidak double floating bar) ── */}
            {pathname !== '/dashboard/penjualan' && (
                <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around h-16 border-t border-slate-200 bg-white/95 backdrop-blur-md px-2 sm:hidden shadow-xl">
                    <Link
                        href="/dashboard"
                        className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] transition ${pathname === '/dashboard' ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-slate-700'
                            }`}
                    >
                        <HomeIcon />
                        <span>Dashboard</span>
                    </Link>

                    {/* Tab 2: Riwayat Transaksi */}
                    <Link
                        href="/dashboard/penjualan/riwayat"
                        className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] transition ${pathname.startsWith('/dashboard/penjualan/riwayat') ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-slate-700'
                            }`}
                    >
                        <TransaksiIcon />
                        <span>Riwayat</span>
                    </Link>

                    {/* Center Floating Action Button (Kasir / Transaksi Baru) */}
                    <div className="relative -top-4 flex items-center justify-center">
                        <Link
                            href="/dashboard/penjualan"
                            title="Buka Kasir"
                            className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/40 hover:bg-emerald-700 hover:scale-105 active:scale-95 transition-all"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                        </Link>
                    </div>

                    {/* Tab 4: Keuangan (Owner) atau Stok (Pegawai) */}
                    {isOwner ? (
                        <Link
                            href="/dashboard/keuangan"
                            className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] transition ${pathname.startsWith('/dashboard/keuangan')
                                ? 'text-emerald-700 font-bold'
                                : 'text-slate-400 hover:text-slate-700'
                                }`}
                        >
                            <KeuanganIcon />
                            <span>Keuangan</span>
                        </Link>
                    ) : (
                        <Link
                            href="/dashboard/produk"
                            className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] transition ${pathname.startsWith('/dashboard/produk')
                                ? 'text-emerald-700 font-bold'
                                : 'text-slate-400 hover:text-slate-700'
                                }`}
                        >
                            <StokIcon />
                            <span>Produk</span>
                        </Link>
                    )}

                    {/* Tab 5: Profil */}
                    <Link
                        href="/dashboard/profil"
                        className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] transition ${pathname.startsWith('/dashboard/profil') ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-slate-700'
                            }`}
                    >
                        <ProfilIcon />
                        <span>Profil</span>
                    </Link>
                </nav>
            )}

            {/* ── Mobile Slide-Over Drawer ── */}
            {mobileDrawerOpen && (
                <div className="fixed inset-0 z-50 sm:hidden">
                    <div
                        className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
                        onClick={() => setMobileDrawerOpen(false)}
                    />

                    <div className="fixed inset-y-0 left-0 w-[84%] max-w-xs bg-[#06281b] text-white shadow-2xl flex flex-col justify-between z-50 animate-in slide-in-from-left duration-200 border-r border-[#093d2a]">
                        <div className="px-5 py-5 border-b border-[#0e442f] flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center shrink-0">
                                    <Image
                                        src="/logo.png?v=2"
                                        alt="Logo Rekapi"
                                        width={32}
                                        height={32}
                                        className="w-full h-full object-contain"
                                        unoptimized
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg font-bold tracking-tight text-white block leading-tight">
                                            Rekapi
                                        </span>
                                        {isSuperAdminUser && (
                                            <Link
                                                href="/admin"
                                                onClick={() => setMobileDrawerOpen(false)}
                                                className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                            >
                                                Admin
                                            </Link>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-[#84a595] block">
                                        {isOwner ? 'Owner Bisnis' : 'Kasir'}
                                    </span>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setMobileDrawerOpen(false)}
                                className="p-2 rounded-xl text-[#84a595] hover:text-white hover:bg-white/5 transition cursor-pointer"
                                aria-label="Tutup Menu"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
                            {items.map((item, idx) => {
                                const hasChildren = item.children && item.children.length > 0
                                const isExpanded = expandedItems.includes(item.label)
                                const isParentActive = isActiveParent(item.children)

                                if (hasChildren) {
                                    return (
                                        <div key={idx} data-tour={item.tourId} className="space-y-1">
                                            <button
                                                type="button"
                                                onClick={() => toggleExpand(item.label)}
                                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${isParentActive
                                                    ? 'bg-[#0f4a33] text-white font-semibold'
                                                    : 'text-[#94b3a4] hover:bg-white/5 hover:text-white'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className={isParentActive ? 'text-emerald-400' : 'text-[#94b3a4]'}>
                                                        {item.icon}
                                                    </span>
                                                    <span>{item.label}</span>
                                                </div>
                                                <svg
                                                    className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-white' : 'text-[#94b3a4]'
                                                        }`}
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>

                                            {isExpanded && (
                                                <div className="pl-8 pr-2 py-1 space-y-1">
                                                    {item.children?.map((child, cIdx) => {
                                                        const isChildActive = checkChildActive(child.href)
                                                        return (
                                                            <Link
                                                                key={cIdx}
                                                                href={child.href}
                                                                onClick={() => setMobileDrawerOpen(false)}
                                                                className={`block px-3 py-1.5 rounded-lg text-xs font-medium transition ${isChildActive
                                                                    ? 'bg-emerald-600/30 text-emerald-300 font-semibold'
                                                                    : 'text-[#84a595] hover:bg-white/5 hover:text-white'
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

                                const isActive =
                                    item.href === '/dashboard'
                                        ? pathname === '/dashboard'
                                        : item.href
                                            ? pathname === item.href || pathname.startsWith(item.href + '/')
                                            : false

                                return (
                                    <Link
                                        key={idx}
                                        href={item.href || '#'}
                                        data-tour={item.tourId}
                                        onClick={() => setMobileDrawerOpen(false)}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition ${isActive
                                            ? 'bg-[#0f4a33] text-white font-semibold shadow-xs'
                                            : 'text-[#94b3a4] hover:bg-white/5 hover:text-white'
                                            }`}
                                    >
                                        <span className={isActive ? 'text-emerald-400' : 'text-[#94b3a4]'}>
                                            {item.icon}
                                        </span>
                                        <span>{item.label}</span>
                                    </Link>
                                )
                            })}
                        </div>

                        {/* Footer cards in mobile drawer */}
                        <div className="p-3 border-t border-[#0e442f] bg-[#041f15] space-y-2">
                            <button
                                type="button"
                                onClick={handleStartTour}
                                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/25 text-xs font-semibold transition cursor-pointer"
                            >
                                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                                <span>Panduan Aplikasi</span>
                            </button>

                            <div className="p-2.5 rounded-xl bg-[#06281b] border border-[#0e442f]">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
                                        {planName}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        <span>Online</span>
                                    </span>
                                </div>
                                <p className="text-[11px] text-white font-medium truncate">{activeBranchDisplay}</p>
                            </div>

                            <form
                                action="/api/auth/signout"
                                method="post"
                                onSubmit={(e) => {
                                    if (!confirm('Yakin ingin keluar dari akun?')) e.preventDefault()
                                }}
                            >
                                <button
                                    type="submit"
                                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold transition cursor-pointer"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                    <span>Keluar dari Akun</span>
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Interactive Spotlight Product Tour ── */}
            <ProductTour
                userId={userId}
                isOwner={isOwner}
                isOpen={tourOpen}
                currentStep={tourStep}
                onStepChange={setTourStep}
                onClose={() => setTourOpen(false)}
                onOpen={handleAutoOpenTour}
                onToggleMobileDrawer={setMobileDrawerOpen}
                isDashboardHome={pathname === '/dashboard'}
            />
        </>
    )
}