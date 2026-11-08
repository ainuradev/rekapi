'use client'

import { useState, useMemo } from 'react'
import EditSaleModal from './edit-sale-modal'
import AuditTrailModal from './audit-trail-modal'
import InvoiceModal, { type InvoiceData } from '@/components/invoice-modal'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deleteSale, voidSale, recordSalePayment } from './actions'
import {
    getIndonesianPeriodRange,
    getIndonesianDate,
    formatIndonesianDateTime,
    TIMEZONE_INDONESIA,
} from '@/lib/date-utils'

type Sale = {
    id: string
    transaction_date: string
    channel: string
    payment_method: string
    total: number
    status?: string
    payment_status?: string
    paid_amount?: number
    due_date?: string | null
    notes?: string | null
    customer_id?: string | null
    customers?: { name: string; phone?: string | null } | null
    is_edited: boolean
    branch_id: string
    user_id: string
    branches: { name: string } | null
    sale_items: {
        product_id: string
        quantity: number
        branch_stock_deducted?: number | null
        price: number
        cost_price: number
        products: { name: string; unit?: string } | null
    }[]
    sale_payments?: { id: string; amount?: number; payment_date?: string }[]
}

type BranchStockEntry = {
    product_id: string
    branch_id: string
    stock: number
}

type CatalogProductEntry = {
    id: string
    name: string
    selling_price: number
    cost_price: number
    status: string
    stock: number
    unit: string
}

type Period = 'hari_ini' | 'kemarin' | 'minggu_ini' | 'bulan_ini' | 'kustom' | 'semua'

