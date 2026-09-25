'use client'

import { useState } from 'react'
import { updateCostPrice } from './actions'

export default function CostPriceEditor({
    productId,
    initialValue,
}: {
    productId: string
    initialValue: number
}) {
    const [value, setValue] = useState(initialValue)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    async function handleSave() {
        setSaving(true)
        setSaved(false)
        const result = await updateCostPrice(productId, value)
        setSaving(false)
        if (!result.error) {
            setSaved(true)
            setTimeout(() => setSaved(false), 1500)
        }
    }

    return (
        <div className="flex items-center gap-2">
            <input
                type="number"
                min={0}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className="w-28 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-sm text-gray-900 focus:border-black focus:outline-none"
            />
            <button
                onClick={handleSave}
                disabled={saving}
                className="text-xs text-blue-600 underline disabled:opacity-50"
            >
                {saving ? '...' : saved ? 'Tersimpan' : 'Simpan'}
            </button>
        </div>
    )
}