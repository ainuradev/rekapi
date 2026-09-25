'use client'

import { useState } from 'react'
import { updateStock } from './actions'

export default function StockEditor({
    productId,
    initialStock,
    unit = 'pcs',
}: {
    productId: string
    initialStock: number
    unit?: string
}) {
    const [stock, setStock] = useState(initialStock)
    const [editing, setEditing] = useState(false)
    const [input, setInput] = useState(String(initialStock))
    const [saving, setSaving] = useState(false)

    async function handleSave() {
        const newStock = Number(input)
        if (isNaN(newStock) || newStock < 0) return
        setSaving(true)
        const result = await updateStock(productId, newStock)
        setSaving(false)
        if (result.error) {
            alert(result.error)
        } else {
            setStock(newStock)
            setEditing(false)
        }
    }

    const stockColor =
        stock === 0
            ? 'text-red-600 bg-red-50 border-red-200'
            : stock <= 5
            ? 'text-amber-700 bg-amber-50 border-amber-200'
            : 'text-green-700 bg-green-50 border-green-200'

    const stockLabel = stock === 0 ? '🔴 Habis' : stock <= 5 ? '🟡 Hampir habis' : '🟢 Tersedia'

    if (editing) {
        return (
            <div className="flex items-center gap-2">
                <input
                    type="number"
                    min={0}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSave()
                        if (e.key === 'Escape') setEditing(false)
                    }}
                    autoFocus
                    className="w-20 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm font-semibold text-gray-900 focus:border-black focus:outline-none"
                />
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-lg bg-black px-2.5 py-1 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50 transition"
                >
                    {saving ? '...' : 'Simpan'}
                </button>
                <button
                    onClick={() => setEditing(false)}
                    className="text-xs font-medium text-gray-500 hover:text-gray-700 transition"
                >
                    Batal
                </button>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${stockColor}`}>
                {stockLabel} · {stock} {unit}
            </span>
            <button
                onClick={() => {
                    setInput(String(stock))
                    setEditing(true)
                }}
                className="text-xs font-medium text-gray-500 hover:text-gray-800 underline decoration-gray-300 transition"
            >
                Edit
            </button>
        </div>
    )
}