export default function RiwayatClient({
    sales,
    branches = [],
    accounts = [],
    branchStocks = [],
    catalogProducts = [],
    currentUserId,
    isOwner,
    businessName,
    userBranchName,
    initialBranchId = 'all',
    initialStartDate,
    initialEndDate,
}: {
    sales: Sale[]
    branches?: { id: string; name: string }[]
    accounts?: { id: string; name: string; type: string }[]
    branchStocks?: BranchStockEntry[]
    catalogProducts?: CatalogProductEntry[]
    currentUserId: string
    isOwner: boolean
    businessName?: string
    userBranchName?: string | null
    initialBranchId?: string
    initialStartDate?: string
    initialEndDate?: string
}) {
    const router = useRouter()
    const todayStr = getIndonesianDate()

    const [period, setPeriod] = useState<Period>(
        initialStartDate || initialEndDate ? 'kustom' : 'hari_ini'
    )
    const [selectedBranchId, setSelectedBranchId] = useState<string>(initialBranchId || 'all')
    const [customStartDate, setCustomStartDate] = useState<string>(initialStartDate || todayStr)
    const [customEndDate, setCustomEndDate] = useState<string>(initialEndDate || todayStr)
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false)
    const [inputStart, setInputStart] = useState<string>(initialStartDate || todayStr)
    const [inputEnd, setInputEnd] = useState<string>(initialEndDate || todayStr)

    // Mode tampilan: Spreadsheet Excel (default) atau Kartu
    const [viewMode, setViewMode] = useState<'spreadsheet' | 'cards'>('spreadsheet')
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid' | 'partial' | 'voided'>('all')
    const [channelFilter, setChannelFilter] = useState<string>('all')
    const [copiedTrxId, setCopiedTrxId] = useState<string | null>(null)
    const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null)

    const [editingSale, setEditingSale] = useState<Sale | null>(null)
    const [auditSale, setAuditSale] = useState<Sale | null>(null)
    const [deletingSale, setDeletingSale] = useState<Sale | null>(null)
    const [voidReason, setVoidReason] = useState('')
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)
    const [copiedToast, setCopiedToast] = useState(false)

    // State untuk Pembayaran Cicilan / Pelunasan Piutang
    const [payingSale, setPayingSale] = useState<Sale | null>(null)
    const [payAmount, setPayAmount] = useState<number>(0)
    const [payMethod, setPayMethod] = useState<string>('cash')
    const [payAccountId, setPayAccountId] = useState<string>(accounts[0]?.id || '')
    const [payNotes, setPayNotes] = useState<string>('')
    const [payLoading, setPayLoading] = useState(false)
    const [payError, setPayError] = useState<string | null>(null)

    // Filter transaksi berdasarkan cabang (jika owner) dan periode yang dipilih (WIB)
    const filteredSales = useMemo(() => {
        const indonesianToday = getIndonesianPeriodRange('today')
        const indonesianWeek = getIndonesianPeriodRange('week')
        const indonesianMonth = getIndonesianPeriodRange('month')

        const todayStart = new Date(indonesianToday.timestampFrom).getTime()
        const todayEnd = new Date(indonesianToday.timestampTo).getTime()

        // Kemarin (Yesterday)
        const yesterdayObj = new Date()
        yesterdayObj.setDate(yesterdayObj.getDate() - 1)
        const yesterdayStr = getIndonesianDate(yesterdayObj)
        const yesterdayStart = new Date(`${yesterdayStr}T00:00:00+07:00`).getTime()
        const yesterdayEnd = new Date(`${yesterdayStr}T23:59:59.999+07:00`).getTime()

        const weekStart = new Date(indonesianWeek.timestampFrom).getTime()
        const weekEnd = new Date(indonesianWeek.timestampTo).getTime()

        const monthStart = new Date(indonesianMonth.timestampFrom).getTime()
        const monthEnd = new Date(indonesianMonth.timestampTo).getTime()

        const customStart = customStartDate ? new Date(`${customStartDate}T00:00:00+07:00`).getTime() : 0
        const customEnd = customEndDate ? new Date(`${customEndDate}T23:59:59.999+07:00`).getTime() : Infinity

        return sales.filter((sale) => {
            // Filter Cabang untuk Owner
            if (isOwner && selectedBranchId !== 'all' && sale.branch_id !== selectedBranchId) {
                return false
            }

            const saleTime = new Date(sale.transaction_date).getTime()
            if (period === 'hari_ini') {
                return saleTime >= todayStart && saleTime <= todayEnd
            }
            if (period === 'kemarin') {
                return saleTime >= yesterdayStart && saleTime <= yesterdayEnd
            }
            if (period === 'minggu_ini') {
                return saleTime >= weekStart && saleTime <= weekEnd
            }
            if (period === 'bulan_ini') {
                return saleTime >= monthStart && saleTime <= monthEnd
            }
            if (period === 'kustom') {
                return saleTime >= customStart && saleTime <= customEnd
            }
            return true
        })
    }, [sales, period, selectedBranchId, isOwner, customStartDate, customEndDate])

    // Agregasi data rekap (hanya menghitung transaksi yang tidak dibatalkan / non-void)
    const validSales = useMemo(
        () => filteredSales.filter((s) => s.status !== 'voided'),
        [filteredSales]
    )

    const totalOmzet = useMemo(
        () => validSales.reduce((sum, s) => sum + s.total, 0),
        [validSales]
    )

    const totalTransaksi = validSales.length

    const totalItems = useMemo(
        () =>
            validSales.reduce(
                (sum, s) => sum + s.sale_items.reduce((iSum, item) => iSum + item.quantity, 0),
                0
            ),
        [validSales]
    )

    // Owner only metrics
    const totalHpp = useMemo(() => {
        if (!isOwner) return 0
        return validSales.reduce(
            (sum, s) =>
                sum + s.sale_items.reduce((iSum, item) => iSum + (item.cost_price ?? 0) * item.quantity, 0),
            0
        )
    }, [validSales, isOwner])

    const labaKotor = totalOmzet - totalHpp

    // Rincian metode pembayaran & channel
    const paymentStats = useMemo(() => {
        const map: Record<string, { count: number; total: number }> = {}
        for (const s of validSales) {

            const method = s.payment_method || 'lainnya'
            if (!map[method]) map[method] = { count: 0, total: 0 }
            map[method].count += 1
            map[method].total += s.total
        }
        return map
    }, [filteredSales])

    const channelStats = useMemo(() => {
        const map: Record<string, { count: number; total: number }> = {}
        for (const s of filteredSales) {
            const ch = s.channel || 'offline'
            if (!map[ch]) map[ch] = { count: 0, total: 0 }
            map[ch].count += 1
            map[ch].total += s.total
        }
        return map
    }, [filteredSales])

    const topProducts = useMemo(() => {
        const map: Record<string, number> = {}
        for (const s of filteredSales) {
            for (const item of s.sale_items) {
                const name = item.products?.name ?? 'Item'
                map[name] = (map[name] ?? 0) + item.quantity
            }
        }
        return Object.entries(map).sort((a, b) => b[1] - a[1])
    }, [filteredSales])

    // Filter transaksi berdasarkan pencarian teks, status pembayaran, dan channel
    const displayedSales = useMemo(() => {
        return filteredSales.filter((sale) => {
            if (statusFilter === 'voided' && sale.status !== 'voided') return false
            if (statusFilter === 'paid' && (sale.status === 'voided' || sale.payment_status !== 'paid')) return false
            if (statusFilter === 'unpaid' && (sale.status === 'voided' || sale.payment_status !== 'unpaid')) return false
            if (statusFilter === 'partial' && (sale.status === 'voided' || sale.payment_status !== 'partial')) return false

            if (channelFilter !== 'all' && sale.channel.toLowerCase() !== channelFilter.toLowerCase()) return false

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim()
                const trxCode = `#TRX-${sale.id.slice(0, 4)}`.toLowerCase()
                const fullId = sale.id.toLowerCase()
                const customerName = (sale.customers?.name || '').toLowerCase()
                const customerPhone = (sale.customers?.phone || '').toLowerCase()
                const branchName = (sale.branches?.name || '').toLowerCase()
                const channel = (sale.channel || '').toLowerCase()
                const paymentMethod = (sale.payment_method || '').toLowerCase()
                const itemsMatch = sale.sale_items.some((it) =>
                    (it.products?.name || '').toLowerCase().includes(q)
                )

                const matches =
                    trxCode.includes(q) ||
                    fullId.includes(q) ||
                    customerName.includes(q) ||
                    customerPhone.includes(q) ||
                    branchName.includes(q) ||
                    channel.includes(q) ||
                    paymentMethod.includes(q) ||
                    itemsMatch

                if (!matches) return false
            }

            return true
        })
    }, [filteredSales, statusFilter, channelFilter, searchQuery])

    const displayedValidSales = useMemo(
        () => displayedSales.filter((s) => s.status !== 'voided'),
        [displayedSales]
    )

    const displayedTotalOmzet = useMemo(
        () => displayedValidSales.reduce((sum, s) => sum + s.total, 0),
        [displayedValidSales]
    )

    const displayedTotalHpp = useMemo(() => {
        if (!isOwner) return 0
        return displayedValidSales.reduce(
            (sum, s) =>
                sum + s.sale_items.reduce((iSum, item) => iSum + (item.cost_price ?? 0) * item.quantity, 0),
            0
        )
    }, [displayedValidSales, isOwner])

    const displayedLabaKotor = displayedTotalOmzet - displayedTotalHpp

    const handleCopyTrx = (id: string) => {
        const text = `#TRX-${id.slice(0, 4).toUpperCase()}`
        if (typeof window !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(text)
            setCopiedTrxId(id)
            setTimeout(() => setCopiedTrxId(null), 2000)
        }
    }

    const handleOpenReceipt = (sale: Sale) => {
        const branchTitle = sale.branches?.name ?? userBranchName ?? 'Cabang Utama'
        const dateStr = formatIndonesianDateTime(sale.transaction_date)
        const invData: InvoiceData = {
            invoiceNumber: `INV-${sale.id.slice(0, 8).toUpperCase()}`,
            date: dateStr,
            businessName: businessName || 'Bisnis Anda',
            branchName: branchTitle,
            items: sale.sale_items.map((it) => ({
                name: it.products?.name || 'Item',
                quantity: it.quantity,
                price: it.price,
                subtotal: it.quantity * it.price,
            })),
            subtotal: sale.total,
            total: sale.total,
            paymentMethod: sale.payment_method?.toUpperCase(),
            customerName: sale.customers?.name,
            notes: sale.notes || undefined,
        }
        setSelectedInvoice(invData)
    }

    // Format label periode untuk tampilan
    const periodLabel = {
        hari_ini: 'Hari Ini',
        kemarin: 'Kemarin',
        minggu_ini: '7 Hari Terakhir',
        bulan_ini: 'Bulan Ini',
        kustom: customStartDate && customEndDate
            ? customStartDate === customEndDate
                ? customStartDate
                : `${customStartDate} s/d ${customEndDate}`
            : 'Tanggal Terpilih',
        semua: 'Semua Transaksi',
    }[period]

    const handleSelectPeriod = (newPeriod: Period) => {
        if (newPeriod === 'kustom') {
            setInputStart(customStartDate || todayStr)
            setInputEnd(customEndDate || todayStr)
            setIsCustomModalOpen(true)
            return
        }

        setPeriod(newPeriod)
        if (typeof window !== 'undefined' && (window.location.search.includes('start_date') || window.location.search.includes('end_date'))) {
            const url = new URL(window.location.href)
            url.searchParams.delete('start_date')
            url.searchParams.delete('end_date')
            router.push(url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''))
        }
    }

    const handleApplyCustomDate = (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        if (!inputStart || !inputEnd) return

        let finalStart = inputStart
        let finalEnd = inputEnd
        if (finalStart > finalEnd) {
            finalStart = inputEnd
            finalEnd = inputStart
        }

        setCustomStartDate(finalStart)
        setCustomEndDate(finalEnd)
        setPeriod('kustom')
        setIsCustomModalOpen(false)

        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href)
            url.searchParams.set('start_date', finalStart)
            url.searchParams.set('end_date', finalEnd)
            router.push(url.pathname + '?' + url.searchParams.toString())
        }
    }

    const handleSetModalPreset = (preset: 'today' | 'yesterday' | '7days' | 'this_month' | 'last_month') => {
        const today = new Date()
        if (preset === 'today') {
            const d = getIndonesianDate(today)
            setInputStart(d)
            setInputEnd(d)
        } else if (preset === 'yesterday') {
            const y = new Date(today)
            y.setDate(y.getDate() - 1)
            const d = getIndonesianDate(y)
            setInputStart(d)
            setInputEnd(d)
        } else if (preset === '7days') {
            const s = new Date(today)
            s.setDate(s.getDate() - 6)
            setInputStart(getIndonesianDate(s))
            setInputEnd(getIndonesianDate(today))
        } else if (preset === 'this_month') {
            const r = getIndonesianPeriodRange('month')
            setInputStart(r.dateFrom)
            setInputEnd(r.dateTo)
        } else if (preset === 'last_month') {
            const firstOfCurrent = new Date(today.getFullYear(), today.getMonth(), 1)
            const lastOfPrev = new Date(firstOfCurrent.getTime() - 1)
            const firstOfPrev = new Date(lastOfPrev.getFullYear(), lastOfPrev.getMonth(), 1)
            setInputStart(getIndonesianDate(firstOfPrev))
            setInputEnd(getIndonesianDate(lastOfPrev))
        }
    }

    function isMultiInstallmentLocked(sale: Sale) {
        return Boolean(sale.sale_payments && sale.sale_payments.length > 1)
    }

    // Pegawai dapat mengedit transaksi yang tampil di cabangnya, Owner bisa semua cabang
    // Transaksi multi-cicilan terkunci dari pengeditan langsung (0036)
    function canEdit(sale: Sale) {
        if (sale.status === 'voided') return false
        if (isMultiInstallmentLocked(sale)) return false
        return true
    }

    // Export CSV / Excel
    function handleExportCSV() {
        if (filteredSales.length === 0) {
            alert('Tidak ada data penjualan pada periode ini untuk diexport.')
            return
        }

        const branchSlug = (
            isOwner && selectedBranchId !== 'all'
                ? branches.find((b) => b.id === selectedBranchId)?.name || 'cabang'
                : 'semua-cabang'
        )
            .toLowerCase()
            .replace(/\s+/g, '-')

        const headers = ['ID', 'Tanggal', 'Jam', 'Cabang', 'Channel', 'Metode Bayar', 'Total (Rp)', 'Rincian Menu', 'Status']
        const rows = filteredSales.map((s) => {
            const dateObj = new Date(s.transaction_date)
            const dateStr = dateObj.toLocaleDateString('id-ID', { timeZone: TIMEZONE_INDONESIA })
            const timeStr = dateObj.toLocaleTimeString('id-ID', { timeZone: TIMEZONE_INDONESIA, hour: '2-digit', minute: '2-digit' })
            const branch = s.branches?.name ?? userBranchName ?? 'Cabang'
            const itemsStr = s.sale_items
                .map((i) => `${i.products?.name ?? 'Item'} (${i.quantity}x)`)
                .join('; ')
            const status = s.is_edited ? 'Diedit' : 'Normal'

            return [
                s.id,
                dateStr,
                timeStr,
                `"${branch.replace(/"/g, '""')}"`,
                s.channel,
                s.payment_method,
                s.total,
                `"${itemsStr.replace(/"/g, '""')}"`,
                status,
            ].join(',')
        })

        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n')
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.setAttribute('href', url)
        link.setAttribute(
            'download',
            `rekap-penjualan-${branchSlug}-${period === 'kustom' ? `${customStartDate}-sd-${customEndDate}` : period}-${getIndonesianDate()}.csv`
        )
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    // Salin Rekap WhatsApp
    function handleCopyWhatsApp() {
        const branchTitle = isOwner
            ? selectedBranchId === 'all'
                ? 'Semua Cabang'
                : `Cabang ${branches.find((b) => b.id === selectedBranchId)?.name || ''}`
            : userBranchName
            ? `Cabang ${userBranchName}`
            : 'Cabang Utama'

        const dateStr = period === 'kustom' && customStartDate && customEndDate
            ? customStartDate === customEndDate
                ? customStartDate
                : `${customStartDate} s/d ${customEndDate}`
            : new Date().toLocaleDateString('id-ID', {
                timeZone: TIMEZONE_INDONESIA,
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            })

        const paymentList = Object.entries(paymentStats)
            .map(([method, data]) => `• ${method.toUpperCase()}: Rp${data.total.toLocaleString('id-ID')} (${data.count} tx)`)
            .join('\n')

        const channelList = Object.entries(channelStats)
            .map(([ch, data]) => `• ${ch.toUpperCase()}: Rp${data.total.toLocaleString('id-ID')} (${data.count} tx)`)
            .join('\n')

        const topList = topProducts
            .slice(0, 5)
            .map(([name, qty], idx) => `${idx + 1}. ${name} (${qty} porsi)`)
            .join('\n')

        const text = `*REKAP PENJUALAN REKAPI*
Cabang: ${branchTitle}
Periode: ${periodLabel} (${dateStr})
----------------------------------------
• *Total Omzet:* Rp${totalOmzet.toLocaleString('id-ID')}
• *Total Transaksi:* ${totalTransaksi}
• *Total Item Terjual:* ${totalItems} pcs${
            isOwner
                ? `\n• *Total HPP:* Rp${totalHpp.toLocaleString('id-ID')}\n• *Estimasi Laba Kotor:* Rp${labaKotor.toLocaleString('id-ID')}`
                : ''
        }

*Metode Pembayaran:*
${paymentList || 'Belum ada transaksi'}

*Channel Penjualan:*
${channelList || 'Belum ada transaksi'}

*Menu Terlaris:*
${topList || 'Belum ada data'}
----------------------------------------
_Dicatat otomatis via Rekapi POS_`

        navigator.clipboard.writeText(text).then(() => {
            setCopiedToast(true)
            setTimeout(() => setCopiedToast(false), 3000)
        })
    }

    return (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Riwayat & Rekap</h1>
                    <p className="mt-1 text-xs font-semibold text-emerald-800">
                        {isOwner
                            ? selectedBranchId === 'all'
                                ? `Konsolidasi Semua Cabang (${branches.length} cabang terdaftar)`
                                : `Cabang: ${branches.find((b) => b.id === selectedBranchId)?.name ?? 'Terpilih'}`
                            : userBranchName
                            ? `Cabang: ${userBranchName}`
                            : 'Transaksi Penjualan'}
                    </p>
                </div>

                {/* Tombol Export CSV & Salin WA */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer"
                        title="Unduh file Excel / CSV"
                    >
                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>Export CSV</span>
                    </button>

                    <button
                        onClick={handleCopyWhatsApp}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-900 active:bg-emerald-950 transition cursor-pointer"
                        title="Salin rekap siap kirim ke WhatsApp"
                    >
                        <svg className="w-3.5 h-3.5 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        <span>{copiedToast ? 'Tersalin!' : 'Salin Rekap WA'}</span>
                    </button>
                </div>
            </div>

            {/* Navigasi Balik ke Pusat Laporan */}
            <div className="mb-5">
                <Link
                    href="/dashboard/keuangan"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-700 transition"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span>Kembali ke Pusat Laporan</span>
                </Link>
            </div>

            {/* Toast Notifikasi Salin WA */}
            {copiedToast && (
                <div className="mb-4 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-medium text-emerald-800">
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Format Rekap WhatsApp berhasil disalin ke clipboard! Siap dipaste ke grup.</span>
                    </div>
                </div>
            )}

            {/* Filter Periode Ringkas (1 Dropdown Hemat Tempat) */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">Periode:</span>
                    <select
                        value={period}
                        onChange={(e) => handleSelectPeriod(e.target.value as Period)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-2xs focus:border-emerald-700 focus:outline-none cursor-pointer"
                    >
                        <option value="hari_ini">Hari Ini</option>
                        <option value="kemarin">Kemarin</option>
                        <option value="minggu_ini">7 Hari Terakhir</option>
                        <option value="bulan_ini">Bulan Ini</option>
                        <option value="kustom">Pilih Tanggal Kustom...</option>
                        <option value="semua">Semua Transaksi</option>
                    </select>

                    {period === 'kustom' && (
                        <button
                            type="button"
                            onClick={() => {
                                setInputStart(customStartDate || todayStr)
                                setInputEnd(customEndDate || todayStr)
                                setIsCustomModalOpen(true)
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition cursor-pointer"
                        >
                            <span>Ganti Tanggal:</span>
                            <span className="font-mono text-emerald-900 font-bold">
                                {customStartDate === customEndDate ? customStartDate : `${customStartDate} s/d ${customEndDate}`}
                            </span>
                        </button>
                    )}
                </div>

                {/* Info jumlah transaksi */}
                <div className="text-[11px] text-slate-500">
                    Menampilkan <strong className="text-slate-800 tabular-nums">{validSales.length}</strong> transaksi non-void ({periodLabel})
                </div>
            </div>

            {/* Stat Strip Horizontal (Clean & Compact) */}
            <div className="mb-6 rounded-lg border border-slate-200 bg-white shadow-2xs overflow-hidden">
                <div className={`grid grid-cols-2 ${isOwner ? 'sm:grid-cols-4 lg:grid-cols-5' : 'sm:grid-cols-3'} divide-x divide-y sm:divide-y-0 divide-slate-200`}>
                    <div className="p-3 sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Total Omzet ({periodLabel})
                        </span>
                        <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 tabular-nums truncate">
                            Rp {totalOmzet.toLocaleString('id-ID')}
                        </div>
                    </div>

                    <div className="p-3 sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Total Transaksi
                        </span>
                        <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                            {totalTransaksi} <span className="text-xs font-normal text-slate-500">struk</span>
                        </div>
                    </div>

                    <div className="p-3 sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Item Terjual
                        </span>
                        <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                            {totalItems} <span className="text-xs font-normal text-slate-500">pcs</span>
                        </div>
                    </div>

                    {isOwner && (
                        <>
                            <div className="p-3 sm:p-4">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                                    Total HPP
                                </span>
                                <div className="mt-1 text-base sm:text-lg font-bold text-slate-700 tabular-nums truncate">
                                    Rp {totalHpp.toLocaleString('id-ID')}
                                </div>
                            </div>

                            <div className="p-3 sm:p-4 bg-emerald-50/40">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                                    Laba Kotor
                                </span>
                                <div className="mt-1 text-base sm:text-lg font-bold text-emerald-800 tabular-nums truncate">
                                    Rp {labaKotor.toLocaleString('id-ID')}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Header Kontrol Tabel & View Switcher (Sheet Toolbar) */}
            <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-800 text-white font-bold text-[11px] shadow-2xs">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 4h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                                    Jurnal Transaksi Penjualan
                                </h2>
                                <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200/80">
                                    {displayedSales.length} Baris
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                Total Omzet : <strong className="text-slate-900 font-semibold tabular-nums">Rp {displayedTotalOmzet.toLocaleString('id-ID')}</strong> ({displayedValidSales.length} non-void)
                            </p>
                        </div>
                    </div>

                    {/* Mode Tampilan Switcher */}
                    <div className="flex items-center self-start lg:self-center bg-slate-100 p-0.5 rounded-lg text-xs font-medium border border-slate-200">
                        <button
                            type="button"
                            onClick={() => setViewMode('spreadsheet')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer ${
                                viewMode === 'spreadsheet'
                                    ? 'bg-white text-emerald-900 shadow-2xs font-bold border border-slate-200/60'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <span>Data Sheet</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('cards')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer ${
                                viewMode === 'cards'
                                    ? 'bg-white text-emerald-900 shadow-2xs font-bold border border-slate-200/60'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <span>Kartu</span>
                        </button>
                    </div>
                </div>

                {/* Filter & Pencarian Cepat (Spreadsheet Ribbon Filter) */}
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    {/* Input Pencarian */}
                    <div className="relative flex-1 min-w-[200px]">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Cari No. TRX, nama pelanggan, menu/item, metode bayar..."
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-8 pr-3 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:border-emerald-600 focus:outline-none transition"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Filter Status Bayar */}
                    <select
                        value={statusFilter}
                        onChange={(e) =>
                            setStatusFilter(
                                e.target.value as 'all' | 'paid' | 'unpaid' | 'partial' | 'voided'
                            )
                        }
                        className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs font-semibold text-slate-700 focus:bg-white focus:border-emerald-600 focus:outline-none cursor-pointer"
                    >
                        <option value="all">Semua Status Bayar</option>
                        <option value="paid">Lunas</option>
                        <option value="partial">Dicicil / Tempo</option>
                        <option value="unpaid">Belum Lunas</option>
                        <option value="voided">Dibatalkan (Void)</option>
                    </select>

                    {/* Filter Channel */}
                    <select
                        value={channelFilter}
                        onChange={(e) => setChannelFilter(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs font-semibold text-slate-700 focus:bg-white focus:border-emerald-600 focus:outline-none cursor-pointer"
                    >
                        <option value="all">Semua Channel</option>
                        <option value="dine in">Dine In</option>
                        <option value="takeaway">Takeaway</option>
                        <option value="delivery">Delivery</option>
                        <option value="gofood">GoFood</option>
                        <option value="grabfood">GrabFood</option>
                        <option value="shopeefood">ShopeeFood</option>
                    </select>

                    {(searchQuery || statusFilter !== 'all' || channelFilter !== 'all') && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearchQuery('')
                                setStatusFilter('all')
                                setChannelFilter('all')
                            }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        >
                            Reset Filter
                        </button>
                    )}
                </div>
            </div>

            {/* Konten Transaksi: Spreadsheet (Tabel Excel) atau Kartu */}
            {viewMode === 'spreadsheet' ? (
                <div className="rounded-2xl border border-slate-300 bg-white shadow-xs overflow-hidden">
                    <div className="overflow-x-auto max-h-[75vh]">
                        <table className="w-full border-collapse text-left text-xs text-slate-700">
                            <thead className="sticky top-0 z-20 bg-slate-100 text-slate-700 font-bold uppercase text-[11px] tracking-wider border-b-2 border-slate-300 select-none shadow-xs">
                                <tr>
                                    <th className="w-12 px-2 py-3 text-center border-r border-slate-300 bg-slate-200/80 font-mono text-slate-500">
                                        #
                                    </th>
                                    <th className="px-3 py-3 border-r border-slate-300 whitespace-nowrap">
                                        Waktu Transaksi
                                    </th>
                                    <th className="px-3 py-3 border-r border-slate-300 whitespace-nowrap">
                                        No. Invoice / TRX
                                    </th>
                                    {isOwner && (
                                        <th className="px-3 py-3 border-r border-slate-300 whitespace-nowrap">
                                            Cabang
                                        </th>
                                    )}
                                    <th className="px-3 py-3 border-r border-slate-300 whitespace-nowrap">
                                        Pelanggan
                                    </th>
                                    <th className="px-3 py-3 border-r border-slate-300 min-w-[240px]">
                                        Rincian Menu & Qty
                                    </th>
                                    <th className="px-3 py-3 border-r border-slate-300 text-center whitespace-nowrap">
                                        Channel
                                    </th>
                                    <th className="px-3 py-3 border-r border-slate-300 text-center whitespace-nowrap">
                                        Metode
                                    </th>
                                    <th className="px-3 py-3 border-r border-slate-300 text-center whitespace-nowrap">
                                        Status
                                    </th>
                                    <th className="px-3 py-3 border-r border-slate-300 text-right whitespace-nowrap">
                                        Total Omzet
                                    </th>
                                    <th className="px-3 py-3 text-center whitespace-nowrap">
                                        Aksi
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                                {displayedSales.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={isOwner ? 11 : 10}
                                            className="p-10 text-center text-sm text-slate-400"
                                        >
                                            Tidak ada transaksi yang cocok dengan filter atau pencarian pada periode {periodLabel}.
                                        </td>
                                    </tr>
                                ) : (
                                    displayedSales.map((sale, idx) => {
                                        const trxCode = `#TRX-${sale.id.slice(0, 4).toUpperCase()}`
                                        const dateObj = new Date(sale.transaction_date)
                                        const timeStr = dateObj.toLocaleTimeString('id-ID', {
                                            timeZone: TIMEZONE_INDONESIA,
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })
                                        const dateShort = dateObj.toLocaleDateString('id-ID', {
                                            timeZone: TIMEZONE_INDONESIA,
                                            day: '2-digit',
                                            month: 'short',
                                            year: 'numeric',
                                        })

                                        const isVoided = sale.status === 'voided'
                                        const isUnpaid = sale.payment_status === 'unpaid'
                                        const isPartial = sale.payment_status === 'partial'

                                        return (
                                            <tr
                                                key={sale.id}
                                                className={`transition-colors even:bg-slate-50/50 hover:bg-emerald-50/40 ${
                                                    isVoided ? 'bg-slate-50/90 opacity-75' : ''
                                                }`}
                                            >
                                                {/* Kolom Indeks Baris Excel (#) */}
                                                <td className="px-2 py-2.5 text-center font-mono text-[11px] text-slate-400 font-semibold bg-slate-50 border-r border-slate-200 select-none">
                                                    {idx + 1}
                                                </td>

                                                {/* Waktu & Tanggal */}
                                                <td className="px-3 py-2.5 border-r border-slate-200 whitespace-nowrap">
                                                    <div className="font-semibold text-slate-800">{dateShort}</div>
                                                    <div className="text-[10px] font-mono text-slate-400">{timeStr} WIB</div>
                                                </td>

                                                {/* No. Invoice / TRX */}
                                                <td className="px-3 py-2.5 border-r border-slate-200 whitespace-nowrap">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                                                            {trxCode}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCopyTrx(sale.id)}
                                                            className="text-slate-400 hover:text-slate-700 transition cursor-pointer"
                                                            title="Salin No. Transaksi"
                                                        >
                                                            {copiedTrxId === sale.id ? (
                                                                <span className="text-emerald-700 font-bold text-[11px]">✓</span>
                                                            ) : (
                                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    </div>
                                                    {sale.is_edited && (
                                                        <button
                                                            onClick={() => setAuditSale(sale)}
                                                            className="mt-1 inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded hover:bg-amber-100 transition cursor-pointer"
                                                            title="Lihat riwayat audit"
                                                        >
                                                            <span>Diedit</span>
                                                        </button>
                                                    )}
                                                </td>

                                                {/* Cabang (Khusus Owner) */}
                                                {isOwner && (
                                                    <td className="px-3 py-2.5 border-r border-slate-200 whitespace-nowrap font-medium text-slate-700">
                                                        {sale.branches?.name || 'Cabang Utama'}
                                                    </td>
                                                )}

                                                {/* Pelanggan */}
                                                <td className="px-3 py-2.5 border-r border-slate-200 whitespace-nowrap">
                                                    <div className="font-semibold text-slate-800">
                                                        {sale.customers?.name || 'Pelanggan Umum'}
                                                    </div>
                                                    {sale.customers?.phone && (
                                                        <div className="text-[10px] font-mono text-slate-400">
                                                            {sale.customers.phone}
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Rincian Menu & Item */}
                                                <td className="px-3 py-2.5 border-r border-slate-200">
                                                    <div className="space-y-0.5">
                                                        {sale.sale_items.map((it, i) => (
                                                            <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                                                                <span className="font-medium text-slate-800 truncate max-w-[180px]">
                                                                    {it.products?.name ?? 'Item'}
                                                                </span>
                                                                <span className="font-mono text-slate-500 font-semibold whitespace-nowrap">
                                                                    x{it.quantity}
                                                                </span>
                                                            </div>
                                                        ))}
                                                        {sale.notes && (
                                                            <div className="text-[10px] text-amber-700 italic pt-0.5 border-t border-slate-100">
                                                                &ldquo;{sale.notes}&rdquo;
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Channel */}
                                                <td className="px-3 py-2.5 border-r border-slate-200 text-center whitespace-nowrap">
                                                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                                                        {sale.channel}
                                                    </span>
                                                </td>

                                                {/* Metode Bayar */}
                                                <td className="px-3 py-2.5 border-r border-slate-200 text-center whitespace-nowrap">
                                                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700">
                                                        {sale.payment_method}
                                                    </span>
                                                </td>

                                                {/* Status Pembayaran */}
                                                <td className="px-3 py-2.5 border-r border-slate-200 text-center whitespace-nowrap">
                                                    {isVoided ? (
                                                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                                            Dibatalkan
                                                        </span>
                                                    ) : isUnpaid ? (
                                                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                                            Belum Lunas
                                                        </span>
                                                    ) : isPartial ? (
                                                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200" title={`Sisa: Rp ${Math.max(0, sale.total - (sale.paid_amount || 0)).toLocaleString('id-ID')}`}>
                                                            Dicicil
                                                        </span>
                                                    ) : (
                                                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                            Lunas
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Total Omzet */}
                                                <td className="px-3 py-2.5 border-r border-slate-200 text-right whitespace-nowrap font-mono font-bold tabular-nums">
                                                    <span className={isVoided ? 'line-through text-slate-400' : 'text-slate-900'}>
                                                        Rp {sale.total.toLocaleString('id-ID')}
                                                    </span>
                                                </td>

                                                {/* Aksi */}
                                                <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                                    <div className="flex items-center justify-center gap-1">
                                                        {/* Struk */}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenReceipt(sale)}
                                                            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
                                                            title="Lihat / Cetak Struk Transaksi"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                            </svg>
                                                        </button>

                                                        {/* Bayar Piutang */}
                                                        {!isVoided && (isUnpaid || isPartial) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setPayingSale(sale)
                                                                    setPayAmount(Math.max(0, sale.total - (sale.paid_amount || 0)))
                                                                    setPayError(null)
                                                                }}
                                                                className="px-2 py-1 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] font-bold hover:bg-emerald-100 transition cursor-pointer"
                                                                title="Bayar Cicilan / Piutang"
                                                            >
                                                                Bayar
                                                            </button>
                                                        )}

                                                        {/* Edit / Terkunci Multi-Cicilan (0036) */}
                                                        {isMultiInstallmentLocked(sale) && !isVoided ? (
                                                            <button
                                                                type="button"
                                                                disabled
                                                                className="px-2 py-1 rounded-md border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed opacity-90 flex items-center gap-1 text-[10px] font-medium"
                                                                title="Terkunci (Sudah ada cicilan — gunakan Void & buat baru)"
                                                            >
                                                                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                                </svg>
                                                                <span className="hidden xl:inline">Terkunci (Cicilan)</span>
                                                            </button>
                                                        ) : canEdit(sale) && !isVoided ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingSale(sale)}
                                                                className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
                                                                title="Edit Transaksi"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            </button>
                                                        ) : null}

                                                        {/* Void */}
                                                        {isOwner && !isVoided && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setDeleteError(null)
                                                                    setVoidReason('')
                                                                    setDeletingSale(sale)
                                                                }}
                                                                className="p-1.5 rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition shadow-2xs cursor-pointer"
                                                                title="Batalkan Transaksi (Void)"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>

                            {/* Baris Total / AutoSum Footer Excel */}
                            {displayedSales.length > 0 && (
                                <tfoot className="sticky bottom-0 z-10 bg-slate-100 font-bold border-t-2 border-slate-300 text-xs shadow-xs">
                                    <tr>
                                        <td
                                            colSpan={isOwner ? 9 : 8}
                                            className="px-4 py-3 text-right text-slate-700 uppercase tracking-wide border-r border-slate-300"
                                        >
                                            <div className="flex items-center justify-end gap-2">
                                                <span className="font-mono text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-black shadow-2xs">
                                                    fx =SUM
                                                </span>
                                                <span>TOTAL OMZET ({displayedValidSales.length} Transaksi Non-Void):</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 text-right font-mono text-sm font-black text-slate-900 border-r border-slate-300 whitespace-nowrap border-b-4 border-double border-slate-900 bg-emerald-50/50">
                                            Rp {displayedTotalOmzet.toLocaleString('id-ID')}
                                        </td>
                                        <td className="px-2 py-3 text-center text-[10px] text-slate-500 font-mono">
                                            {displayedSales.length} baris
                                        </td>
                                    </tr>
                                    {isOwner && (
                                        <tr className="bg-slate-50 text-[11px] text-slate-600 border-t border-slate-200">
                                            <td colSpan={isOwner ? 9 : 8} className="px-4 py-2 text-right border-r border-slate-200 font-medium">
                                                <span>Estimasi Total HPP Modal: <strong className="text-slate-800 font-bold">Rp {displayedTotalHpp.toLocaleString('id-ID')}</strong> • Laba Kotor: <strong className="text-emerald-700 font-bold">Rp {displayedLabaKotor.toLocaleString('id-ID')}</strong></span>
                                            </td>
                                            <td colSpan={2} className="px-3 py-2 text-right font-mono text-emerald-700 font-bold">
                                                {displayedTotalOmzet > 0 ? `${Math.round((displayedLabaKotor / displayedTotalOmzet) * 100)}% Margin` : '0%'}
                                            </td>
                                        </tr>
                                    )}
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            ) : (
                /* Mode Kartu (Card View) */
                <div className="space-y-3">
                    {displayedSales.map((sale) => {
                        const trxCode = `#TRX-${sale.id.slice(0, 4).toUpperCase()}`
                        const dateObj = new Date(sale.transaction_date)
                        const dateStr = formatIndonesianDateTime(sale.transaction_date).replace(' WIB', '')

                        return (
                            <div
                                key={sale.id}
                                className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs transition hover:border-emerald-300 hover:shadow-xs"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3 min-w-0 pr-2">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                            </svg>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-extrabold text-sm text-slate-900 tracking-tight">
                                                    {trxCode}
                                                </span>
                                                {isOwner && sale.branches?.name && (
                                                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                                        {sale.branches.name}
                                                    </span>
                                                )}
                                                {sale.customers?.name && (
                                                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                                        {sale.customers.name}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-400 mt-0.5">
                                                {dateStr}
                                            </div>
                                            <div className="mt-1.5 text-xs font-semibold text-slate-700">
                                                {sale.sale_items
                                                    .map((i) => `${i.products?.name ?? 'Item'} (${i.quantity}x)`)
                                                    .join(', ')}
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                                                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                                                    {sale.channel}
                                                </span>
                                                <span>·</span>
                                                <span className="capitalize font-semibold text-slate-600 text-[11px]">
                                                    {sale.payment_method}
                                                </span>
                                                {sale.is_edited && (
                                                    <button
                                                        onClick={() => setAuditSale(sale)}
                                                        className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200/90 px-2 py-0.5 text-[10px] font-bold text-amber-900 hover:bg-amber-100 transition cursor-pointer"
                                                        title="Lihat riwayat audit"
                                                    >
                                                        <span>Diedit</span>
                                                    </button>
                                                )}
                                                {sale.due_date && sale.status !== 'voided' && sale.payment_status !== 'paid' && (
                                                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold border ${sale.due_date.slice(0, 10) < todayStr ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                                        Tempo: {new Date(sale.due_date).toLocaleDateString('id-ID')}
                                                        {sale.due_date.slice(0, 10) < todayStr && ' (Terlambat)'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-right shrink-0">
                                        <div className={`text-base font-extrabold ${sale.status === 'voided' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                            Rp {sale.total.toLocaleString('id-ID')}
                                        </div>
                                        <div className="mt-1 flex flex-col items-end gap-1">
                                            {sale.status === 'voided' ? (
                                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                                    Dibatalkan (Void)
                                                </span>
                                            ) : sale.payment_status === 'unpaid' ? (
                                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                                    Belum Lunas
                                                </span>
                                            ) : sale.payment_status === 'partial' ? (
                                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                    Dicicil (Sisa Rp {Math.max(0, sale.total - (sale.paid_amount || 0)).toLocaleString('id-ID')})
                                                </span>
                                            ) : (
                                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                    Lunas
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-2 flex items-center justify-end gap-1.5">
                                            {/* Tombol Cetak Struk */}
                                            <button
                                                type="button"
                                                onClick={() => handleOpenReceipt(sale)}
                                                className="p-1 rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                                                title="Cetak Struk Transaksi"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            </button>

                                            {sale.status !== 'voided' && (sale.payment_status === 'unpaid' || sale.payment_status === 'partial') && (
                                                <button
                                                    onClick={() => {
                                                        setPayingSale(sale)
                                                        setPayAmount(Math.max(0, sale.total - (sale.paid_amount || 0)))
                                                        setPayError(null)
                                                    }}
                                                    className="px-2 py-1 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-bold hover:bg-emerald-100 transition flex items-center gap-1 shadow-xs cursor-pointer"
                                                    title="Catat Pembayaran Cicilan / Pelunasan"
                                                >
                                                    Bayar
                                                </button>
                                            )}
                                            {/* Edit / Terkunci Multi-Cicilan */}
                                            {isMultiInstallmentLocked(sale) && sale.status !== 'voided' ? (
                                                <span
                                                    className="px-2 py-1 rounded-md border border-slate-200 bg-slate-100 text-slate-500 text-[10px] font-medium flex items-center gap-1 cursor-not-allowed"
                                                    title="Terkunci (Sudah ada cicilan — gunakan Void & buat baru)"
                                                >
                                                    <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                    </svg>
                                                    <span>Terkunci</span>
                                                </span>
                                            ) : canEdit(sale) && sale.status !== 'voided' ? (
                                                <button
                                                    onClick={() => setEditingSale(sale)}
                                                    className="p-1 rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                                                    title="Edit Transaksi"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                            ) : null}
                                            {isOwner && sale.status !== 'voided' && (
                                                <button
                                                    onClick={() => {
                                                        setDeleteError(null)
                                                        setVoidReason('')
                                                        setDeletingSale(sale)
                                                    }}
                                                    className="p-1 rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                                                    title="Batalkan Transaksi (Void)"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}

                    {displayedSales.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
                            Tidak ada transaksi yang cocok pada periode <strong>{periodLabel}</strong>.
                        </div>
                    )}
                </div>
            )}

            {editingSale && (
                <EditSaleModal
                    sale={editingSale}
                    branchStocks={branchStocks}
                    catalogProducts={catalogProducts}
                    onClose={() => setEditingSale(null)}
                    onSaved={() => {
                        setEditingSale(null)
                        router.refresh()
                    }}
                />
            )}

            {auditSale && (
                <AuditTrailModal
                    saleId={auditSale.id}
                    saleDate={auditSale.transaction_date}
                    saleTotal={auditSale.total}
                    branchName={auditSale.branches?.name ?? userBranchName}
                    onClose={() => setAuditSale(null)}
                />
            )}

            {selectedInvoice && (
                <InvoiceModal
                    isOpen={!!selectedInvoice}
                    onClose={() => setSelectedInvoice(null)}
                    data={selectedInvoice}
                />
            )}

            {/* Modal Catat Pembayaran Cicilan / Pelunasan Piutang */}
            {payingSale && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px] animate-in fade-in duration-150">
                    <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
                        {/* Header Pinned */}
                        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-2">
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                    </svg>
                                </span>
                                <h2 className="text-xs sm:text-sm font-bold text-slate-900">Pembayaran Piutang / Cicilan</h2>
                            </div>
                            <button
                                onClick={() => setPayingSale(null)}
                                className="text-slate-400 hover:text-slate-600 text-base font-bold cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Body Scrollable */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Pelanggan:</span>
                                    <span className="font-bold text-slate-800">{payingSale.customers?.name || 'Pelanggan Umum'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Total Tagihan:</span>
                                    <span className="font-bold text-slate-800">Rp {payingSale.total.toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Sudah Dibayar:</span>
                                    <span className="font-bold text-emerald-600">Rp {(payingSale.paid_amount || 0).toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex justify-between pt-1 border-t border-slate-200">
                                    <span className="text-slate-500 font-semibold">Sisa Tagihan:</span>
                                    <span className="font-extrabold text-rose-600">
                                        Rp {Math.max(0, payingSale.total - (payingSale.paid_amount || 0)).toLocaleString('id-ID')}
                                    </span>
                                </div>
                            </div>

                            {payError && (
                                <p className="rounded-lg bg-red-50 p-2.5 text-xs font-medium text-red-700">{payError}</p>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Nominal Pembayaran (Rp)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={Math.max(0, payingSale.total - (payingSale.paid_amount || 0))}
                                    value={payAmount || ''}
                                    onChange={(e) => setPayAmount(Number(e.target.value))}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-900 focus:border-emerald-500 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Metode Pembayaran
                                </label>
                                <select
                                    value={payMethod}
                                    onChange={(e) => setPayMethod(e.target.value)}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none"
                                >
                                    <option value="cash">Tunai (Cash)</option>
                                    <option value="transfer">Transfer Bank</option>
                                    <option value="qris">QRIS</option>
                                </select>
                            </div>

                            {accounts.length > 0 && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Rekening / Akun Kas Penerima
                                    </label>
                                    <select
                                        value={payAccountId}
                                        onChange={(e) => setPayAccountId(e.target.value)}
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none"
                                    >
                                        {accounts.map((acc) => (
                                            <option key={acc.id} value={acc.id}>
                                                {acc.name} ({acc.type.toUpperCase()})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Catatan / Keterangan (Opsional)
                                </label>
                                <input
                                    type="text"
                                    value={payNotes}
                                    placeholder="Contoh: Cicilan ke-2 transfer via BCA"
                                    onChange={(e) => setPayNotes(e.target.value)}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        {/* Footer Pinned */}
                        <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                            <button
                                onClick={() => setPayingSale(null)}
                                disabled={payLoading}
                                className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 cursor-pointer"
                            >
                                Batal
                            </button>
                            <button
                                onClick={async () => {
                                    if (!payAmount || payAmount <= 0) {
                                        setPayError('Nominal pembayaran harus lebih besar dari 0.')
                                        return
                                    }
                                    setPayLoading(true)
                                    setPayError(null)
                                    const result = await recordSalePayment(payingSale.id, {
                                        amount: payAmount,
                                        payment_method: payMethod,
                                        account_id: payAccountId || null,
                                        notes: payNotes,
                                    })
                                    setPayLoading(false)
                                    if (result.error) {
                                        setPayError(result.error)
                                    } else {
                                        setPayingSale(null)
                                    }
                                }}
                                disabled={payLoading}
                                className="px-4 py-1.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 transition disabled:opacity-50 cursor-pointer"
                            >
                                {payLoading ? 'Memproses...' : 'Simpan Pembayaran'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Konfirmasi Pembatalan Transaksi (Void) */}
            {deletingSale && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px] animate-in fade-in duration-150">
                    <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
                        {/* Header Pinned */}
                        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-2">
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                    </svg>
                                </span>
                                <h2 className="text-xs sm:text-sm font-bold text-slate-900">Batalkan Transaksi (Void)?</h2>
                            </div>
                            <button
                                onClick={() => {
                                    setDeletingSale(null)
                                    setDeleteError(null)
                                }}
                                className="text-slate-400 hover:text-slate-600 text-base font-bold cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Body Scrollable */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 text-xs">
                            <p className="text-slate-600 leading-relaxed">
                                Transaksi tidak dihapus demi integritas audit. Transaksi akan ditandai <strong className="text-rose-600">Dibatalkan (Void)</strong>, seluruh stok item dikembalikan ke stok cabang, dan saldo kas dibalik secara otomatis.
                            </p>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
                                <div className="font-semibold text-slate-900">{new Date(deletingSale.transaction_date).toLocaleString('id-ID')}</div>
                                <div className="text-slate-600">
                                    {deletingSale.sale_items.map((i) => `${i.products?.name ?? 'Item'} (${i.quantity} ${i.products?.unit || 'x'})`).join(', ')}
                                </div>
                                <div className="font-bold text-slate-900">Rp {deletingSale.total.toLocaleString('id-ID')}</div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Alasan Pembatalan (Wajib untuk Audit)
                                </label>
                                <input
                                    type="text"
                                    placeholder="Contoh: Salah input pesanan / Pelanggan membatalkan"
                                    value={voidReason}
                                    onChange={(e) => setVoidReason(e.target.value)}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-rose-500 focus:outline-none"
                                />
                            </div>

                            {deleteError && (
                                <p className="rounded-lg bg-red-50 p-2.5 text-xs font-medium text-red-700">{deleteError}</p>
                            )}
                        </div>

                        {/* Footer Pinned */}
                        <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                            <button
                                onClick={() => {
                                    setDeletingSale(null)
                                    setDeleteError(null)
                                }}
                                disabled={deleteLoading}
                                className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 cursor-pointer"
                            >
                                Batal
                            </button>
                            <button
                                onClick={async () => {
                                    if (!voidReason.trim()) {
                                        setDeleteError('Silakan masukkan alasan pembatalan.')
                                        return
                                    }
                                    setDeleteLoading(true)
                                    setDeleteError(null)
                                    const result = await voidSale(deletingSale.id, voidReason)
                                    setDeleteLoading(false)
                                    if (result.error) {
                                        setDeleteError(result.error)
                                    } else {
                                        setDeletingSale(null)
                                    }
                                }}
                                disabled={deleteLoading}
                                className="px-4 py-1.5 rounded-lg bg-rose-600 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 transition disabled:opacity-50 cursor-pointer"
                            >
                                {deleteLoading ? 'Membatalkan...' : 'Ya, Batalkan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Pemilihan Tanggal / Rentang Tanggal */}
            {isCustomModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px] animate-in fade-in duration-150">
                    <div className="w-full max-w-md max-h-[85vh] flex flex-col bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
                        {/* Header Pinned */}
                        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                            <div>
                                <h3 className="text-xs sm:text-sm font-bold text-slate-900">Pilih Tanggal Transaksi</h3>
                                <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
                                    Pilih tanggal tertentu atau rentang riwayat penjualan
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsCustomModalOpen(false)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Body Scrollable */}
                        <form onSubmit={handleApplyCustomDate} className="flex-1 flex flex-col min-h-0">
                            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 min-h-0 text-xs">
                                {/* Preset Cepat */}
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                        Pilihan Cepat
                                    </label>
                                    <div className="flex flex-wrap gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => handleSetModalPreset('today')}
                                            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition cursor-pointer"
                                        >
                                            Hari Ini
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSetModalPreset('yesterday')}
                                            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition cursor-pointer"
                                        >
                                            Kemarin
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSetModalPreset('7days')}
                                            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition cursor-pointer"
                                        >
                                            7 Hari Terakhir
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSetModalPreset('this_month')}
                                            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition cursor-pointer"
                                        >
                                            Bulan Ini
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSetModalPreset('last_month')}
                                            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition cursor-pointer"
                                        >
                                            Bulan Lalu
                                        </button>
                                    </div>
                                </div>

                                {/* Input Tanggal Mulai & Tanggal Selesai */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Tanggal Mulai
                                        </label>
                                        <input
                                            type="date"
                                            value={inputStart}
                                            onChange={(e) => setInputStart(e.target.value)}
                                            required
                                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Tanggal Selesai
                                        </label>
                                        <input
                                            type="date"
                                            value={inputEnd}
                                            onChange={(e) => setInputEnd(e.target.value)}
                                            required
                                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                                        />
                                    </div>
                                </div>

                                <p className="text-[11px] text-slate-500 italic">
                                    *Tips: Untuk melihat transaksi pada 1 hari tertentu saja, samakan tanggal mulai dan tanggal selesai.
                                </p>
                            </div>

                            {/* Footer Pinned */}
                            <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsCustomModalOpen(false)}
                                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 shadow-xs transition cursor-pointer"
                                >
                                    Terapkan Filter Tanggal
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}