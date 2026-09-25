'use client'

import { useState } from 'react'
import { updateSale } from './actions'

type SaleItem = {
    product_id: string
    quantity: number
    price: number
    cost_price: number
    products: { name: string; unit?: string } | null
}

type Sale = {
    id: string
    channel: string
    payment_method: string
    total: number
    is_edited: boolean
    transaction_date: string
    sale_items: SaleItem[]
}

const CHANNELS = ['offline', 'gofood', 'grabfood', 'shopeefood', 'whatsapp', 'qris', 'lainnya']
const PAYMENT_METHODS = ['cash', 'qris', 'transfer', 'lainnya']

export default function EditSaleModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
    // Deduplikasi item berdasarkan product_id saat modal dibuka.
    // Ini mengantisipasi data lama yang sudah terduplikasi akibat bug sebelumnya.
    const dedupedItems = () => {
        const map = new Map<string, { product_id: string; name: string; quantity: number; price: number; cost_price: number; unit?: string }>()
        for (const i of sale.sale_items) {
            const existing = map.get(i.product_id)
            if (existing) {
                existing.quantity += i.quantity
            } else {
                map.set(i.product_id, {
                    product_id: i.product_id,
                    name: i.products?.name ?? 'Produk',
                    quantity: i.quantity,
                    price: i.price,
                    cost_price: i.cost_price,
                    unit: i.products?.unit || 'pcs',
                })
            }
        }
        return Array.from(map.values())
    }

    const [items, setItems] = useState(dedupedItems)
    const [channel, setChannel] = useState(sale.channel)
    const [paymentMethod, setPaymentMethod] = useState(sale.payment_method)
    const [reason, setReason] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0)

    function changeQty(productId: string, delta: number) {
        setItems((prev) =>
            prev
                .map((i) => (i.product_id === productId ? { ...i, quantity: i.quantity + delta } : i))
                .filter((i) => i.quantity > 0)
        )
    }

    async function handleSave() {
        setSaving(true)
        setError(null)

        const result = await updateSale(sale.id, {
            channel,
            payment_method: paymentMethod,
            items,
            reason: reason.trim() || undefined,
        })

        setSaving(false)

        if (result.error) {
            setError(result.error)
            return
        }

        onClose()
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">Edit Transaksi</h2>
                    <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-600">
                        &times;
                    </button>
                </div>

                <div className="space-y-3">
                    {items.map((item) => (
                        <div key={item.product_id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-3">
                            <div>
                                <span className="text-sm font-medium text-gray-800">{item.name}</span>
                                <div className="text-[11px] text-gray-400">@Rp{item.price.toLocaleString('id-ID')} / {item.unit || 'pcs'}</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => changeQty(item.product_id, -1)}
                                    className="h-8 w-8 rounded-lg border border-gray-300 bg-white text-base font-bold text-gray-700 hover:bg-gray-100"
                                >
                                    -
                                </button>
                                <span className="min-w-6 text-center font-bold text-gray-900 text-xs">{item.quantity} {item.unit || 'pcs'}</span>
                                <button
                                    onClick={() => changeQty(item.product_id, 1)}
                                    className="h-8 w-8 rounded-lg border border-gray-300 bg-white text-base font-bold text-gray-700 hover:bg-gray-100"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="my-4 border-t border-gray-100 pt-3 flex items-baseline justify-between">
                    <span className="text-xs font-semibold uppercase text-gray-500">Total Baru</span>
                    <span className="text-lg font-extrabold text-gray-900">Rp{total.toLocaleString('id-ID')}</span>
                </div>

                <label className="mb-1 block text-xs font-medium text-gray-700">Channel</label>
                <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-black focus:outline-none"
                >
                    {CHANNELS.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </select>

                <label className="mb-1 block text-xs font-medium text-gray-700">Metode Bayar</label>
                <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="mb-4 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-black focus:outline-none"
                >
                    {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                            {m}
                        </option>
                    ))}
                </select>

                <label className="mb-1 block text-xs font-medium text-gray-700">
                    Alasan / Catatan Perubahan (Opsional)
                </label>
                <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Contoh: Salah hitung porsi, pelanggan ganti pembayaran, dll."
                    className="mb-4 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none"
                />

                {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

                <div className="flex gap-2 pt-2">
                    <button
                        onClick={onClose}
                        className="flex-1 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                    >
                        Batal
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || items.length === 0}
                        className="flex-1 rounded-lg bg-black py-2.5 text-sm font-semibold text-white shadow hover:bg-gray-800 transition disabled:opacity-50"
                    >
                        {saving ? 'Menyimpan...' : 'Simpan'}
                    </button>
                </div>
            </div>
        </div>
    )
}