'use client'

import { useState, useTransition } from 'react'
import { createEquityRecord, deleteEquityRecord } from '../actions'
import { FinancialAccount } from '../kas-rekening/kas-rekening-client'

export interface EquityRecord {
    id: string
    title: string
    type: 'initial_capital' | 'additional_capital' | 'drawings_prive'
    amount: number
    account_id: string | null
    entry_date: string
    notes: string | null
    created_at: string
    financial_accounts?: {
        name: string
    } | null
}

interface Props {
    records: EquityRecord[]
    accounts: FinancialAccount[]
}

function fmt(n: number) {
    const rounded = Math.round(n)
    if (rounded < 0) {
        return '-Rp' + Math.abs(rounded).toLocaleString('id-ID')
    }
    return 'Rp' + rounded.toLocaleString('id-ID')
}

export default function ModalClient({ records, accounts }: Props) {
    const [isPending, startTransition] = useTransition()
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)
    const [openAddModal, setOpenAddModal] = useState(false)

    // Form states
    const [title, setTitle] = useState('')
    const [type, setType] = useState<'initial_capital' | 'additional_capital' | 'drawings_prive'>('initial_capital')
    const [amount, setAmount] = useState('')
    const [accountId, setAccountId] = useState('')
    const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0])
    const [notes, setNotes] = useState('')

    // Computations
    const initialCapital = records
        .filter((r) => r.type === 'initial_capital')
        .reduce((sum, r) => sum + Number(r.amount || 0), 0)

    const additionalCapital = records
        .filter((r) => r.type === 'additional_capital')
        .reduce((sum, r) => sum + Number(r.amount || 0), 0)

    const drawingsPrive = records
        .filter((r) => r.type === 'drawings_prive')
        .reduce((sum, r) => sum + Number(r.amount || 0), 0)

    const netEquity = initialCapital + additionalCapital - drawingsPrive

    function handleAddRecord(e: React.FormEvent) {
        e.preventDefault()
        setErrorMsg(null)
        setSuccessMsg(null)

        startTransition(async () => {
            const res = await createEquityRecord({
                title,
                type,
                amount: Number(amount) || 0,
                account_id: accountId || undefined,
                entry_date: entryDate,
                notes,
            })

            if (res.error) {
                setErrorMsg(res.error)
            } else {
                setSuccessMsg('Catatan permodalan usaha berhasil disimpan.')
                setOpenAddModal(false)
                setTitle('')
                setAmount('')
                setAccountId('')
                setNotes('')
            }
        })
    }

    function handleDeleteRecord(id: string) {
        if (!confirm('Yakin ingin menghapus catatan modal ini?')) return
        startTransition(async () => {
            const res = await deleteEquityRecord(id)
            if (res.error) setErrorMsg(res.error)
            else setSuccessMsg('Catatan modal telah dihapus.')
        })
    }

    return (
        <div className="space-y-8">
            {/* Alert Notifikasi */}
            {errorMsg && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700 flex items-center justify-between">
                    <span>{errorMsg}</span>
                    <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-700">✕</button>
                </div>
            )}
            {successMsg && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700 flex items-center justify-between">
                    <span>{successMsg}</span>
                    <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">✕</button>
                </div>
            )}

            {/* Stat Strip Horizontal (Clean & Compact) */}
            <div className="rounded-lg border border-slate-200 bg-white shadow-2xs overflow-hidden">
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-200">
                    <div className="p-3 sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Total Modal Bersih
                        </span>
                        <div className={`mt-1 text-base sm:text-lg font-bold tabular-nums truncate ${netEquity < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                            {fmt(netEquity)}
                        </div>
                        <span className="mt-0.5 text-[11px] text-slate-500 block">Ekuitas modal pemilik saat ini</span>
                    </div>

                    <div className="p-3 sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Modal Awal Pendirian
                        </span>
                        <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 tabular-nums truncate">
                            {fmt(initialCapital)}
                        </div>
                        <span className="mt-0.5 text-[11px] text-slate-500 block">Pondasi modal pertama</span>
                    </div>

                    <div className="p-3 sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Tambahan Modal Disetor
                        </span>
                        <div className="mt-1 text-base sm:text-lg font-bold text-emerald-800 tabular-nums truncate">
                            {fmt(additionalCapital)}
                        </div>
                        <span className="mt-0.5 text-[11px] text-slate-500 block">Injeksi dana ekspansi</span>
                    </div>

                    <div className="p-3 sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Prive (Penarikan Pribadi)
                        </span>
                        <div className="mt-1 text-base sm:text-lg font-bold text-rose-600 tabular-nums truncate">
                            {fmt(drawingsPrive)}
                        </div>
                        <span className="mt-0.5 text-[11px] text-slate-500 block">Penarikan dana pemilik</span>
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">Riwayat Setoran Modal & Prive Usaha</h2>
                    <p className="text-xs text-slate-500">Catat modal awal, suntikan modal pemilik, atau penarikan keperluan pribadi.</p>
                </div>

                <button
                    onClick={() => setOpenAddModal(true)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-900 active:bg-emerald-950 transition cursor-pointer"
                >
                    <span>+</span>
                    <span>Catat Transaksi Modal</span>
                </button>
            </div>

            {/* List Records */}
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-2xs">
                {records.length === 0 ? (
                    <div className="text-center py-12 text-xs text-slate-400">
                        Belum ada catatan modal usaha. Klik &ldquo;Catat Transaksi Modal&rdquo; untuk mendaftarkan modal awal atau tambahan modal.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-700">
                            <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-100">
                                <tr>
                                    <th className="px-4 py-3">Tanggal</th>
                                    <th className="px-4 py-3">Keterangan</th>
                                    <th className="px-4 py-3">Jenis Permodalan</th>
                                    <th className="px-4 py-3">Akun Penampung</th>
                                    <th className="px-4 py-3 text-right">Nominal</th>
                                    <th className="px-4 py-3 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {records.map((r) => {
                                    const isPrive = r.type === 'drawings_prive'
                                    return (
                                        <tr key={r.id} className="hover:bg-slate-50/60 transition">
                                            <td className="px-4 py-3 whitespace-nowrap text-slate-500">{r.entry_date}</td>
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-slate-900">{r.title}</p>
                                                {r.notes && <p className="text-[11px] text-slate-400">{r.notes}</p>}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                    r.type === 'initial_capital'
                                                        ? 'bg-slate-100 text-slate-800 border border-slate-200'
                                                        : r.type === 'additional_capital'
                                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                }`}>
                                                    {r.type === 'initial_capital' ? 'Modal Awal' : r.type === 'additional_capital' ? 'Tambahan Modal' : 'Prive (Tarik)'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-slate-600 font-medium">
                                                {r.financial_accounts?.name || 'Tanpa Akun (Di luar Kas)'}
                                            </td>
                                            <td className={`px-4 py-3 text-right whitespace-nowrap font-bold tabular-nums ${
                                                isPrive ? 'text-rose-600' : 'text-slate-900'
                                            }`}>
                                                {isPrive ? `-${fmt(r.amount)}` : `+${fmt(r.amount)}`}
                                            </td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                <button
                                                    onClick={() => handleDeleteRecord(r.id)}
                                                    className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-rose-600 hover:border-rose-200 transition cursor-pointer"
                                                >
                                                    Hapus
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal Tambah Transaksi Modal */}
            {openAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px]">
                    <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
                        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-900">Catat Transaksi Modal Usaha</h3>
                            <button
                                type="button"
                                onClick={() => setOpenAddModal(false)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                                aria-label="Tutup"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleAddRecord} className="flex-1 flex flex-col min-h-0">
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Transaksi</label>
                                    <select
                                        value={type}
                                        onChange={(e) =>
                                            setType(
                                                e.target.value as
                                                    | 'initial_capital'
                                                    | 'additional_capital'
                                                    | 'drawings_prive'
                                            )
                                        }
                                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white focus:border-emerald-600 focus:outline-none"
                                    >
                                        <option value="initial_capital">Setoran Modal Awal Pendirian Usaha</option>
                                        <option value="additional_capital">Tambahan Modal Disetor (Injeksi Dana)</option>
                                        <option value="drawings_prive">Prive Pemilik (Penarikan Dana untuk Pribadi)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Keterangan / Judul</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Contoh: Modal Awal Kas & Peralatan Kafe"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">Nominal (Rp)</label>
                                        <input
                                            type="number"
                                            min="1"
                                            required
                                            placeholder="0"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Transaksi</label>
                                        <input
                                            type="date"
                                            required
                                            value={entryDate}
                                            onChange={(e) => setEntryDate(e.target.value)}
                                            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Hubungkan ke Akun Kas / Bank (Opsional)</label>
                                    <select
                                        value={accountId}
                                        onChange={(e) => setAccountId(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white focus:border-emerald-600 focus:outline-none"
                                    >
                                        <option value="">-- Tidak Mempengaruhi Saldo Kas (Hanya Catatan) --</option>
                                        {accounts.map((a) => (
                                            <option key={a.id} value={a.id}>
                                                {a.name} (Saldo: {fmt(a.current_balance)})
                                            </option>
                                        ))}
                                    </select>
                                    <p className="mt-1 text-[11px] text-slate-400">
                                        Jika dipilih, saldo kas/rekening akan otomatis bertambah (untuk modal) atau berkurang (untuk prive).
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan Tambahan (Opsional)</label>
                                    <input
                                        type="text"
                                        placeholder="Disetor via tunai / transfer pribadi"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setOpenAddModal(false)}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isPending}
                                    className="rounded-lg bg-emerald-800 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-900 active:bg-emerald-950 transition disabled:opacity-50 cursor-pointer"
                                >
                                    {isPending ? 'Menyimpan...' : 'Simpan Transaksi'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
