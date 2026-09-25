'use client'

import { useState, useEffect } from 'react'
import { getSaleAuditLogs } from './actions'

type AuditLog = {
    id: string
    sale_id: string
    edited_at: string
    reason: string | null
    old_data: {
        channel: string
        payment_method: string
        total: number
        items: { product_id?: string; name?: string; quantity: number; price: number }[]
    }
    new_data: {
        channel: string
        payment_method: string
        total: number
        items: { product_id?: string; name?: string; quantity: number; price: number }[]
    }
    profiles: {
        full_name: string | null
        role: string
    } | null
}

export default function AuditTrailModal({
    saleId,
    saleDate,
    saleTotal,
    branchName,
    onClose,
}: {
    saleId: string
    saleDate: string
    saleTotal: number
    branchName?: string | null
    onClose: () => void
}) {
    const [logs, setLogs] = useState<AuditLog[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let isMounted = true
        async function fetchLogs() {
            setLoading(true)
            setError(null)
            const result = await getSaleAuditLogs(saleId)
            if (!isMounted) return

            if (result.error) {
                setError(result.error)
            } else {
                setLogs(result.logs as AuditLog[])
            }
            setLoading(false)
        }

        fetchLogs()
        return () => {
            isMounted = false
        }
    }, [saleId])

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs p-0 sm:items-center sm:p-4">
            <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
                {/* Modal Header */}
                <div className="flex items-start justify-between border-b border-gray-100 pb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800 text-base font-bold">
                                🕒
                            </span>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Audit Trail Transaksi</h2>
                                <p className="text-xs text-gray-500">
                                    Riwayat perubahan data transaksi kasir
                                </p>
                            </div>
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-600">
                                ID: {saleId.slice(0, 8)}...
                            </span>
                            {branchName && (
                                <span className="rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                                    🏢 {branchName}
                                </span>
                            )}
                            <span className="font-semibold text-gray-700">
                                Total Saat Ini: Rp{saleTotal.toLocaleString('id-ID')}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="mt-4">
                    {loading && (
                        <div className="space-y-3 py-6">
                            <div className="h-20 w-full animate-pulse rounded-2xl bg-gray-100" />
                            <div className="h-20 w-full animate-pulse rounded-2xl bg-gray-100" />
                        </div>
                    )}

                    {error && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700">
                            {error}
                        </div>
                    )}

                    {!loading && !error && logs.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                            <div className="text-2xl mb-1">📋</div>
                            <p className="font-semibold text-gray-800">Belum ada riwayat perubahan</p>
                            <p className="mt-1 text-xs text-gray-500">
                                Transaksi ini belum pernah diedit sejak pertama kali diinput.
                            </p>
                        </div>
                    )}

                    {!loading && logs.length > 0 && (
                        <div className="space-y-4">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Tercatat {logs.length} kali perubahan:
                            </div>

                            {logs.map((log, index) => {
                                const revNumber = logs.length - index
                                const oldTotal = log.old_data?.total ?? 0
                                const newTotal = log.new_data?.total ?? 0
                                const isTotalChanged = oldTotal !== newTotal

                                const oldChannel = log.old_data?.channel
                                const newChannel = log.new_data?.channel
                                const isChannelChanged = oldChannel !== newChannel

                                const oldMethod = log.old_data?.payment_method
                                const newMethod = log.new_data?.payment_method
                                const isMethodChanged = oldMethod !== newMethod

                                const oldItems = log.old_data?.items ?? []
                                const newItems = log.new_data?.items ?? []

                                return (
                                    <div
                                        key={log.id}
                                        className="rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50/30 to-white p-4 shadow-xs"
                                    >
                                        {/* Revision Header */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 pb-2.5">
                                            <div className="flex items-center gap-2">
                                                <span className="rounded-md bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                                                    Revisi #{revNumber}
                                                </span>
                                                <span className="text-xs font-bold text-gray-800">
                                                    {log.profiles?.full_name || 'Pengguna'}
                                                </span>
                                                <span
                                                    className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                                                        log.profiles?.role === 'owner'
                                                            ? 'bg-black text-white'
                                                            : 'bg-blue-100 text-blue-700'
                                                    }`}
                                                >
                                                    {log.profiles?.role || 'Staff'}
                                                </span>
                                            </div>
                                            <span className="text-[11px] font-medium text-gray-500">
                                                {new Date(log.edited_at).toLocaleString('id-ID', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </span>
                                        </div>

                                        {/* Alasan Edit */}
                                        {log.reason && (
                                            <div className="mt-2.5 rounded-xl bg-amber-100/60 border border-amber-200 px-3 py-1.5 text-xs text-amber-900">
                                                <span className="font-bold">💬 Catatan / Alasan:</span>{' '}
                                                <span>&quot;{log.reason}&quot;</span>
                                            </div>
                                        )}

                                        {/* Diff Summary */}
                                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                                            {/* Total Diff */}
                                            <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-2.5">
                                                <span className="text-[10px] font-semibold text-gray-500 uppercase block">
                                                    Total Nilai
                                                </span>
                                                {isTotalChanged ? (
                                                    <div className="mt-0.5 flex items-center gap-1.5">
                                                        <span className="line-through text-red-600 font-medium">
                                                            Rp{oldTotal.toLocaleString('id-ID')}
                                                        </span>
                                                        <span>➔</span>
                                                        <span className="font-bold text-emerald-700">
                                                            Rp{newTotal.toLocaleString('id-ID')}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="font-semibold text-gray-700">
                                                        Rp{newTotal.toLocaleString('id-ID')} (Tetap)
                                                    </span>
                                                )}
                                            </div>

                                            {/* Channel Diff */}
                                            <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-2.5">
                                                <span className="text-[10px] font-semibold text-gray-500 uppercase block">
                                                    Channel
                                                </span>
                                                {isChannelChanged ? (
                                                    <div className="mt-0.5 flex items-center gap-1.5">
                                                        <span className="line-through text-red-600 uppercase font-medium">
                                                            {oldChannel}
                                                        </span>
                                                        <span>➔</span>
                                                        <span className="font-bold text-indigo-700 uppercase">
                                                            {newChannel}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="font-semibold text-gray-700 uppercase">
                                                        {newChannel}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Metode Pembayaran Diff */}
                                            <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-2.5">
                                                <span className="text-[10px] font-semibold text-gray-500 uppercase block">
                                                    Metode Bayar
                                                </span>
                                                {isMethodChanged ? (
                                                    <div className="mt-0.5 flex items-center gap-1.5">
                                                        <span className="line-through text-red-600 uppercase font-medium">
                                                            {oldMethod}
                                                        </span>
                                                        <span>➔</span>
                                                        <span className="font-bold text-emerald-700 uppercase">
                                                            {newMethod}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="font-semibold text-gray-700 uppercase">
                                                        {newMethod}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Perubahan Item / Menu */}
                                        <div className="mt-3 border-t border-amber-100/70 pt-2.5">
                                            <span className="text-[11px] font-bold text-gray-700 block mb-1.5">
                                                Rincian Item yang Diubah:
                                            </span>
                                            <div className="space-y-1 text-xs">
                                                {newItems.map((newItem) => {
                                                    const oldItem = oldItems.find(
                                                        (o) =>
                                                            (o.product_id && o.product_id === newItem.product_id) ||
                                                            o.name === newItem.name
                                                    )
                                                    const oldQty = oldItem ? oldItem.quantity : 0
                                                    const isQtyChanged = oldQty !== newItem.quantity

                                                    return (
                                                        <div
                                                            key={newItem.product_id || newItem.name}
                                                            className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${
                                                                isQtyChanged
                                                                    ? 'bg-amber-50 text-amber-950 font-medium'
                                                                    : 'text-gray-600'
                                                            }`}
                                                        >
                                                            <span>{newItem.name || 'Produk'}</span>
                                                            <div className="flex items-center gap-1.5">
                                                                {isQtyChanged ? (
                                                                    <>
                                                                        <span className="text-red-500 line-through">
                                                                            {oldQty}x
                                                                        </span>
                                                                        <span>➔</span>
                                                                        <span className="font-bold text-emerald-700">
                                                                            {newItem.quantity}x
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    <span>{newItem.quantity}x</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })}

                                                {/* Check if any item was deleted in new version */}
                                                {oldItems
                                                    .filter(
                                                        (o) =>
                                                            !newItems.some(
                                                                (n) =>
                                                                    (n.product_id && n.product_id === o.product_id) ||
                                                                    n.name === o.name
                                                            )
                                                    )
                                                    .map((deletedItem) => (
                                                        <div
                                                            key={deletedItem.product_id || deletedItem.name}
                                                            className="flex items-center justify-between rounded-lg bg-red-50 px-2.5 py-1.5 text-red-800 font-medium"
                                                        >
                                                            <span>{deletedItem.name || 'Produk'}</span>
                                                            <span className="text-red-600">
                                                                Dihapus ({deletedItem.quantity}x)
                                                            </span>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Footer button */}
                <div className="mt-5 border-t border-gray-100 pt-3">
                    <button
                        onClick={onClose}
                        className="w-full rounded-xl border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
                    >
                        Tutup
                    </button>
                </div>
            </div>
        </div>
    )
}
