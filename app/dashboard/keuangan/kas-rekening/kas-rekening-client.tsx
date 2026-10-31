'use client'

import { useState, useTransition } from 'react'
import {
    createFinancialAccount,
    updateFinancialAccount,
    deleteFinancialAccount,
    setAccountInitialBalance,
    transferBetweenAccounts,
} from '../actions'

export interface FinancialAccount {
    id: string
    name: string
    type: 'cash' | 'bank' | 'e_wallet'
    bank_name: string | null
    account_number: string | null
    initial_balance: number
    current_balance: number
    is_default_cash: boolean
    is_default_bank: boolean
    status: string
    created_at: string
}

export interface FinancialTransaction {
    id: string
    account_id: string
    type: 'income' | 'expense' | 'transfer_in' | 'transfer_out'
    category: string
    amount: number
    description: string | null
    transaction_date: string
    created_at: string
    financial_accounts?: {
        name: string
        type: string
    } | null
}

export interface BranchCashSummary {
    branchId: string
    branchName: string
    todayCashIn: number
    todayNonCashIn: number
    todayExpenses: number
    todayNetContribution: number
}

interface Props {
    accounts: FinancialAccount[]
    transactions: FinancialTransaction[]
    businessName: string
    branchCashSummary?: BranchCashSummary | null
}

function fmt(n: number) {
    const rounded = Math.round(n)
    if (rounded < 0) {
        return '-Rp' + Math.abs(rounded).toLocaleString('id-ID')
    }
    return 'Rp' + rounded.toLocaleString('id-ID')
}

