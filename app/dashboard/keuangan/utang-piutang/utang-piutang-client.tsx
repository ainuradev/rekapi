'use client'

import { useState, useTransition } from 'react'
import {
    createDebtPayable,
    payDebt,
    deleteDebtPayable,
    createReceivable,
    payReceivable,
    deleteReceivable,
} from '../actions'
import { FinancialAccount } from '../kas-rekening/kas-rekening-client'

export interface DebtRecord {
    id: string
    branch_id?: string | null
    supplier_id: string | null
    creditor_name: string
    title: string
    total_amount: number
    paid_amount: number
    due_date: string | null
    status: 'unpaid' | 'partial' | 'paid'
    notes: string | null
    created_at: string
    branches?: { name: string } | null
    purchases?: { branch_id?: string | null; branches?: { name: string } | null } | null
}

export interface ReceivableRecord {
    id: string
    branch_id?: string | null
    customer_id: string | null
    debtor_name: string
    sale_id: string | null
    title: string
    total_amount: number
    paid_amount: number
    due_date: string | null
    status: 'unpaid' | 'partial' | 'paid'
    notes: string | null
    created_at: string
    branches?: { name: string } | null
    sales?: { branch_id?: string | null; branches?: { name: string } | null } | null
}

interface Props {
    debts: DebtRecord[]
    receivables: ReceivableRecord[]
    accounts: FinancialAccount[]
    branches?: { id: string; name: string }[]
    activeBranchId?: string
}

function fmt(n: number) {
    return 'Rp' + Math.round(n).toLocaleString('id-ID')
}

