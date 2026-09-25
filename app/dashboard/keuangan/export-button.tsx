'use client'

import { useState, useRef, useEffect } from 'react'
import { getIndonesianDate, TIMEZONE_INDONESIA } from '@/lib/date-utils'

interface SummaryData {
    totalRevenue: number
    totalHPP: number
    grossProfit: number
    totalPurchases: number
    totalExpenses: number
    netProfit: number
}

interface ExpenseItem {
    id: string
    category: string
    categoryLabel: string
    amount: number
    description: string | null
    expense_date: string
    branchName: string | null
}

interface PurchaseItem {
    id: string
    supplier: string | null
    total: number
    purchase_date: string
    branchName: string | null
}

interface ExportButtonProps {
    businessName: string
    branchLabel: string
    periodLabel: string
    dateRangeStr: string
    summary: SummaryData
    expenses: ExpenseItem[]
    purchases: PurchaseItem[]
}

function fmt(n: number) {
    return 'Rp' + n.toLocaleString('id-ID')
}

function cleanSlug(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function ExportButton({
    businessName,
    branchLabel,
    periodLabel,
    dateRangeStr,
    summary,
    expenses,
    purchases,
}: ExportButtonProps) {
    const [open, setOpen] = useState(false)
    const [toastMessage, setToastMessage] = useState<string | null>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Tutup dropdown saat klik di luar
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        if (open) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [open])

    const todayStr = getIndonesianDate()
    const filePrefix = `laporan-keuangan-${cleanSlug(businessName)}-${cleanSlug(branchLabel)}-${cleanSlug(periodLabel)}-${todayStr}`

    // 1. Export Excel (.xls HTML table format dengan styling rapi)
    function handleExportXLS() {
        setOpen(false)

        const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Laporan Keuangan</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
  <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"/>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #111827; }
    .title { font-size: 16pt; font-weight: bold; color: #111827; margin-bottom: 4px; }
    .subtitle { font-size: 10pt; color: #6b7280; margin-bottom: 12px; }
    .section-title { font-size: 12pt; font-weight: bold; color: #1f2937; margin-top: 16px; margin-bottom: 6px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
    th { background-color: #1f2937; color: #ffffff; font-weight: bold; padding: 6px 10px; border: 1px solid #9ca3af; text-align: left; }
    td { padding: 6px 10px; border: 1px solid #d1d5db; vertical-align: middle; }
    .number { text-align: right; }
    .total-row { font-weight: bold; background-color: #f3f4f6; }
    .profit-positive { font-weight: bold; color: #065f46; background-color: #d1fae5; font-size: 12pt; }
    .profit-negative { font-weight: bold; color: #991b1b; background-color: #fee2e2; font-size: 12pt; }
  </style>
</head>
<body>
  <div class="title">LAPORAN KEUANGAN — ${businessName.toUpperCase()}</div>
  <div class="subtitle">
    Cabang: ${branchLabel} &nbsp;|&nbsp; Periode: ${periodLabel} (${dateRangeStr}) &nbsp;|&nbsp; Diunduh: ${new Date().toLocaleString('id-ID', { timeZone: TIMEZONE_INDONESIA })} WIB
  </div>

  <div class="section-title">1. RINGKASAN EKSEKUTIF (LABA RUGI)</div>
  <table>
    <thead>
      <tr>
        <th style="width: 320px;">Komponen Keuangan</th>
        <th style="width: 200px;" class="number">Nominal (Rp)</th>
        <th style="width: 250px;">Keterangan</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Pendapatan Penjualan</strong></td>
        <td class="number">${summary.totalRevenue.toLocaleString('id-ID')}</td>
        <td>Total omset transaksi kasir</td>
      </tr>
      <tr>
        <td>HPP (Harga Pokok Penjualan)</td>
        <td class="number">-${summary.totalHPP.toLocaleString('id-ID')}</td>
        <td>Modal bahan dari menu terjual</td>
      </tr>
      <tr class="total-row">
        <td><strong>Margin Kotor (Laba Kotor)</strong></td>
        <td class="number">${summary.grossProfit.toLocaleString('id-ID')}</td>
        <td>Pendapatan Penjualan − HPP</td>
      </tr>
      <tr>
        <td>Belanja Bahan Baku (Purchases)</td>
        <td class="number">-${summary.totalPurchases.toLocaleString('id-ID')}</td>
        <td>Pembelian stok bahan ke supplier</td>
      </tr>
      <tr>
        <td>Pengeluaran Operasional (Expenses)</td>
        <td class="number">-${summary.totalExpenses.toLocaleString('id-ID')}</td>
        <td>Gaji, sewa, listrik, utilitas, dll.</td>
      </tr>
      <tr class="${summary.netProfit >= 0 ? 'profit-positive' : 'profit-negative'}">
        <td><strong>LABA BERSIH</strong></td>
        <td class="number"><strong>${summary.netProfit.toLocaleString('id-ID')}</strong></td>
        <td><strong>${summary.netProfit >= 0 ? 'Surplus / Untung' : 'Defisit / Rugi'}</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">2. RINCIAN PENGELUARAN OPERASIONAL (${expenses.length} Entri)</div>
  <table>
    <thead>
      <tr>
        <th style="width: 40px;">No</th>
        <th style="width: 100px;">Tanggal</th>
        <th style="width: 140px;">Kategori</th>
        <th style="width: 220px;">Keterangan</th>
        <th style="width: 140px;">Cabang</th>
        <th style="width: 140px;" class="number">Nominal (Rp)</th>
      </tr>
    </thead>
    <tbody>
      ${
          expenses.length === 0
              ? '<tr><td colspan="6" style="text-align: center; color: #9ca3af;">Tidak ada pengeluaran operasional di periode ini.</td></tr>'
              : expenses
                    .map(
                        (e, idx) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td>${e.expense_date}</td>
        <td>${e.categoryLabel}</td>
        <td>${e.description || '-'}</td>
        <td>${e.branchName || 'Umum'}</td>
        <td class="number">${e.amount.toLocaleString('id-ID')}</td>
      </tr>`
                    )
                    .join('')
      }
      <tr class="total-row">
        <td colspan="5" style="text-align: right;"><strong>Total Pengeluaran Operasional</strong></td>
        <td class="number"><strong>${summary.totalExpenses.toLocaleString('id-ID')}</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">3. RINCIAN BELANJA BAHAN BAKU (${purchases.length} Entri)</div>
  <table>
    <thead>
      <tr>
        <th style="width: 40px;">No</th>
        <th style="width: 100px;">Tanggal</th>
        <th style="width: 200px;">Supplier</th>
        <th style="width: 140px;">Cabang</th>
        <th style="width: 140px;" class="number">Total (Rp)</th>
      </tr>
    </thead>
    <tbody>
      ${
          purchases.length === 0
              ? '<tr><td colspan="5" style="text-align: center; color: #9ca3af;">Tidak ada pembelian bahan baku di periode ini.</td></tr>'
              : purchases
                    .map(
                        (p, idx) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td>${p.purchase_date}</td>
        <td>${p.supplier || '-'}</td>
        <td>${p.branchName || 'Umum'}</td>
        <td class="number">${p.total.toLocaleString('id-ID')}</td>
      </tr>`
                    )
                    .join('')
      }
      <tr class="total-row">
        <td colspan="4" style="text-align: right;"><strong>Total Belanja Bahan Baku</strong></td>
        <td class="number"><strong>${summary.totalPurchases.toLocaleString('id-ID')}</strong></td>
      </tr>
    </tbody>
  </table>
</body>
</html>`

        const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${filePrefix}.xls`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        showToast('File Excel (.xls) berhasil diunduh!')
    }

    // 2. Export CSV (Kompatibel dengan semua program spreadsheet)
    function handleExportCSV() {
        setOpen(false)

        const rows: string[] = [
            `"LAPORAN KEUANGAN - ${businessName.replace(/"/g, '""')}"`,
            `"Cabang: ${branchLabel.replace(/"/g, '""')}"`,
            `"Periode: ${periodLabel} (${dateRangeStr})"`,
            `"Tanggal Export: ${new Date().toLocaleString('id-ID', { timeZone: TIMEZONE_INDONESIA })} WIB"`,
            '',
            '=== 1. RINGKASAN EKSEKUTIF (LABA RUGI) ===',
            'Komponen,Nominal (Rp),Keterangan',
            `"Pendapatan Penjualan",${summary.totalRevenue},"Total omset kasir"`,
            `"HPP (Bahan Terjual)",-${summary.totalHPP},"Modal bahan dari produk terjual"`,
            `"Margin Kotor",${summary.grossProfit},"Pendapatan - HPP"`,
            `"Belanja Bahan Baku",-${summary.totalPurchases},"Pembelian stok bahan"`,
            `"Pengeluaran Operasional",-${summary.totalExpenses},"Gaji, sewa, listrik, dll."`,
            `"LABA BERSIH",${summary.netProfit},"${summary.netProfit >= 0 ? 'Surplus / Untung' : 'Defisit / Rugi'}"`,
            '',
            '=== 2. RINCIAN PENGELUARAN OPERASIONAL ===',
            'No,Tanggal,Kategori,Keterangan,Cabang,Nominal (Rp)',
        ]

        if (expenses.length === 0) {
            rows.push('"Tidak ada pengeluaran operasional di periode ini",,,,,')
        } else {
            expenses.forEach((e, idx) => {
                rows.push(
                    [
                        idx + 1,
                        e.expense_date,
                        `"${e.categoryLabel.replace(/"/g, '""')}"`,
                        `"${(e.description || '-').replace(/"/g, '""')}"`,
                        `"${(e.branchName || 'Umum').replace(/"/g, '""')}"`,
                        e.amount,
                    ].join(',')
                )
            })
        }
        rows.push(`"Total Pengeluaran Operasional",,,,${summary.totalExpenses}`)

        rows.push('')
        rows.push('=== 3. RINCIAN BELANJA BAHAN BAKU ===')
        rows.push('No,Tanggal,Supplier,Cabang,Total (Rp)')

        if (purchases.length === 0) {
            rows.push('"Tidak ada pembelian bahan baku di periode ini",,,,')
        } else {
            purchases.forEach((p, idx) => {
                rows.push(
                    [
                        idx + 1,
                        p.purchase_date,
                        `"${(p.supplier || '-').replace(/"/g, '""')}"`,
                        `"${(p.branchName || 'Umum').replace(/"/g, '""')}"`,
                        p.total,
                    ].join(',')
                )
            })
        }
        rows.push(`"Total Belanja Bahan Baku",,,,${summary.totalPurchases}`)

        const csvContent = '\uFEFF' + rows.join('\n')
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${filePrefix}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        showToast('File CSV berhasil diunduh!')
    }

    // 3. Cetak / Simpan PDF
    function handlePrintPDF() {
        setOpen(false)
        window.print()
    }

    // 4. Salin Ringkasan WhatsApp
    function handleCopyWhatsApp() {
        setOpen(false)

        const topExpenses = expenses.slice(0, 5)
        const expenseLines =
            topExpenses.length > 0
                ? topExpenses.map((e) => `• ${e.categoryLabel}: ${fmt(e.amount)} ${e.description ? `(${e.description})` : ''}`).join('\n')
                : '• Tidak ada pengeluaran operasional'

        const text = `*📊 LAPORAN KEUANGAN REKAPIN*
🏪 Bisnis: *${businessName}*
🏢 Cabang: *${branchLabel}*
📅 Periode: *${periodLabel}* (${dateRangeStr})
----------------------------------------
💰 *Pendapatan Penjualan:* ${fmt(summary.totalRevenue)}
📦 *HPP (Bahan Terjual):* ${fmt(summary.totalHPP)}
📈 *Margin Kotor:* ${fmt(summary.grossProfit)}
🛒 *Belanja Bahan Baku:* ${fmt(summary.totalPurchases)}
💸 *Pengeluaran Operasional:* ${fmt(summary.totalExpenses)}
----------------------------------------
${summary.netProfit >= 0 ? '🟢' : '🔴'} *LABA BERSIH: ${fmt(summary.netProfit)}*

*Rincian Pengeluaran Teratas:*
${expenseLines}
${expenses.length > 5 ? `_(+${expenses.length - 5} pengeluaran lainnya)_\n` : ''}
_Laporan digenerate otomatis via Rekapin pada ${new Date().toLocaleDateString('id-ID', { timeZone: TIMEZONE_INDONESIA })}._`

        navigator.clipboard.writeText(text).then(() => {
            showToast('Ringkasan WhatsApp berhasil disalin ke clipboard!')
        })
    }

    function showToast(msg: string) {
        setToastMessage(msg)
        setTimeout(() => setToastMessage(null), 3500)
    }

    return (
        <div className="relative inline-block" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-2xs transition hover:border-black hover:text-gray-900 active:bg-gray-50 cursor-pointer"
                title="Export laporan keuangan ke Excel, PDF, atau salin ke WhatsApp"
            >
                <span className="text-sm">📥</span>
                <span>Export Laporan</span>
                <span className="text-[10px] text-gray-400">▼</span>
            </button>

            {/* Dropdown Menu */}
            {open && (
                <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 border-b border-gray-100">
                        <p className="text-xs font-bold text-gray-900">Format Export Laporan</p>
                        <p className="text-[10px] text-gray-500">
                            {branchLabel} — {periodLabel}
                        </p>
                    </div>

                    <div className="py-1 space-y-1">
                        {/* Excel XLS */}
                        <button
                            type="button"
                            onClick={handleExportXLS}
                            className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition hover:bg-emerald-50 hover:text-emerald-900 cursor-pointer group"
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-sm font-bold group-hover:bg-emerald-200">
                                📊
                            </span>
                            <div>
                                <span className="block font-bold text-gray-900 group-hover:text-emerald-900">
                                    Excel Spreadsheet (.xls)
                                </span>
                                <span className="block text-[10px] text-gray-500 group-hover:text-emerald-700">
                                    Tabel warna rapi, kalkulasi laba rugi & rincian
                                </span>
                            </div>
                        </button>

                        {/* Excel CSV */}
                        <button
                            type="button"
                            onClick={handleExportCSV}
                            className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition hover:bg-blue-50 hover:text-blue-900 cursor-pointer group"
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 text-sm font-bold group-hover:bg-blue-200">
                                📑
                            </span>
                            <div>
                                <span className="block font-bold text-gray-900 group-hover:text-blue-900">
                                    File CSV Universal (.csv)
                                </span>
                                <span className="block text-[10px] text-gray-500 group-hover:text-blue-700">
                                    Format data standar Google Sheets & Excel
                                </span>
                            </div>
                        </button>

                        {/* Print / PDF */}
                        <button
                            type="button"
                            onClick={handlePrintPDF}
                            className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition hover:bg-purple-50 hover:text-purple-900 cursor-pointer group"
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-700 text-sm font-bold group-hover:bg-purple-200">
                                🖨️
                            </span>
                            <div>
                                <span className="block font-bold text-gray-900 group-hover:text-purple-900">
                                    Cetak / Simpan PDF
                                </span>
                                <span className="block text-[10px] text-gray-500 group-hover:text-purple-700">
                                    Cetak dokumen atau simpan file PDF
                                </span>
                            </div>
                        </button>

                        {/* WhatsApp */}
                        <button
                            type="button"
                            onClick={handleCopyWhatsApp}
                            className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition hover:bg-emerald-50 hover:text-emerald-900 cursor-pointer group"
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-sm font-bold group-hover:bg-emerald-200">
                                📋
                            </span>
                            <div>
                                <span className="block font-bold text-gray-900 group-hover:text-emerald-900">
                                    Salin Rekap WhatsApp
                                </span>
                                <span className="block text-[10px] text-gray-500 group-hover:text-emerald-700">
                                    Format teks siap bagikan ke chat WA / rekan bisnis
                                </span>
                            </div>
                        </button>
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {toastMessage && (
                <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-gray-900 px-4 py-3 text-xs font-semibold text-white shadow-2xl animate-in slide-in-from-bottom-5">
                    <span>✓</span>
                    <span>{toastMessage}</span>
                </div>
            )}
        </div>
    )
}