export default function KasRekeningClient({
    accounts,
    transactions,
    businessName: _businessName,
    branchCashSummary,
}: Props) {
    const [isPending, startTransition] = useTransition()
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)

    // Modals
    const [openAddModal, setOpenAddModal] = useState(false)
    const [openInitialModal, setOpenInitialModal] = useState<FinancialAccount | null>(null)
    const [openTransferModal, setOpenTransferModal] = useState(false)
    const [openEditModal, setOpenEditModal] = useState<FinancialAccount | null>(null)
    const [deleteConfirmAcc, setDeleteConfirmAcc] = useState<FinancialAccount | null>(null)

    // Form states - Add Account
    const [newName, setNewName] = useState('')
    const [newType, setNewType] = useState<'cash' | 'bank' | 'e_wallet'>('bank')
    const [newBankName, setNewBankName] = useState('')
    const [newAccNumber, setNewAccNumber] = useState('')
    const [newInitialBal, setNewInitialBal] = useState('')
    const [newIsDefaultCash, setNewIsDefaultCash] = useState(false)
    const [newIsDefaultBank, setNewIsDefaultBank] = useState(false)

    // Form states - Initial Balance
    const [targetInitialBal, setTargetInitialBal] = useState('')

    // Form states - Transfer
    const [fromAccId, setFromAccId] = useState(accounts[0]?.id || '')
    const [toAccId, setToAccId] = useState(accounts[1]?.id || '')
    const [transferAmount, setTransferAmount] = useState('')
    const [transferNotes, setTransferNotes] = useState('')

    // Computations
    const totalCash = accounts
        .filter((a) => a.type === 'cash')
        .reduce((sum, a) => sum + Number(a.current_balance || 0), 0)

    const totalBank = accounts
        .filter((a) => a.type !== 'cash')
        .reduce((sum, a) => sum + Number(a.current_balance || 0), 0)

    const totalAll = totalCash + totalBank

    const totalInitial = accounts.reduce((sum, a) => sum + Number(a.initial_balance || 0), 0)

    function handleAddAccount(e: React.FormEvent) {
        e.preventDefault()
        setErrorMsg(null)
        setSuccessMsg(null)

        startTransition(async () => {
            const res = await createFinancialAccount({
                name: newName,
                type: newType,
                bank_name: newBankName,
                account_number: newAccNumber,
                initial_balance: Number(newInitialBal) || 0,
                is_default_cash: newIsDefaultCash,
                is_default_bank: newIsDefaultBank,
            })

            if (res.error) {
                setErrorMsg(res.error)
            } else {
                setSuccessMsg('Akun kas / rekening berhasil ditambahkan.')
                setOpenAddModal(false)
                setNewName('')
                setNewBankName('')
                setNewAccNumber('')
                setNewInitialBal('')
                setNewIsDefaultCash(false)
                setNewIsDefaultBank(false)
            }
        })
    }

    function handleSetInitial(e: React.FormEvent) {
        e.preventDefault()
        if (!openInitialModal) return
        setErrorMsg(null)
        setSuccessMsg(null)

        startTransition(async () => {
            const res = await setAccountInitialBalance(openInitialModal.id, Number(targetInitialBal) || 0)
            if (res.error) {
                setErrorMsg(res.error)
            } else {
                setSuccessMsg(`Saldo awal untuk ${openInitialModal.name} berhasil diperbarui.`)
                setOpenInitialModal(null)
                setTargetInitialBal('')
            }
        })
    }

    function handleTransfer(e: React.FormEvent) {
        e.preventDefault()
        setErrorMsg(null)
        setSuccessMsg(null)

        startTransition(async () => {
            const res = await transferBetweenAccounts({
                from_account_id: fromAccId,
                to_account_id: toAccId,
                amount: Number(transferAmount) || 0,
                notes: transferNotes,
                transfer_date: new Date().toISOString().split('T')[0],
            })

            if (res.error) {
                setErrorMsg(res.error)
            } else {
                setSuccessMsg('Transfer dana antar akun berhasil dibukukan.')
                setOpenTransferModal(false)
                setTransferAmount('')
                setTransferNotes('')
            }
        })
    }

    function handleEditAccount(e: React.FormEvent) {
        e.preventDefault()
        if (!openEditModal) return
        setErrorMsg(null)
        setSuccessMsg(null)

        startTransition(async () => {
            const res = await updateFinancialAccount({
                id: openEditModal.id,
                name: openEditModal.name,
                bank_name: openEditModal.bank_name || undefined,
                account_number: openEditModal.account_number || undefined,
                is_default_cash: openEditModal.is_default_cash,
                is_default_bank: openEditModal.is_default_bank,
            })

            if (res.error) {
                setErrorMsg(res.error)
            } else {
                setSuccessMsg('Informasi akun berhasil disimpan.')
                setOpenEditModal(null)
            }
        })
    }

    function handleDeleteAccount(accId: string) {
        setErrorMsg(null)
        setSuccessMsg(null)

        startTransition(async () => {
            const res = await deleteFinancialAccount(accId)
            if (res.error) {
                setErrorMsg(res.error)
            } else {
                setSuccessMsg('Akun kas / rekening berhasil dihapus.')
                setDeleteConfirmAcc(null)
                if (openEditModal?.id === accId) {
                    setOpenEditModal(null)
                }
            }
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

            {/* Rekap Kas Operasional Cabang Aktif (Saat Filter Cabang Terpilih) */}
            {branchCashSummary && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 sm:p-5 shadow-2xs">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-emerald-200/70">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
                            <h2 className="text-xs sm:text-sm font-bold text-emerald-950 uppercase tracking-wide">
                                Rekap Kas Operasional Cabang: {branchCashSummary.branchName}
                            </h2>
                        </div>
                        <span className="self-start sm:self-auto inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-300">
                            Hari Ini • Operasional Kasir
                        </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-emerald-200/70 pt-3">
                        <div className="py-2.5 sm:py-0 sm:pr-4">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800/90 block">
                                Uang Tunai Masuk Hari Ini (Setoran Kasir)
                            </span>
                            <div className="mt-1 text-lg sm:text-xl font-extrabold text-emerald-950 tabular-nums">
                                {fmt(branchCashSummary.todayCashIn)}
                            </div>
                            <span className="text-[11px] text-emerald-700 block mt-0.5">
                                Fisik tunai wajib di laci kasir saat tutup toko
                            </span>
                        </div>

                        <div className="py-2.5 sm:py-0 sm:px-4">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800/90 block">
                                Uang Non-Tunai Masuk Hari Ini (QRIS/Transfer)
                            </span>
                            <div className="mt-1 text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums">
                                {fmt(branchCashSummary.todayNonCashIn)}
                            </div>
                            <span className="text-[11px] text-slate-600 block mt-0.5">
                                Langsung masuk ke rekening bank / QRIS
                            </span>
                        </div>

                        <div className="py-2.5 sm:py-0 sm:pl-4">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800/90 block">
                                Total Kontribusi Kas Bersih Cabang
                            </span>
                            <div className={`mt-1 text-lg sm:text-xl font-extrabold tabular-nums ${branchCashSummary.todayNetContribution < 0 ? 'text-rose-600' : 'text-emerald-900'}`}>
                                {fmt(branchCashSummary.todayNetContribution)}
                            </div>
                            <span className="text-[11px] text-emerald-700 block mt-0.5">
                                {branchCashSummary.todayExpenses > 0
                                    ? `Penerimaan setelah beban operasional cabang (${fmt(branchCashSummary.todayExpenses)})`
                                    : 'Total penerimaan cabang hari ini'}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Stat Strip Horizontal (Clean & Compact) */}
            <div className="rounded-lg border border-slate-200 bg-white shadow-2xs overflow-hidden">
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-200">
                    <div className="p-3 sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Total Kas & Bank
                        </span>
                        <div className={`mt-1 text-base sm:text-lg font-bold tabular-nums truncate ${totalAll < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                            {fmt(totalAll)}
                        </div>
                        <span className="mt-0.5 text-[11px] text-slate-500 block">Likuiditas siap pakai</span>
                    </div>

                    <div className="p-3 sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Kas Tunai (Fisik)
                        </span>
                        <div className={`mt-1 text-base sm:text-lg font-bold tabular-nums truncate ${totalCash < 0 ? 'text-rose-600' : 'text-emerald-800'}`}>
                            {fmt(totalCash)}
                        </div>
                        <span className="mt-0.5 text-[11px] text-slate-500 block">Penerimaan laci kasir</span>
                    </div>

                    <div className="p-3 sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Rekening Bank & QRIS
                        </span>
                        <div className={`mt-1 text-base sm:text-lg font-bold tabular-nums truncate ${totalBank < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                            {fmt(totalBank)}
                        </div>
                        <span className="mt-0.5 text-[11px] text-slate-500 block">Bank, e-wallet & digital</span>
                    </div>

                    <div className="p-3 sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Total Saldo Awal
                        </span>
                        <div className="mt-1 text-base sm:text-lg font-bold text-slate-700 tabular-nums truncate">
                            {fmt(totalInitial)}
                        </div>
                        <span className="mt-0.5 text-[11px] text-slate-500 block">Modal kas pembukuan awal</span>
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">Daftar Akun Kas & Rekening Bank</h2>
                    <p className="text-xs text-slate-500">Kelola buku kas toko, nomor rekening bank, saldo awal, dan akun penampung kasir.</p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setOpenTransferModal(true)}
                        disabled={accounts.length < 2}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition disabled:opacity-50 cursor-pointer"
                    >
                        <span>⇄</span>
                        <span>Transfer / Setor Kas</span>
                    </button>
                    <button
                        onClick={() => setOpenAddModal(true)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-900 active:bg-emerald-950 transition cursor-pointer"
                    >
                        <span>+</span>
                        <span>Tambah Akun Baru</span>
                    </button>
                </div>
            </div>

            {/* List Akun Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {accounts.map((acc) => (
                    <div
                        key={acc.id}
                        className="rounded-lg border border-slate-200 bg-white p-5 shadow-2xs hover:border-emerald-600 transition flex flex-col justify-between"
                    >
                        <div>
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                        acc.type === 'cash'
                                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                            : acc.type === 'e_wallet'
                                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                            : 'bg-slate-100 text-slate-800 border border-slate-200'
                                    }`}>
                                        {acc.type === 'cash' ? 'Kas Tunai' : acc.type === 'e_wallet' ? 'E-Wallet' : 'Rekening Bank'}
                                    </span>
                                    <h3 className="mt-2 text-base font-bold text-slate-900">{acc.name}</h3>
                                    {acc.bank_name && (
                                        <p className="text-xs text-slate-500 font-medium">
                                            {acc.bank_name} {acc.account_number ? `• ${acc.account_number}` : ''}
                                        </p>
                                    )}
                                </div>

                                <div className="flex flex-col items-end gap-1">
                                    {acc.is_default_cash && (
                                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                            Default Kasir Tunai
                                        </span>
                                    )}
                                    {acc.is_default_bank && (
                                        <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                            Default Kasir Non-Tunai
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="mt-5 space-y-1.5 border-t border-slate-100 pt-4">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">Saldo Awal:</span>
                                    <span className="font-semibold text-slate-700 tabular-nums">{fmt(acc.initial_balance)}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">Saldo Berjalan:</span>
                                    <span className={`text-base font-bold tabular-nums ${acc.current_balance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                                        {fmt(acc.current_balance)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
                            <button
                                type="button"
                                onClick={() => setDeleteConfirmAcc(acc)}
                                disabled={accounts.length <= 1}
                                title={accounts.length <= 1 ? 'Bisnis harus memiliki minimal 1 akun' : 'Hapus Akun'}
                                className="text-[11px] font-semibold text-slate-400 hover:text-rose-600 px-2 py-1 rounded hover:bg-rose-50 transition disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-transparent cursor-pointer"
                            >
                                Hapus
                            </button>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => {
                                        setOpenInitialModal(acc)
                                        setTargetInitialBal(String(acc.initial_balance || 0))
                                    }}
                                    className="text-[11px] font-semibold text-slate-600 hover:text-emerald-800 px-2 py-1 rounded hover:bg-slate-50 transition cursor-pointer"
                                >
                                    Atur Saldo Awal
                                </button>
                                <button
                                    onClick={() => setOpenEditModal(acc)}
                                    className="text-[11px] font-semibold text-slate-600 hover:text-emerald-800 px-2 py-1 rounded hover:bg-slate-50 transition cursor-pointer"
                                >
                                    Edit Akun
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Riwayat Mutasi Kas & Bank Terkini */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                    <div>
                        <h3 className="text-base font-extrabold text-slate-900">Jurnal Mutasi Kas & Rekening Terkini</h3>
                        <p className="text-xs text-slate-500">Aliran kas masuk dari penjualan kasir, pembayaran beban, dan transfer dana.</p>
                    </div>
                    <span className="text-xs font-semibold text-slate-400">{transactions.length} mutasi tercatat</span>
                </div>

                {transactions.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-400">
                        Belum ada mutasi keuangan tercatat. Penjualan dari kasir POS akan otomatis tercatat di sini.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-700">
                            <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-100">
                                <tr>
                                    <th className="px-4 py-3">Tanggal</th>
                                    <th className="px-4 py-3">Akun</th>
                                    <th className="px-4 py-3">Kategori</th>
                                    <th className="px-4 py-3">Keterangan</th>
                                    <th className="px-4 py-3 text-right">Nominal</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {transactions.map((tx) => {
                                    const isIncome = tx.type === 'income' || tx.type === 'transfer_in'
                                    return (
                                        <tr key={tx.id} className="hover:bg-slate-50/60 transition">
                                            <td className="px-4 py-3 whitespace-nowrap text-slate-500">{tx.transaction_date}</td>
                                            <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-900">
                                                {tx.financial_accounts?.name || 'Kas / Bank'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                                    tx.category === 'sale'
                                                        ? 'bg-emerald-50 text-emerald-700'
                                                        : tx.category === 'expense'
                                                        ? 'bg-rose-50 text-rose-700'
                                                        : tx.category === 'transfer'
                                                        ? 'bg-blue-50 text-blue-700'
                                                        : 'bg-purple-50 text-purple-700'
                                                }`}>
                                                    {tx.category}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">{tx.description || '-'}</td>
                                            <td className={`px-4 py-3 text-right whitespace-nowrap font-extrabold ${
                                                isIncome ? 'text-emerald-600' : 'text-rose-600'
                                            }`}>
                                                {isIncome ? `+${fmt(tx.amount)}` : `-${fmt(tx.amount)}`}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal Tambah Akun Baru */}
            {openAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                            <h3 className="text-base font-bold text-slate-900">Tambah Akun Kas / Rekening</h3>
                            <button onClick={() => setOpenAddModal(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
                        </div>

                        <form onSubmit={handleAddAccount} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Akun</label>
                                <select
                                    value={newType}
                                    onChange={(e) => setNewType(e.target.value as 'cash' | 'bank' | 'e_wallet')}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                                >
                                    <option value="cash">Kas Tunai (Fisik / Brankas / Kasir)</option>
                                    <option value="bank">Rekening Bank (BCA, Mandiri, BRI, dll)</option>
                                    <option value="e_wallet">E-Wallet / QRIS (GoPay, OVO, ShopeePay)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Akun / Buku Kas</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Contoh: BCA Operasional Toko"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                                />
                            </div>

                            {newType !== 'cash' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Bank / Penyedia</label>
                                        <input
                                            type="text"
                                            placeholder="Contoh: BCA"
                                            value={newBankName}
                                            onChange={(e) => setNewBankName(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor Rekening</label>
                                        <input
                                            type="text"
                                            placeholder="1234567890"
                                            value={newAccNumber}
                                            onChange={(e) => setNewAccNumber(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                                        />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Saldo Awal (Rp)</label>
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={newInitialBal}
                                    onChange={(e) => setNewInitialBal(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                                />
                                <p className="mt-1 text-[11px] text-slate-400">Saldo kas yang sudah Anda miliki saat mulai pembukuan.</p>
                            </div>

                            <div className="space-y-2 pt-2 border-t border-slate-100">
                                {newType === 'cash' ? (
                                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newIsDefaultCash}
                                            onChange={(e) => setNewIsDefaultCash(e.target.checked)}
                                            className="rounded text-blue-600 focus:ring-blue-500"
                                        />
                                        <span>Jadikan akun penampung utama penjualan tunai kasir</span>
                                    </label>
                                ) : (
                                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newIsDefaultBank}
                                            onChange={(e) => setNewIsDefaultBank(e.target.checked)}
                                            className="rounded text-blue-600 focus:ring-blue-500"
                                        />
                                        <span>Jadikan akun penampung utama penjualan transfer/QRIS kasir</span>
                                    </label>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setOpenAddModal(false)}
                                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isPending}
                                    className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-900 active:bg-emerald-950 transition disabled:opacity-50 cursor-pointer"
                                >
                                    {isPending ? 'Menyimpan...' : 'Simpan Akun'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Atur Saldo Awal */}
            {openInitialModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
                        <h3 className="text-base font-bold text-slate-900 mb-1">Atur Saldo Awal</h3>
                        <p className="text-xs text-slate-500 mb-4">{openInitialModal.name}</p>

                        <form onSubmit={handleSetInitial} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Saldo Awal Baru (Rp)</label>
                                <input
                                    type="number"
                                    min="0"
                                    required
                                    value={targetInitialBal}
                                    onChange={(e) => setTargetInitialBal(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                />
                                <p className="mt-2 text-[11px] text-slate-500 italic">
                                    *Saldo awal hanya diatur 1x saat pembukaan akun. Untuk menyetor uang laci kasir saat tutup toko atau menambah uang kembalian harian, gunakan tombol Transfer / Setor Kas.
                                </p>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setOpenInitialModal(null)}
                                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isPending}
                                    className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-900 active:bg-emerald-950 transition disabled:opacity-50 cursor-pointer"
                                >
                                    {isPending ? 'Menyimpan...' : 'Simpan Saldo Awal'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Transfer / Setor Kas */}
            {openTransferModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                            <h3 className="text-base font-bold text-slate-900">Transfer / Setor Kas</h3>
                            <button onClick={() => setOpenTransferModal(false)} className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer">✕</button>
                        </div>

                        <form onSubmit={handleTransfer} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Dari Akun (Sumber)</label>
                                <select
                                    value={fromAccId}
                                    onChange={(e) => setFromAccId(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                >
                                    {accounts.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.name} (Saldo: {fmt(a.current_balance)})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Ke Akun (Tujuan)</label>
                                <select
                                    value={toAccId}
                                    onChange={(e) => setToAccId(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                >
                                    {accounts.map((a) => (
                                        <option key={a.id} value={a.id} disabled={a.id === fromAccId}>
                                            {a.name} (Saldo: {fmt(a.current_balance)})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Nominal Transfer (Rp)</label>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    placeholder="Contoh: 500000"
                                    value={transferAmount}
                                    onChange={(e) => setTransferAmount(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan / Keperluan (Opsional)</label>
                                <input
                                    type="text"
                                    placeholder="Setor hasil kasir harian ke rekening BCA"
                                    value={transferNotes}
                                    onChange={(e) => setTransferNotes(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setOpenTransferModal(false)}
                                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isPending}
                                    className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-900 active:bg-emerald-950 transition disabled:opacity-50 cursor-pointer"
                                >
                                    {isPending ? 'Memproses...' : 'Proses Transfer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}


            {/* Modal Edit Akun */}
            {openEditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                            <h3 className="text-base font-bold text-slate-900">Edit Akun Kas / Rekening</h3>
                            <button onClick={() => setOpenEditModal(null)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
                        </div>

                        <form onSubmit={handleEditAccount} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Akun</label>
                                <input
                                    type="text"
                                    required
                                    value={openEditModal.name}
                                    onChange={(e) => setOpenEditModal({ ...openEditModal, name: e.target.value })}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                                />
                            </div>

                            {openEditModal.type !== 'cash' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">Bank / Provider</label>
                                        <input
                                            type="text"
                                            value={openEditModal.bank_name || ''}
                                            onChange={(e) => setOpenEditModal({ ...openEditModal, bank_name: e.target.value })}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">No. Rekening</label>
                                        <input
                                            type="text"
                                            value={openEditModal.account_number || ''}
                                            onChange={(e) => setOpenEditModal({ ...openEditModal, account_number: e.target.value })}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2 pt-2 border-t border-slate-100">
                                {openEditModal.type === 'cash' ? (
                                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={openEditModal.is_default_cash}
                                            onChange={(e) => setOpenEditModal({ ...openEditModal, is_default_cash: e.target.checked })}
                                            className="rounded text-blue-600 focus:ring-blue-500"
                                        />
                                        <span>Jadikan akun penampung utama penjualan tunai kasir</span>
                                    </label>
                                ) : (
                                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={openEditModal.is_default_bank}
                                            onChange={(e) => setOpenEditModal({ ...openEditModal, is_default_bank: e.target.checked })}
                                            className="rounded text-blue-600 focus:ring-blue-500"
                                        />
                                        <span>Jadikan akun penampung utama penjualan non-tunai kasir</span>
                                    </label>
                                )}
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    disabled={isPending || accounts.length <= 1}
                                    onClick={() => {
                                        const accToDelete = accounts.find((a) => a.id === openEditModal.id)
                                        if (accToDelete) {
                                            setDeleteConfirmAcc(accToDelete)
                                        }
                                    }}
                                    className="text-xs font-bold text-rose-600 hover:text-rose-700 disabled:opacity-30"
                                >
                                    Hapus Akun
                                </button>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setOpenEditModal(null)}
                                        className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isPending}
                                        className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-900 active:bg-emerald-950 transition disabled:opacity-50 cursor-pointer"
                                    >
                                        {isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Konfirmasi Hapus Akun */}
            {deleteConfirmAcc && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
                        <div className="flex items-center gap-3 text-rose-600 mb-3">
                            <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-lg font-bold">
                                ⚠️
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Hapus Akun Keuangan?</h3>
                                <p className="text-xs text-slate-500 font-medium">{deleteConfirmAcc.name}</p>
                            </div>
                        </div>

                        <div className="text-xs text-slate-600 leading-relaxed mb-4 space-y-2">
                            <p>Apakah Anda yakin ingin menghapus akun ini dari pembukuan?</p>
                            {deleteConfirmAcc.current_balance !== 0 && (
                                <p className="font-semibold text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-100">
                                    Perhatian: Akun ini memiliki saldo berjalan {fmt(deleteConfirmAcc.current_balance)}.
                                </p>
                            )}
                            {deleteConfirmAcc.is_default_cash && (
                                <p className="text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                    Akun ini adalah kas utama kasir. Status kas utama akan dialihkan otomatis ke akun kas lain yang tersedia.
                                </p>
                            )}
                            {deleteConfirmAcc.is_default_bank && (
                                <p className="text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                    Akun ini adalah rekening utama non-tunai kasir. Status akan dialihkan otomatis ke rekening lain yang tersedia.
                                </p>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                            <button
                                type="button"
                                disabled={isPending}
                                onClick={() => setDeleteConfirmAcc(null)}
                                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleDeleteAccount(deleteConfirmAcc.id)}
                                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition disabled:opacity-50"
                            >
                                {isPending ? 'Menghapus...' : 'Ya, Hapus Akun'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