export default function UtangPiutangClient({ debts, receivables, accounts, branches = [], activeBranchId = 'all' }: Props) {
    const [tab, setTab] = useState<'debts' | 'receivables'>('debts')
    const [isPending, startTransition] = useTransition()
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)

    // Modals
    const [openAddDebtModal, setOpenAddDebtModal] = useState(false)
    const [openPayDebtModal, setOpenPayDebtModal] = useState<DebtRecord | null>(null)
    const [openAddRecModal, setOpenAddRecModal] = useState(false)
    const [openPayRecModal, setOpenPayRecModal] = useState<ReceivableRecord | null>(null)

    // Form states - Add Debt
    const defaultBranchId = activeBranchId !== 'all' ? activeBranchId : (branches[0]?.id || '')
    const [debtTitle, setDebtTitle] = useState('')
    const [debtCreditor, setDebtCreditor] = useState('')
    const [debtTotal, setDebtTotal] = useState('')
    const [debtDueDate, setDebtDueDate] = useState('')
    const [debtNotes, setDebtNotes] = useState('')
    const [debtBranchId, setDebtBranchId] = useState(defaultBranchId)

    // Form states - Pay Debt
    const [payDebtAmt, setPayDebtAmt] = useState('')
    const [payDebtAccId, setPayDebtAccId] = useState(accounts[0]?.id || '')
    const [payDebtNotes, setPayDebtNotes] = useState('')

    // Form states - Add Receivable
    const [recTitle, setRecTitle] = useState('')
    const [recDebtor, setRecDebtor] = useState('')
    const [recTotal, setRecTotal] = useState('')
    const [recDueDate, setRecDueDate] = useState('')
    const [recNotes, setRecNotes] = useState('')
    const [recBranchId, setRecBranchId] = useState(defaultBranchId)

    // Form states - Pay Receivable
    const [payRecAmt, setPayRecAmt] = useState('')
    const [payRecAccId, setPayRecAccId] = useState(accounts[0]?.id || '')
    const [payRecNotes, setPayRecNotes] = useState('')

    // Computations Debts
    const totalDebts = debts.reduce((sum, d) => sum + Number(d.total_amount || 0), 0)
    const totalPaidDebts = debts.reduce((sum, d) => sum + Number(d.paid_amount || 0), 0)
    const remainingDebts = totalDebts - totalPaidDebts

    // Computations Receivables
    const totalReceivables = receivables.reduce((sum, r) => sum + Number(r.total_amount || 0), 0)
    const totalPaidRec = receivables.reduce((sum, r) => sum + Number(r.paid_amount || 0), 0)
    const remainingReceivables = totalReceivables - totalPaidRec

    function handleAddDebt(e: React.FormEvent) {
        e.preventDefault()
        setErrorMsg(null)
        setSuccessMsg(null)

        startTransition(async () => {
            const res = await createDebtPayable({
                title: debtTitle,
                creditor_name: debtCreditor,
                total_amount: Number(debtTotal) || 0,
                due_date: debtDueDate || undefined,
                notes: debtNotes,
                branch_id: debtBranchId || null,
            })

            if (res.error) {
                setErrorMsg(res.error)
            } else {
                setSuccessMsg('Kewajiban utang berhasil dicatat.')
                setOpenAddDebtModal(false)
                setDebtTitle('')
                setDebtCreditor('')
                setDebtTotal('')
                setDebtDueDate('')
                setDebtNotes('')
                setDebtBranchId(defaultBranchId)
            }
        })
    }

    function handlePayDebt(e: React.FormEvent) {
        e.preventDefault()
        if (!openPayDebtModal) return
        setErrorMsg(null)
        setSuccessMsg(null)

        startTransition(async () => {
            const res = await payDebt({
                debt_id: openPayDebtModal.id,
                payment_amount: Number(payDebtAmt) || 0,
                account_id: payDebtAccId,
                payment_date: new Date().toISOString().split('T')[0],
                notes: payDebtNotes,
            })

            if (res.error) {
                setErrorMsg(res.error)
            } else {
                setSuccessMsg('Pembayaran utang berhasil dibukukan.')
                setOpenPayDebtModal(null)
                setPayDebtAmt('')
                setPayDebtNotes('')
            }
        })
    }

    function handleDeleteDebt(id: string) {
        if (!confirm('Yakin ingin menghapus catatan utang ini?')) return
        startTransition(async () => {
            const res = await deleteDebtPayable(id)
            if (res.error) setErrorMsg(res.error)
            else setSuccessMsg('Catatan utang telah dihapus.')
        })
    }

    function handleAddReceivable(e: React.FormEvent) {
        e.preventDefault()
        setErrorMsg(null)
        setSuccessMsg(null)

        startTransition(async () => {
            const res = await createReceivable({
                title: recTitle,
                debtor_name: recDebtor,
                total_amount: Number(recTotal) || 0,
                due_date: recDueDate || undefined,
                notes: recNotes,
                branch_id: recBranchId || null,
            })

            if (res.error) {
                setErrorMsg(res.error)
            } else {
                setSuccessMsg('Piutang pelanggan berhasil dicatat.')
                setOpenAddRecModal(false)
                setRecTitle('')
                setRecDebtor('')
                setRecTotal('')
                setRecDueDate('')
                setRecNotes('')
                setRecBranchId(defaultBranchId)
            }
        })
    }

    function handlePayReceivable(e: React.FormEvent) {
        e.preventDefault()
        if (!openPayRecModal) return
        setErrorMsg(null)
        setSuccessMsg(null)

        startTransition(async () => {
            const res = await payReceivable({
                receivable_id: openPayRecModal.id,
                payment_amount: Number(payRecAmt) || 0,
                account_id: payRecAccId,
                payment_date: new Date().toISOString().split('T')[0],
                notes: payRecNotes,
            })

            if (res.error) {
                setErrorMsg(res.error)
            } else {
                setSuccessMsg('Penerimaan pembayaran piutang berhasil dibukukan ke kas/rekening.')
                setOpenPayRecModal(null)
                setPayRecAmt('')
                setPayRecNotes('')
            }
        })
    }

    function handleDeleteReceivable(id: string) {
        if (!confirm('Yakin ingin menghapus catatan piutang ini?')) return
        startTransition(async () => {
            const res = await deleteReceivable(id)
            if (res.error) setErrorMsg(res.error)
            else setSuccessMsg('Catatan piutang telah dihapus.')
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

            {/* KPI Cards Ringkasan */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
                    <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">Sisa Utang Usaha (Kewajiban)</p>
                    <p className="mt-2 text-2xl font-black text-rose-700">{fmt(remainingDebts)}</p>
                    <p className="mt-1 text-[11px] font-medium text-slate-500">Total utang belum terlunasi</p>
                </div>

                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Utang Sudah Dicicil/Lunas</p>
                    <p className="mt-2 text-2xl font-black text-slate-800">{fmt(totalPaidDebts)}</p>
                    <p className="mt-1 text-[11px] font-medium text-emerald-600">Terbayar via kas & rekening</p>
                </div>

                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Sisa Piutang (Hak Tagih)</p>
                    <p className="mt-2 text-2xl font-black text-amber-700">{fmt(remainingReceivables)}</p>
                    <p className="mt-1 text-[11px] font-medium text-slate-500">Uang toko yang masih di pelanggan</p>
                </div>

                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Piutang Berhasil Diterima</p>
                    <p className="mt-2 text-2xl font-black text-slate-800">{fmt(totalPaidRec)}</p>
                    <p className="mt-1 text-[11px] font-medium text-emerald-600">Sudah masuk ke kas/bank</p>
                </div>
            </div>

            {/* Tab Selector & Add Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setTab('debts')}
                        className={`px-4 py-2 text-xs font-extrabold rounded-xl transition ${
                            tab === 'debts'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        Utang Usaha ({debts.filter((d) => d.status !== 'paid').length} Aktif)
                    </button>
                    <button
                        onClick={() => setTab('receivables')}
                        className={`px-4 py-2 text-xs font-extrabold rounded-xl transition ${
                            tab === 'receivables'
                                ? 'bg-amber-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        Piutang Usaha ({receivables.filter((r) => r.status !== 'paid').length} Aktif)
                    </button>
                </div>

                {tab === 'debts' ? (
                    <button
                        onClick={() => setOpenAddDebtModal(true)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700 transition"
                    >
                        <span>+</span>
                        <span>Catat Utang Baru</span>
                    </button>
                ) : (
                    <button
                        onClick={() => setOpenAddRecModal(true)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700 transition"
                    >
                        <span>+</span>
                        <span>Catat Piutang Baru</span>
                    </button>
                )}
            </div>

            {/* TAB CONTENT: UTANG */}
            {tab === 'debts' && (
                <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
                    <h3 className="text-base font-extrabold text-slate-900 mb-1">Daftar Utang Usaha (Kewajiban Supplier & Pinjaman)</h3>
                    <p className="text-xs text-slate-500 mb-4">Catatan utang ke vendor bahan baku, tempo pembelian, dan jadwal jatuh tempo.</p>

                    {debts.length === 0 ? (
                        <div className="text-center py-12 text-xs text-slate-400">
                            Belum ada catatan utang. Klik tombol &ldquo;Catat Utang Baru&rdquo; untuk menambahkan.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-slate-700">
                                <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-100">
                                    <tr>
                                        <th className="px-4 py-3">Keperluan / Judul</th>
                                        <th className="px-4 py-3">Kreditur (Pemberi Utang)</th>
                                        <th className="px-4 py-3">Jatuh Tempo</th>
                                        <th className="px-4 py-3 text-right">Total Utang</th>
                                        <th className="px-4 py-3 text-right">Sudah Dibayar</th>
                                        <th className="px-4 py-3 text-right">Sisa Utang</th>
                                        <th className="px-4 py-3 text-center">Status</th>
                                        <th className="px-4 py-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {debts.map((d) => {
                                        const remaining = Number(d.total_amount || 0) - Number(d.paid_amount || 0)
                                        return (
                                            <tr key={d.id} className="hover:bg-slate-50/60 transition">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-slate-900">{d.title}</p>
                                                        {(d.branches?.name || d.purchases?.branches?.name) && (
                                                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                {d.branches?.name || d.purchases?.branches?.name}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {d.notes && <p className="text-[11px] text-slate-400">{d.notes}</p>}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-700">{d.creditor_name}</td>
                                                <td className="px-4 py-3 whitespace-nowrap text-slate-500">{d.due_date || '-'}</td>
                                                <td className="px-4 py-3 text-right whitespace-nowrap font-semibold">{fmt(d.total_amount)}</td>
                                                <td className="px-4 py-3 text-right whitespace-nowrap text-emerald-600 font-semibold">{fmt(d.paid_amount)}</td>
                                                <td className="px-4 py-3 text-right whitespace-nowrap font-extrabold text-rose-600">{fmt(remaining)}</td>
                                                <td className="px-4 py-3 text-center whitespace-nowrap">
                                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                        d.status === 'paid'
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                            : d.status === 'partial'
                                                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                    }`}>
                                                        {d.status === 'paid' ? 'Lunas' : d.status === 'partial' ? 'Dicicil' : 'Belum Bayar'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                                                    {d.status !== 'paid' && (
                                                        <button
                                                            onClick={() => {
                                                                setOpenPayDebtModal(d)
                                                                setPayDebtAmt(String(remaining))
                                                            }}
                                                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition"
                                                        >
                                                            Bayar / Cicil
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDeleteDebt(d.id)}
                                                        className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-red-600 hover:border-red-200 transition"
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
            )}

            {/* TAB CONTENT: PIUTANG */}
            {tab === 'receivables' && (
                <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
                    <h3 className="text-base font-extrabold text-slate-900 mb-1">Daftar Piutang Usaha (Tagihan Pelanggan / Bon Toko)</h3>
                    <p className="text-xs text-slate-500 mb-4">Catatan bon belanja pelanggan tempo, katering, dan penagihan piutang aktif.</p>

                    {receivables.length === 0 ? (
                        <div className="text-center py-12 text-xs text-slate-400">
                            Belum ada catatan piutang. Klik tombol &ldquo;Catat Piutang Baru&rdquo; untuk menambahkan.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-slate-700">
                                <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-100">
                                    <tr>
                                        <th className="px-4 py-3">Keterangan Piutang</th>
                                        <th className="px-4 py-3">Nama Pelanggan</th>
                                        <th className="px-4 py-3">Jatuh Tempo</th>
                                        <th className="px-4 py-3 text-right">Total Piutang</th>
                                        <th className="px-4 py-3 text-right">Sudah Diterima</th>
                                        <th className="px-4 py-3 text-right">Sisa Tagihan</th>
                                        <th className="px-4 py-3 text-center">Status</th>
                                        <th className="px-4 py-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {receivables.map((r) => {
                                        const remaining = Number(r.total_amount || 0) - Number(r.paid_amount || 0)
                                        return (
                                            <tr key={r.id} className="hover:bg-slate-50/60 transition">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-slate-900">{r.title}</p>
                                                        {(r.branches?.name || r.sales?.branches?.name) && (
                                                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                {r.branches?.name || r.sales?.branches?.name}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {r.notes && <p className="text-[11px] text-slate-400">{r.notes}</p>}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-700">{r.debtor_name}</td>
                                                <td className="px-4 py-3 whitespace-nowrap text-slate-500">{r.due_date || '-'}</td>
                                                <td className="px-4 py-3 text-right whitespace-nowrap font-semibold">{fmt(r.total_amount)}</td>
                                                <td className="px-4 py-3 text-right whitespace-nowrap text-emerald-600 font-semibold">{fmt(r.paid_amount)}</td>
                                                <td className="px-4 py-3 text-right whitespace-nowrap font-extrabold text-amber-600">{fmt(remaining)}</td>
                                                <td className="px-4 py-3 text-center whitespace-nowrap">
                                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                        r.status === 'paid'
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                            : r.status === 'partial'
                                                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                    }`}>
                                                        {r.status === 'paid' ? 'Lunas' : r.status === 'partial' ? 'Sebagian' : 'Belum Lunas'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                                                    {r.status !== 'paid' && (
                                                        <button
                                                            onClick={() => {
                                                                setOpenPayRecModal(r)
                                                                setPayRecAmt(String(remaining))
                                                            }}
                                                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition"
                                                        >
                                                            Terima Bayar
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDeleteReceivable(r.id)}
                                                        className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-red-600 hover:border-red-200 transition"
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
            )}

            {/* Modal Tambah Utang */}
            {openAddDebtModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px]">
                    <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
                        {/* Header Tetap */}
                        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-900">Catat Utang Usaha Baru</h3>
                            <button
                                type="button"
                                onClick={() => setOpenAddDebtModal(false)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                                aria-label="Tutup"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleAddDebt} className="flex-1 flex flex-col min-h-0">
                            {/* Body Scrollable */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                            {branches.length > 0 && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Lokasi / Cabang Terkait</label>
                                    <select
                                        value={debtBranchId}
                                        onChange={(e) => setDebtBranchId(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none bg-white cursor-pointer"
                                    >
                                        <option value="">Semua Cabang / Kantor Pusat</option>
                                        {branches.map((b) => (
                                            <option key={b.id} value={b.id}>
                                                {b.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Keperluan / Judul Utang</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Contoh: Pembelian Bahan Baku Biji Kopi"
                                    value={debtTitle}
                                    onChange={(e) => setDebtTitle(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Kreditur (Nama Supplier / Pihak Pemberi)</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Contoh: PT Sumber Pangan / Pak Budi"
                                    value={debtCreditor}
                                    onChange={(e) => setDebtCreditor(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Total Nominal Utang (Rp)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        required
                                        placeholder="0"
                                        value={debtTotal}
                                        onChange={(e) => setDebtTotal(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Jatuh Tempo (Opsional)</label>
                                    <input
                                        type="date"
                                        value={debtDueDate}
                                        onChange={(e) => setDebtDueDate(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan Tambahan (Opsional)</label>
                                <input
                                    type="text"
                                    placeholder="Syarat termin bayar 30 hari"
                                    value={debtNotes}
                                    onChange={(e) => setDebtNotes(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                />
                            </div>

                            </div>

                            {/* Footer Tetap */}
                            <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setOpenAddDebtModal(false)}
                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isPending}
                                    className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-rose-700 transition disabled:opacity-50 cursor-pointer"
                                >
                                    {isPending ? 'Menyimpan...' : 'Simpan Utang'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Bayar Utang */}
            {openPayDebtModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px]">
                    <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
                        {/* Header Tetap */}
                        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-900">Bayar / Cicil Utang</h3>
                            <button
                                type="button"
                                onClick={() => setOpenPayDebtModal(null)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                                aria-label="Tutup"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handlePayDebt} className="flex-1 flex flex-col min-h-0">
                            {/* Body Scrollable */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                            <div className="rounded-xl bg-slate-50 p-3 text-xs">
                                <p className="font-bold text-slate-900">{openPayDebtModal.title}</p>
                                <p className="text-slate-500">Kreditur: {openPayDebtModal.creditor_name}</p>
                                <p className="mt-1 font-bold text-rose-600">
                                    Sisa Utang: {fmt(Number(openPayDebtModal.total_amount || 0) - Number(openPayDebtModal.paid_amount || 0))}
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Nominal Pembayaran (Rp)</label>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    value={payDebtAmt}
                                    onChange={(e) => setPayDebtAmt(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Sumber Dana (Akun Kas / Rekening)</label>
                                <select
                                    value={payDebtAccId}
                                    onChange={(e) => setPayDebtAccId(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none bg-white cursor-pointer"
                                >
                                    {accounts.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.name} (Saldo: {fmt(a.current_balance)})
                                        </option>
                                    ))}
                                </select>
                                <p className="mt-1 text-[11px] text-slate-400">Saldo akun ini akan otomatis berkurang sesuai nominal yang dibayar.</p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Keterangan (Opsional)</label>
                                <input
                                    type="text"
                                    placeholder="Pelunasan via transfer m-Banking"
                                    value={payDebtNotes}
                                    onChange={(e) => setPayDebtNotes(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                />
                            </div>

                            </div>

                            {/* Footer Tetap */}
                            <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setOpenPayDebtModal(null)}
                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isPending}
                                    className="rounded-lg bg-emerald-800 px-4 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-900 transition disabled:opacity-50 cursor-pointer"
                                >
                                    {isPending ? 'Memproses...' : 'Konfirmasi Bayar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Tambah Piutang */}
            {openAddRecModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px]">
                    <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
                        {/* Header Tetap */}
                        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-900">Catat Piutang Usaha Baru</h3>
                            <button
                                type="button"
                                onClick={() => setOpenAddRecModal(false)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                                aria-label="Tutup"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleAddReceivable} className="flex-1 flex flex-col min-h-0">
                            {/* Body Scrollable */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                            {branches.length > 0 && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Lokasi / Cabang Terkait</label>
                                    <select
                                        value={recBranchId}
                                        onChange={(e) => setRecBranchId(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none bg-white cursor-pointer"
                                    >
                                        <option value="">Semua Cabang / Kantor Pusat</option>
                                        {branches.map((b) => (
                                            <option key={b.id} value={b.id}>
                                                {b.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Keterangan Piutang</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Contoh: Pesanan Katering Acara / Bon Pembeli"
                                    value={recTitle}
                                    onChange={(e) => setRecTitle(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Pelanggan / Peminjam</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Contoh: Ibu Rina / Kantor Dinas"
                                    value={recDebtor}
                                    onChange={(e) => setRecDebtor(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Total Tagihan Piutang (Rp)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        required
                                        placeholder="0"
                                        value={recTotal}
                                        onChange={(e) => setRecTotal(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Jatuh Tempo (Opsional)</label>
                                    <input
                                        type="date"
                                        value={recDueDate}
                                        onChange={(e) => setRecDueDate(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan Tambahan (Opsional)</label>
                                <input
                                    type="text"
                                    placeholder="Pelanggan berjanji bayar akhir bulan"
                                    value={recNotes}
                                    onChange={(e) => setRecNotes(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                />
                            </div>

                            </div>

                            {/* Footer Tetap */}
                            <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setOpenAddRecModal(false)}
                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isPending}
                                    className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-amber-700 transition disabled:opacity-50 cursor-pointer"
                                >
                                    {isPending ? 'Menyimpan...' : 'Simpan Piutang'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Terima Bayar Piutang */}
            {openPayRecModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-[1px]">
                    <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
                        {/* Header Tetap */}
                        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-900">Terima Pembayaran Piutang</h3>
                            <button
                                type="button"
                                onClick={() => setOpenPayRecModal(null)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                                aria-label="Tutup"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handlePayReceivable} className="flex-1 flex flex-col min-h-0">
                            {/* Body Scrollable */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                                <div className="rounded-lg bg-slate-50 p-3 text-xs border border-slate-200">
                                    <p className="font-bold text-slate-900">{openPayRecModal.title}</p>
                                    <p className="text-slate-500">Pelanggan: {openPayRecModal.debtor_name}</p>
                                    <p className="mt-1 font-bold text-amber-600 font-mono">
                                        Sisa Tagihan: {fmt(Number(openPayRecModal.total_amount || 0) - Number(openPayRecModal.paid_amount || 0))}
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nominal Diterima (Rp)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        required
                                        value={payRecAmt}
                                        onChange={(e) => setPayRecAmt(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Masuk ke Akun (Kas / Rekening Bank)</label>
                                    <select
                                        value={payRecAccId}
                                        onChange={(e) => setPayRecAccId(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none bg-white cursor-pointer"
                                    >
                                        {accounts.map((a) => (
                                            <option key={a.id} value={a.id}>
                                                {a.name} (Saldo: {fmt(a.current_balance)})
                                            </option>
                                        ))}
                                    </select>
                                    <p className="mt-1 text-[11px] text-slate-400">Saldo akun ini akan otomatis bertambah saat pelunasan diterima.</p>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Keterangan (Opsional)</label>
                                    <input
                                        type="text"
                                        placeholder="Diterima tunai di kasir / transfer bank"
                                        value={payRecNotes}
                                        onChange={(e) => setPayRecNotes(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Footer Tetap */}
                            <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setOpenPayRecModal(null)}
                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isPending}
                                    className="rounded-lg bg-emerald-800 px-4 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-900 transition disabled:opacity-50 cursor-pointer"
                                >
                                    {isPending ? 'Memproses...' : 'Konfirmasi Penerimaan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
