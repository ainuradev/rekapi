'use client'

import { useState, useMemo } from 'react'
import EditSaleModal from './edit-sale-modal'
import AuditTrailModal from './audit-trail-modal'
import { deleteSale } from './actions'
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
    is_edited: boolean
    branch_id: string
    user_id: string
    branches: { name: string } | null
    sale_items: {
        product_id: string
        quantity: number
        price: number
        cost_price: number
        products: { name: string; unit?: string } | null
    }[]
}

type Period = 'hari_ini' | 'minggu_ini' | 'bulan_ini' | 'semua'

export default function RiwayatClient({
    sales,
    branches = [],
    currentUserId,
    isOwner,
    userBranchName,
}: {
    sales: Sale[]
    branches?: { id: string; name: string }[]
    currentUserId: string
    isOwner: boolean
    userBranchName?: string | null
}) {
    const [period, setPeriod] = useState<Period>('hari_ini')
    const [selectedBranchId, setSelectedBranchId] = useState<string>('all')
    const [editingSale, setEditingSale] = useState<Sale | null>(null)
    const [auditSale, setAuditSale] = useState<Sale | null>(null)
    const [deletingSale, setDeletingSale] = useState<Sale | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)
    const [copiedToast, setCopiedToast] = useState(false)

    // Filter transaksi berdasarkan cabang (jika owner) dan periode yang dipilih (WIB)
    const filteredSales = useMemo(() => {
        const indonesianToday = getIndonesianPeriodRange('today')
        const indonesianWeek = getIndonesianPeriodRange('week')
        const indonesianMonth = getIndonesianPeriodRange('month')

        const todayStart = new Date(indonesianToday.timestampFrom).getTime()
        const todayEnd = new Date(indonesianToday.timestampTo).getTime()

        const weekStart = new Date(indonesianWeek.timestampFrom).getTime()
        const weekEnd = new Date(indonesianWeek.timestampTo).getTime()

        const monthStart = new Date(indonesianMonth.timestampFrom).getTime()
        const monthEnd = new Date(indonesianMonth.timestampTo).getTime()

        return sales.filter((sale) => {
            // Filter Cabang untuk Owner
            if (isOwner && selectedBranchId !== 'all' && sale.branch_id !== selectedBranchId) {
                return false
            }

            const saleTime = new Date(sale.transaction_date).getTime()
            if (period === 'hari_ini') {
                return saleTime >= todayStart && saleTime <= todayEnd
            }
            if (period === 'minggu_ini') {
                return saleTime >= weekStart && saleTime <= weekEnd
            }
            if (period === 'bulan_ini') {
                return saleTime >= monthStart && saleTime <= monthEnd
            }
            return true
        })
    }, [sales, period, selectedBranchId, isOwner])

    // Agregasi data rekap
    const totalOmzet = useMemo(
        () => filteredSales.reduce((sum, s) => sum + s.total, 0),
        [filteredSales]
    )

    const totalTransaksi = filteredSales.length

    const totalItems = useMemo(
        () =>
            filteredSales.reduce(
                (sum, s) => sum + s.sale_items.reduce((iSum, item) => iSum + item.quantity, 0),
                0
            ),
        [filteredSales]
    )

    // Owner only metrics
    const totalHpp = useMemo(() => {
        if (!isOwner) return 0
        return filteredSales.reduce(
            (sum, s) =>
                sum + s.sale_items.reduce((iSum, item) => iSum + (item.cost_price ?? 0) * item.quantity, 0),
            0
        )
    }, [filteredSales, isOwner])

    const labaKotor = totalOmzet - totalHpp

    // Rincian metode pembayaran & channel
    const paymentStats = useMemo(() => {
        const map: Record<string, { count: number; total: number }> = {}
        for (const s of filteredSales) {
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

    // Format label periode untuk tampilan
    const periodLabel = {
        hari_ini: 'Hari Ini',
        minggu_ini: '7 Hari Terakhir',
        bulan_ini: 'Bulan Ini',
        semua: 'Semua Transaksi',
    }[period]

    // Pegawai dapat mengedit transaksi yang tampil di cabangnya, Owner bisa semua cabang
    function canEdit(sale: Sale) {
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
            `rekap-penjualan-${branchSlug}-${period}-${getIndonesianDate()}.csv`
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

        const dateStr = new Date().toLocaleDateString('id-ID', {
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

        const text = `*📊 REKAP PENJUALAN REKAPIN*
🏪 Cabang: ${branchTitle}
📅 Periode: ${periodLabel} (${dateStr})
----------------------------------------
💰 *Total Omzet: Rp${totalOmzet.toLocaleString('id-ID')}*
🧾 *Total Transaksi: ${totalTransaksi}*
📦 *Total Item Terjual: ${totalItems} pcs*${
            isOwner
                ? `\n💼 *Total HPP:* Rp${totalHpp.toLocaleString('id-ID')}\n📈 *Estimasi Laba Kotor:* Rp${labaKotor.toLocaleString('id-ID')}`
                : ''
        }

💳 *Metode Pembayaran:*
${paymentList || 'Belum ada transaksi'}

🛵 *Channel Penjualan:*
${channelList || 'Belum ada transaksi'}

🍱 *Menu Terlaris:*
${topList || 'Belum ada data'}
----------------------------------------
_Dicatat otomatis via Rekapin POS_`

        navigator.clipboard.writeText(text).then(() => {
            setCopiedToast(true)
            setTimeout(() => setCopiedToast(false), 3000)
        })
    }

    return (
        <div className="mx-auto max-w-2xl px-4 py-8 sm:py-16">
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Riwayat & Rekap</h1>
                    <p className="mt-1 text-sm text-gray-600">
                        {isOwner
                            ? selectedBranchId === 'all'
                                ? `Semua Cabang (${branches.length} cabang terdaftar)`
                                : `Cabang ${branches.find((b) => b.id === selectedBranchId)?.name ?? ''}`
                            : userBranchName
                            ? `Cabang ${userBranchName}`
                            : 'Transaksi penjualan'}
                    </p>
                </div>

                {/* Tombol Export CSV & Salin WA */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 active:bg-gray-100 transition cursor-pointer"
                        title="Unduh file Excel / CSV"
                    >
                        <span>📥</span>
                        <span>Export CSV</span>
                    </button>

                    <button
                        onClick={handleCopyWhatsApp}
                        className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 active:bg-emerald-800 transition cursor-pointer"
                        title="Salin rekap siap kirim ke WhatsApp"
                    >
                        <span>📋</span>
                        <span>{copiedToast ? 'Tersalin!' : 'Salin Rekap WA'}</span>
                    </button>
                </div>
            </div>

            {/* Filter Cabang (Khusus Owner jika memiliki cabang) */}
            {isOwner && branches.length > 0 && (
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-2xs">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 text-sm font-bold">
                            🏢
                        </span>
                        <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                Filter Cabang
                            </span>
                            <span className="text-xs font-extrabold text-gray-900">
                                {selectedBranchId === 'all'
                                    ? `Semua Cabang (${branches.length} cabang)`
                                    : `Cabang ${branches.find((b) => b.id === selectedBranchId)?.name ?? ''}`}
                            </span>
                        </div>
                    </div>

                    <select
                        value={selectedBranchId}
                        onChange={(e) => setSelectedBranchId(e.target.value)}
                        className="rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-bold text-gray-800 shadow-2xs focus:border-indigo-600 focus:bg-white focus:outline-none cursor-pointer"
                    >
                        <option value="all">Semua Cabang ({branches.length})</option>
                        {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                                Cabang {b.name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Toast Notifikasi Salin WA */}
            {copiedToast && (
                <div className="mb-4 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-medium text-emerald-800">
                    <div className="flex items-center gap-2">
                        <span>✅</span>
                        <span>Format Rekap WhatsApp berhasil disalin ke clipboard! Siap dipaste ke grup.</span>
                    </div>
                </div>
            )}

            {/* Tabs Filter Periode */}
            <div className="mb-6 flex rounded-xl border border-gray-200 bg-gray-100/80 p-1 text-xs font-semibold text-gray-600">
                {(
                    [
                        { id: 'hari_ini', label: 'Hari Ini' },
                        { id: 'minggu_ini', label: '7 Hari' },
                        { id: 'bulan_ini', label: 'Bulan Ini' },
                        { id: 'semua', label: 'Semua' },
                    ] as const
                ).map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setPeriod(tab.id)}
                        className={`flex-1 rounded-lg py-2 transition cursor-pointer ${
                            period === tab.id
                                ? 'bg-white text-gray-900 shadow-xs font-bold'
                                : 'hover:text-gray-900'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Rekap Summary Cards */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        Total Omzet ({periodLabel})
                    </div>
                    <div className="mt-1.5 text-xl font-extrabold text-gray-900 truncate">
                        Rp{totalOmzet.toLocaleString('id-ID')}
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        Transaksi
                    </div>
                    <div className="mt-1.5 text-xl font-extrabold text-gray-900">
                        {totalTransaksi} <span className="text-xs font-normal text-gray-500">struk</span>
                    </div>
                </div>

                <div className="col-span-2 sm:col-span-1 rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        Item Terjual
                    </div>
                    <div className="mt-1.5 text-xl font-extrabold text-gray-900">
                        {totalItems} <span className="text-xs font-normal text-gray-500">pcs</span>
                    </div>
                </div>

                {isOwner && (
                    <>
                        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
                            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                                Total HPP (Modal)
                            </div>
                            <div className="mt-1.5 text-lg font-bold text-gray-700 truncate">
                                Rp{totalHpp.toLocaleString('id-ID')}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
                            <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">
                                Laba Kotor
                            </div>
                            <div className="mt-1.5 text-lg font-bold text-emerald-800 truncate">
                                Rp{labaKotor.toLocaleString('id-ID')}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* List Transaksi */}
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                    Daftar Transaksi ({filteredSales.length})
                </h2>
                <span className="text-xs text-gray-500">Periode: {periodLabel}</span>
            </div>

            <div className="space-y-3">
                {filteredSales.map((sale) => (
                    <div
                        key={sale.id}
                        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs transition hover:border-gray-300"
                    >
                        <div className="flex items-start justify-between">
                            <div className="pr-2">
                                <div className="text-xs font-medium text-gray-500">
                                    {formatIndonesianDateTime(sale.transaction_date)}
                                    {isOwner && sale.branches?.name ? (
                                        <span className="ml-1.5 font-semibold text-gray-700">
                                            · 🏢 {sale.branches.name}
                                        </span>
                                    ) : ''}
                                </div>
                                <div className="mt-1.5 text-sm font-semibold text-gray-900">
                                    {sale.sale_items
                                        .map((i) => `${i.products?.name ?? 'Item'} (${i.quantity} ${i.products?.unit || 'x'})`)
                                        .join(', ')}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                                    <span className="rounded bg-gray-100 px-2 py-0.5 font-semibold uppercase text-gray-700">
                                        {sale.channel}
                                    </span>
                                    <span>·</span>
                                    <span className="capitalize font-medium text-gray-700">
                                        {sale.payment_method}
                                    </span>
                                    {sale.is_edited && (
                                        <button
                                            onClick={() => setAuditSale(sale)}
                                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200/90 px-2 py-0.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100 transition cursor-pointer"
                                            title="Klik untuk melihat riwayat audit perubahan"
                                        >
                                            <span>✏️ Diedit</span>
                                            <span className="font-normal underline decoration-amber-400">
                                                Audit Trail ➔
                                            </span>
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="text-right shrink-0">
                                <div className="text-base font-bold text-gray-900">
                                    Rp{sale.total.toLocaleString('id-ID')}
                                </div>
                                <div className="mt-1.5 flex items-center justify-end gap-1.5">
                                    {sale.is_edited && (
                                        <button
                                            onClick={() => setAuditSale(sale)}
                                            className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition cursor-pointer"
                                            title="Lihat riwayat perubahan transaksi (Audit Trail)"
                                        >
                                            <span>🕒</span>
                                            <span>Log</span>
                                        </button>
                                    )}
                                    {canEdit(sale) && (
                                        <button
                                            onClick={() => setEditingSale(sale)}
                                            className="flex items-center gap-1 rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:border-gray-400 hover:bg-gray-100 transition cursor-pointer"
                                        >
                                            <span>✏️</span>
                                            <span>Edit</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            setDeleteError(null)
                                            setDeletingSale(sale)
                                        }}
                                        className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:border-red-400 hover:bg-red-100 transition cursor-pointer"
                                        title="Hapus transaksi ini"
                                    >
                                        <span>🗑️</span>
                                        <span>Hapus</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {filteredSales.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
                        Tidak ada transaksi pada periode <strong>{periodLabel}</strong>.
                    </div>
                )}
            </div>

            {editingSale && (
                <EditSaleModal sale={editingSale} onClose={() => setEditingSale(null)} />
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

            {/* Modal Konfirmasi Hapus Transaksi */}
            {deletingSale && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
                    <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl">
                        <div className="mb-1 flex items-center gap-2">
                            <span className="text-2xl">🗑️</span>
                            <h2 className="text-base font-bold text-gray-900">Hapus Transaksi?</h2>
                        </div>
                        <p className="mb-1 text-sm text-gray-600">
                            Transaksi ini akan <strong className="text-red-600">dihapus permanen</strong> beserta semua item dan riwayat perubahannya.
                        </p>
                        <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700">
                            <div className="font-semibold text-gray-900">{new Date(deletingSale.transaction_date).toLocaleString('id-ID')}</div>
                            <div className="mt-0.5">
                                {deletingSale.sale_items.map((i) => `${i.products?.name ?? 'Item'} (${i.quantity} ${i.products?.unit || 'x'})`).join(', ')}
                            </div>
                            <div className="mt-1 font-bold text-gray-900">Rp{deletingSale.total.toLocaleString('id-ID')}</div>
                        </div>

                        {deleteError && (
                            <p className="mb-3 rounded-lg bg-red-50 p-2.5 text-xs font-medium text-red-700">{deleteError}</p>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setDeletingSale(null)
                                    setDeleteError(null)
                                }}
                                disabled={deleteLoading}
                                className="flex-1 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                            >
                                Batal
                            </button>
                            <button
                                onClick={async () => {
                                    setDeleteLoading(true)
                                    setDeleteError(null)
                                    const result = await deleteSale(deletingSale.id)
                                    setDeleteLoading(false)
                                    if (result.error) {
                                        setDeleteError(result.error)
                                    } else {
                                        setDeletingSale(null)
                                    }
                                }}
                                disabled={deleteLoading}
                                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white shadow hover:bg-red-700 transition disabled:opacity-50"
                            >
                                {deleteLoading ? 'Menghapus...' : 'Ya, Hapus'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}