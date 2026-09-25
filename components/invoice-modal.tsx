'use client'

import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'

interface InvoiceItem {
    name: string
    quantity: number
    price: number
    subtotal: number
}

interface InvoiceData {
    invoiceNumber: string
    date: string
    businessName: string
    branchName?: string
    address?: string
    phone?: string
    items: InvoiceItem[]
    subtotal: number
    tax?: number
    discount?: number
    total: number
    paymentMethod?: string
    cashierName?: string
}

interface InvoiceModalProps {
    isOpen: boolean
    onClose: () => void
    data: InvoiceData
}

export default function InvoiceModal({ isOpen, onClose, data }: InvoiceModalProps) {
    const invoiceRef = useRef<HTMLDivElement>(null)

    const handlePrint = useReactToPrint({
        contentRef: invoiceRef,
    })

    const handleDownload = () => {
        if (handlePrint) {
            handlePrint()
        }
    }

    const handleShare = async () => {
        const text = `Invoice #${data.invoiceNumber}\n${data.businessName}\nTotal: Rp ${data.total.toLocaleString('id-ID')}\nTanggal: ${data.date}`

        if (typeof window !== 'undefined' && navigator.share) {
            try {
                await navigator.share({
                    title: `Invoice #${data.invoiceNumber}`,
                    text: text,
                })
            } catch (err) {
                console.log('Error sharing:', err)
            }
        } else if (typeof window !== 'undefined' && navigator.clipboard) {
            await navigator.clipboard.writeText(text)
            alert('Invoice disalin ke clipboard!')
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="relative w-full max-w-2xl rounded-lg bg-white shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <h2 className="text-lg font-bold text-slate-900">Invoice Transaksi</h2>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    >
                        ✕
                    </button>
                </div>

                {/* Invoice Content */}
                <div className="max-h-[70vh] overflow-y-auto p-6">
                    <div ref={invoiceRef} className="space-y-6 bg-white p-8">
                        {/* Business Header */}
                        <div className="border-b-2 border-slate-900 pb-4 text-center">
                            <h1 className="text-2xl font-bold text-slate-900">{data.businessName}</h1>
                            {data.branchName && (
                                <p className="mt-1 text-sm text-slate-600">{data.branchName}</p>
                            )}
                            {data.address && (
                                <p className="mt-1 text-xs text-slate-600">{data.address}</p>
                            )}
                            {data.phone && (
                                <p className="mt-1 text-xs text-slate-600">Telp: {data.phone}</p>
                            )}
                        </div>

                        {/* Invoice Info */}
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

                        {/* Items Table */}
                        <div className="overflow-hidden rounded-lg border border-slate-200">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-semibold text-slate-700">
                                            Item
                                        </th>
                                        <th className="px-4 py-2 text-center font-semibold text-slate-700">
                                            Qty
                                        </th>
                                        <th className="px-4 py-2 text-right font-semibold text-slate-700">
                                            Harga
                                        </th>
                                        <th className="px-4 py-2 text-right font-semibold text-slate-700">
                                            Subtotal
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.items.map((item, idx) => (
                                        <tr key={idx} className="border-t border-slate-200">
                                            <td className="px-4 py-2 text-slate-900">{item.name}</td>
                                            <td className="px-4 py-2 text-center text-slate-600">
                                                {item.quantity}
                                            </td>
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

                        {/* Totals */}
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
                                    <span className="font-medium text-red-600">
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

                        {/* Footer Info */}
                        <div className="space-y-1 border-t border-slate-200 pt-4 text-center text-xs text-slate-600">
                            {data.paymentMethod && (
                                <p>Metode Pembayaran: {data.paymentMethod}</p>
                            )}
                            {data.cashierName && <p>Kasir: {data.cashierName}</p>}
                            <p className="mt-2">Terima kasih atas kunjungan Anda!</p>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 border-t border-slate-200 px-6 py-4">
                    <button
                        onClick={handlePrint}
                        className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                        🖨️ Print
                    </button>
                    <button
                        onClick={handleDownload}
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                        📥 Download PDF
                    </button>
                    <button
                        onClick={handleShare}
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                        📤 Share
                    </button>
                </div>
            </div>
        </div>
    )
}
