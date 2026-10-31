'use client'

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { getIndonesianDate, getIndonesianPeriodRange } from '@/lib/date-utils'

export interface PeriodOption {
    value: string
    label: string
}

interface PeriodSelectProps {
    currentPeriod: string
    options?: PeriodOption[]
    className?: string
    startDate?: string
    endDate?: string
    asOfMode?: boolean
}

const DEFAULT_FINANCIAL_OPTIONS: PeriodOption[] = [
    { value: 'today', label: 'Hari Ini' },
    { value: 'week', label: 'Minggu Ini (7 Hari)' },
    { value: 'month', label: 'Bulan Ini' },
    { value: 'custom', label: '📅 Pilih Tanggal Kustom...' },
]

export default function PeriodSelect({
    currentPeriod,
    options = DEFAULT_FINANCIAL_OPTIONS,
    className = '',
    startDate = '',
    endDate = '',
    asOfMode = false,
}: PeriodSelectProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const todayStr = getIndonesianDate()
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [inputStart, setInputStart] = useState(startDate || todayStr)
    const [inputEnd, setInputEnd] = useState(endDate || startDate || todayStr)

    const isCustomActive = currentPeriod === 'custom' || Boolean(startDate && endDate)

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const nextPeriod = e.target.value
        if (nextPeriod === 'custom') {
            setInputStart(startDate || todayStr)
            setInputEnd(endDate || startDate || todayStr)
            setIsModalOpen(true)
            return
        }

        const params = new URLSearchParams(searchParams?.toString() ?? '')
        params.set('period', nextPeriod)
        params.delete('start_date')
        params.delete('end_date')
        params.delete('date')
        params.delete('as_of_date')
        router.push(`${pathname}?${params.toString()}`)
    }

    const handleApplyCustom = (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        let finalStart = inputStart || todayStr
        let finalEnd = inputEnd || inputStart || todayStr

        if (finalStart > finalEnd) {
            const temp = finalStart
            finalStart = finalEnd
            finalEnd = temp
        }

        const params = new URLSearchParams(searchParams?.toString() ?? '')
        params.set('period', 'custom')
        if (asOfMode) {
            params.set('as_of_date', finalEnd)
            params.set('end_date', finalEnd)
            params.delete('start_date')
        } else {
            params.set('start_date', finalStart)
            params.set('end_date', finalEnd)
            params.delete('as_of_date')
        }
        setIsModalOpen(false)
        router.push(`${pathname}?${params.toString()}`)
    }

    const handlePreset = (preset: 'today' | 'yesterday' | '7days' | 'this_month' | 'last_month') => {
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

    return (
        <div className={`relative inline-flex items-center gap-2 flex-wrap ${className}`}>
            <label htmlFor="period-select" className="sr-only">
                Pilih Periode
            </label>
            <div className="relative">
                <select
                    id="period-select"
                    value={isCustomActive ? 'custom' : currentPeriod}
                    onChange={handleChange}
                    className="appearance-none rounded-xl border border-slate-200 bg-white pl-3.5 pr-8 py-2 text-xs font-semibold text-slate-800 shadow-2xs hover:border-slate-300 focus:border-emerald-600 focus:outline-hidden focus:ring-2 focus:ring-emerald-600/20 transition cursor-pointer"
                >
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>

            {/* Tombol badge tanggal kustom aktif */}
            {isCustomActive && (startDate || endDate) && (
                <button
                    type="button"
                    onClick={() => {
                        setInputStart(startDate || todayStr)
                        setInputEnd(endDate || startDate || todayStr)
                        setIsModalOpen(true)
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer shadow-2xs"
                    title="Klik untuk mengubah rentang tanggal"
                >
                    <span>📅</span>
                    <span className="font-mono font-bold">
                        {asOfMode
                            ? `Per: ${endDate || startDate}`
                            : startDate === endDate
                            ? startDate
                            : `${startDate} → ${endDate}`}
                    </span>
                    <span className="text-[10px] text-emerald-600">✏️</span>
                </button>
            )}

            {/* Modal Dialog Pemilih Tanggal Kustom */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-100 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-base">📅</span>
                                <h3 className="text-sm font-bold text-slate-900">
                                    {asOfMode ? 'Pilih Tanggal Posisi Neraca' : 'Pilih Rentang Tanggal Laporan'}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-sm transition cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Preset Cepat */}
                        <div>
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Opsi Cepat:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => handlePreset('today')}
                                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                                >
                                    Hari Ini
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePreset('yesterday')}
                                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                                >
                                    Kemarin
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePreset('7days')}
                                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                                >
                                    7 Hari
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePreset('this_month')}
                                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                                >
                                    Bulan Ini
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePreset('last_month')}
                                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                                >
                                    Bulan Lalu
                                </button>
                            </div>
                        </div>

                        {/* Input Tanggal */}
                        <form onSubmit={handleApplyCustom} className="space-y-3 pt-1">
                            {asOfMode ? (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Posisi Per Tanggal:
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        value={inputEnd}
                                        onChange={(e) => {
                                            setInputEnd(e.target.value)
                                            setInputStart(e.target.value)
                                        }}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                                    />
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Dari Tanggal:
                                        </label>
                                        <input
                                            type="date"
                                            required
                                            value={inputStart}
                                            onChange={(e) => setInputStart(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Sampai Tanggal:
                                        </label>
                                        <input
                                            type="date"
                                            required
                                            value={inputEnd}
                                            onChange={(e) => setInputEnd(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-3.5 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-xs cursor-pointer"
                                >
                                    Terapkan Filter
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
