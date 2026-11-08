'use client'

import { useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
export type { InvoiceItem, InvoiceData } from '@/lib/invoice'
import type { InvoiceData } from '@/lib/invoice'

interface InvoiceModalProps {
    isOpen: boolean
    onClose: () => void
    data: InvoiceData
}

export default function InvoiceModal({ isOpen, onClose, data }: InvoiceModalProps) {
    const [printFormat, setPrintFormat] = useState<'thermal' | 'standard'>('thermal')
    const [paperSize, setPaperSize] = useState<'58mm' | '80mm'>('58mm')
    const invoiceRef = useRef<HTMLDivElement>(null)

    const handlePrint = useReactToPrint({
        contentRef: invoiceRef,
    })

    const handleShare = async () => {
        const text = `Nota #${data.invoiceNumber}\n${data.businessName} ${data.branchName ? `(${data.branchName})` : ''}\nTotal: Rp ${data.total.toLocaleString('id-ID')}\nTanggal: ${data.date}\nMetode: ${data.paymentMethod || 'Tunai'}`

        if (typeof window !== 'undefined' && navigator.share) {
            try {
                await navigator.share({
                    title: `Nota #${data.invoiceNumber}`,
                    text: text,
                })
            } catch {
                // User cancelled share
            }
        } else if (typeof window !== 'undefined' && navigator.clipboard) {
            await navigator.clipboard.writeText(text)
            alert('Rincian nota berhasil disalin ke clipboard!')
        }
    }

    if (!isOpen) return null

    const hasAddress = Boolean(data.address && data.address.trim() !== '' && data.address !== 'undefined' && data.address !== 'null')
    const hasPhone = Boolean(data.phone && data.phone.trim() !== '' && data.phone !== 'undefined' && data.phone !== 'null')
    const hasLogo = Boolean(data.logoUrl && data.logoUrl.trim() !== '' && data.logoUrl !== 'undefined' && data.logoUrl !== 'null')

    const cashReceived = data.cashReceived ?? (data.paymentMethod?.toLowerCase().includes('cash') || data.paymentMethod?.toLowerCase().includes('tunai') ? data.total : undefined)
    const changeAmount = data.change ?? (cashReceived !== undefined ? Math.max(0, cashReceived - data.total) : undefined)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
            <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-slate-200 animate-in zoom-in-95 duration-150">
                {/* Header Modal Pinned */}
                <div className="shrink-0 flex items-center justify-between border-b border-slate-100 px-4 sm:px-6 py-3.5 bg-slate-50/50">
                    <div>
                        <h2 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
                            <svg className="w-4 h-4 text-emerald-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>Struk &amp; Nota Transaksi</span>
                            <span className="text-[10px] font-mono font-medium text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                                #{data.invoiceNumber}
                            </span>
                        </h2>
                        <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">Pratinjau sebelum cetak thermal atau download invoice.</p>
                    </div>

                    <button
                        onClick={onClose}
                        className="rounded-full w-7 h-7 flex items-center justify-center text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition cursor-pointer"
                    >
                        ✕
                    </button>
                </div>

                {/* Format Selector Bar Pinned */}
                <div className="shrink-0 flex flex-wrap items-center justify-between px-4 sm:px-6 py-2 bg-slate-100/70 border-b border-slate-200/60 text-xs gap-2">
                    <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-medium text-[11px]">Format:</span>
                        <div className="inline-flex rounded-lg bg-white p-0.5 shadow-2xs border border-slate-200">
                            <button
                                type="button"
                                onClick={() => setPrintFormat('thermal')}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                                    printFormat === 'thermal'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                Struk Thermal
                            </button>
                            <button
                                type="button"
                                onClick={() => setPrintFormat('standard')}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                                    printFormat === 'standard'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                Invoice A4
                            </button>
                        </div>
                    </div>

                    {printFormat === 'thermal' && (
                        <div className="flex items-center gap-1.5">
                            <span className="text-slate-500 font-medium text-[11px]">Lebar Kertas:</span>
                            <div className="inline-flex rounded-lg bg-white p-0.5 shadow-2xs border border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => setPaperSize('58mm')}
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold transition cursor-pointer ${
                                        paperSize === '58mm'
                                            ? 'bg-slate-900 text-white'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    58 mm
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPaperSize('80mm')}
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold transition cursor-pointer ${
                                        paperSize === '80mm'
                                            ? 'bg-slate-900 text-white'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    80 mm
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Printable Content Area */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-100/50 flex justify-center">
                    <div
                        ref={invoiceRef}
                        className={`bg-white transition-all text-slate-900 ${
                            printFormat === 'thermal'
                                ? `shadow-lg border border-slate-300/80 rounded-xl p-4.5 font-mono text-xs leading-tight ${
                                      paperSize === '58mm' ? 'w-[300px]' : 'w-[380px]'
                                  }`
                                : 'w-full rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6 font-sans'
                        }`}
                        style={{
                            colorScheme: 'light',
                        }}
                    >
                        {/* ────────────── FORMAT STRUK THERMAL (POS MINI PRINTER) ────────────── */}
                        {printFormat === 'thermal' ? (
                            <div className="space-y-2 text-slate-900 print:text-black">
                                {/* Header Struk */}
                                <div className="text-center pb-2">
                                    {hasLogo && (
                                        <img
                                            src={data.logoUrl}
                                            alt={data.businessName}
                                            className="mx-auto mb-1.5 max-h-12 max-w-[120px] object-contain filter grayscale"
                                            onError={(e) => {
                                                (e.target as HTMLElement).style.display = 'none'
                                            }}
                                        />
                                    )}
                                    <div className="font-extrabold text-sm uppercase tracking-wider">{data.businessName}</div>
                                    {data.branchName && (
                                        <div className="text-[11px] font-semibold text-slate-700">{data.branchName}</div>
                                    )}
                                    {hasAddress && (
                                        <div className="text-[10px] text-slate-600 leading-tight mt-0.5">{data.address}</div>
                                    )}
                                    {hasPhone && (
                                        <div className="text-[10px] text-slate-600 mt-0.5">Telp: {data.phone}</div>
                                    )}
                                </div>

                                <div className="border-b border-dashed border-slate-400 my-1" />

                                {/* Info Transaksi */}
                                <div className="text-[10px] space-y-0.5 text-slate-700">
                                    <div className="flex justify-between">
                                        <span>No: {data.invoiceNumber}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Tgl: {data.date}</span>
                                    </div>
                                    {data.cashierName && (
                                        <div className="flex justify-between">
                                            <span>Kasir: {data.cashierName}</span>
                                        </div>
                                    )}
                                    {data.customerName && (
                                        <div className="flex justify-between font-bold text-slate-900">
                                            <span>Plg: {data.customerName}</span>
                                        </div>
                                    )}
                                    {data.tableNumber && (
                                        <div className="flex justify-between font-bold text-slate-900">
                                            <span>Meja: {data.tableNumber}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="border-b border-dashed border-slate-400 my-1" />

                                {/* Daftar Item */}
                                <div className="space-y-1.5 text-[11px]">
                                    {data.items.map((item, idx) => (
                                        <div key={idx} className="space-y-0.5">
                                            <div className="font-semibold text-slate-900 truncate">{item.name}</div>
                                            <div className="flex justify-between text-[10px] text-slate-600">
                                                <span>
                                                    {item.quantity} x {item.price.toLocaleString('id-ID')}
                                                </span>
                                                <span className="font-medium text-slate-900">
                                                    {item.subtotal.toLocaleString('id-ID')}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="border-b border-dashed border-slate-400 my-1" />

                                {/* Rincian Pembayaran */}
                                <div className="space-y-1 text-[11px] pt-0.5">
                                    <div className="flex justify-between text-slate-600">
                                        <span>Subtotal</span>
                                        <span>Rp {data.subtotal.toLocaleString('id-ID')}</span>
                                    </div>

                                    {data.discount !== undefined && data.discount > 0 && (
                                        <div className="flex justify-between text-rose-600 font-medium">
                                            <span>Diskon</span>
                                            <span>- Rp {data.discount.toLocaleString('id-ID')}</span>
                                        </div>
                                    )}

                                    {data.tax !== undefined && data.tax > 0 && (
                                        <div className="flex justify-between text-slate-600">
                                            <span>Pajak</span>
                                            <span>Rp {data.tax.toLocaleString('id-ID')}</span>
                                        </div>
                                    )}

                                    <div className="flex justify-between font-extrabold text-xs text-slate-900 border-t border-dotted border-slate-400 pt-1">
                                        <span>TOTAL</span>
                                        <span>Rp {data.total.toLocaleString('id-ID')}</span>
                                    </div>

                                    <div className="border-b border-dotted border-slate-300 my-1" />

                                    <div className="flex justify-between text-[10px] text-slate-700">
                                        <span>Metode Bayar</span>
                                        <span className="font-bold uppercase">{data.paymentMethod || 'TUNAI'}</span>
                                    </div>

                                    {cashReceived !== undefined && cashReceived > 0 && (
                                        <>
                                            <div className="flex justify-between text-[10px] text-slate-700">
                                                <span>Uang Diterima</span>
                                                <span className="font-semibold">Rp {cashReceived.toLocaleString('id-ID')}</span>
                                            </div>
                                            <div className="flex justify-between text-[11px] font-bold text-slate-900">
                                                <span>Kembalian</span>
                                                <span>Rp {(changeAmount ?? 0).toLocaleString('id-ID')}</span>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="border-b border-dashed border-slate-400 my-1" />

                                {/* Catatan & Footer Struk */}
                                {data.notes && (
                                    <div className="text-[10px] text-slate-600 text-center italic">
                                        Catatan: {data.notes}
                                    </div>
                                )}

                                <div className="text-center pt-2 text-[9px] text-slate-500 leading-tight space-y-0.5">
                                    <p className="font-semibold">Terima kasih atas kunjungan Anda!</p>
                                    <p>Barang yang sudah dibeli tidak dapat ditukar/dikembalikan.</p>
                                    <p className="pt-1 text-[8px] text-slate-400">Powered by Rekapi POS</p>
                                </div>
                            </div>
                        ) : (
                            /* ────────────── FORMAT INVOICE STANDAR A4 ────────────── */
                            <div className="space-y-6">
                                <div className="border-b-2 border-slate-900 pb-4 text-center">
                                    {hasLogo && (
                                        <img
                                            src={data.logoUrl}
                                            alt={data.businessName}
                                            className="mx-auto mb-2 max-h-14 max-w-[140px] object-contain"
                                            onError={(e) => {
                                                (e.target as HTMLElement).style.display = 'none'
                                            }}
                                        />
                                    )}
                                    <h1 className="text-2xl font-bold text-slate-900">{data.businessName}</h1>
                                    {data.branchName && (
                                        <p className="mt-1 text-sm font-semibold text-slate-700">{data.branchName}</p>
                                    )}
                                    {hasAddress && <p className="mt-1 text-xs text-slate-600">{data.address}</p>}
                                    {hasPhone && <p className="mt-0.5 text-xs text-slate-600">Telp: {data.phone}</p>}
                                </div>

                                <div className="flex justify-between text-sm">
                                    <div>
                                        <p className="font-semibold text-slate-900">Invoice No:</p>
                                        <p className="text-slate-600">{data.invoiceNumber}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold text-slate-900">Tanggal:</p>
                                        <p className="text-slate-600">{data.date}</p>
                                    </div>
                                </div>

                                <div className="overflow-hidden rounded-lg border border-slate-200">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-100">
                                            <tr>
                                                <th className="px-4 py-2 text-left font-semibold text-slate-700">Item</th>
                                                <th className="px-4 py-2 text-center font-semibold text-slate-700">Qty</th>
                                                <th className="px-4 py-2 text-right font-semibold text-slate-700">Harga</th>
                                                <th className="px-4 py-2 text-right font-semibold text-slate-700">Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.items.map((item, idx) => (
                                                <tr key={idx} className="border-t border-slate-200">
                                                    <td className="px-4 py-2 text-slate-900">{item.name}</td>
                                                    <td className="px-4 py-2 text-center text-slate-600">{item.quantity}</td>
                                                    <td className="px-4 py-2 text-right text-slate-600">
                                                        Rp {item.price.toLocaleString('id-ID')}
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-medium text-slate-900">
                                                        Rp {item.subtotal.toLocaleString('id-ID')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="space-y-2 border-t-2 border-slate-900 pt-4">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Subtotal:</span>
                                        <span className="font-medium text-slate-900">
                                            Rp {data.subtotal.toLocaleString('id-ID')}
                                        </span>
                                    </div>
                                    {data.discount !== undefined && data.discount > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-600">Diskon:</span>
                                            <span className="font-medium text-rose-600">
                                                - Rp {data.discount.toLocaleString('id-ID')}
                                            </span>
                                        </div>
                                    )}
                                    {data.tax !== undefined && data.tax > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-600">Pajak:</span>
                                            <span className="font-medium text-slate-900">
                                                Rp {data.tax.toLocaleString('id-ID')}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex justify-between border-t border-slate-300 pt-2 text-lg">
                                        <span className="font-bold text-slate-900">Total:</span>
                                        <span className="font-bold text-slate-900">
                                            Rp {data.total.toLocaleString('id-ID')}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-1 border-t border-slate-200 pt-4 text-center text-xs text-slate-600">
                                    {data.paymentMethod && <p>Metode Pembayaran: {data.paymentMethod}</p>}
                                    {data.cashierName && <p>Kasir: {data.cashierName}</p>}
                                    <p className="mt-2 font-medium">Terima kasih atas kunjungan Anda!</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Modal Action Buttons Pinned */}
                <div className="shrink-0 flex items-center gap-2 border-t border-slate-200 px-4 sm:px-6 py-3 bg-slate-50">
                    <button
                        onClick={handlePrint}
                        className="flex-1 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 active:scale-[0.99] transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        <span>Cetak {printFormat === 'thermal' ? `Struk (${paperSize})` : 'Invoice'}</span>
                    </button>
                    <button
                        onClick={handleShare}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                        <span className="hidden sm:inline">Bagikan</span>
                    </button>
                    <button
                        onClick={onClose}
                        className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
                    >
                        Selesai
                    </button>
                </div>
            </div>
        </div>
    )
}
