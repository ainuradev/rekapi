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
    { value: 'custom', label: 'Pilih Tanggal Kustom...' },
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
                    <svg className="w-3.5 h-3.5 text-emerald-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="font-mono font-bold">
                        {asOfMode
                            ? `Per: ${endDate || startDate}`
                            : startDate === endDate
                            ? startDate
                            : `${startDate} → ${endDate}`}
                    </span>
                    <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                </button>
            )}

            {/* Modal Dialog Pemilih Tanggal Kustom */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px] animate-in fade-in duration-150">
                    <div className="w-full max-w-sm max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
                        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <h3 className="text-sm font-bold text-slate-900">
                                    {asOfMode ? 'Pilih Tanggal Posisi Neraca' : 'Pilih Rentang Tanggal Laporan'}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                                aria-label="Tutup"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleApplyCustom} className="flex-1 flex flex-col min-h-0">
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {/* Preset Cepat */}
                                <div>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
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
                                            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white focus:border-emerald-600 focus:outline-none"
                                        />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                Dari Tanggal:
                                            </label>
                                            <input
                                                type="date"
                                                required
                                                value={inputStart}
                                                onChange={(e) => setInputStart(e.target.value)}
                                                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white focus:border-emerald-600 focus:outline-none"
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
                                                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white focus:border-emerald-600 focus:outline-none"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 bg-white transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 rounded-lg transition shadow-2xs cursor-pointer"
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
