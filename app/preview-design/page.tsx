'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function DesignPreviewPage() {
    const [activeTab, setActiveTab] = useState<'shell' | 'ledger' | 'mobile' | 'auth'>('shell')
    const [sideSheetOpen, setSideSheetOpen] = useState(true)
    const [mobileSubTab, setMobileSubTab] = useState<'pos' | 'history'>('pos')
    const [mobilePaymentOpen, setMobilePaymentOpen] = useState(false)
    const [ledgerMode, setLedgerMode] = useState<'neraca' | 'labarugi'>('neraca')
    const [authSubTab, setAuthSubTab] = useState<'login' | 'pending'>('login')

    return (
        <div className="min-h-screen bg-slate-100 font-sans text-slate-800 antialiased selection:bg-emerald-100 selection:text-emerald-950">
            {/* ── TOP CONTROLLER / SWITCHER BAR (Sticky Preview Bar) ── */}
            <div className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 py-3 shadow-xs">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#06281b] text-white font-black text-sm shadow-xs">
                            R
                        </div>
                        <div>
                            <span className="font-bold text-slate-900 text-sm">
                                Rekapi Design System Preview
                            </span>
                            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                                Concept: Clean White &amp; Deep Forest
                            </span>
                        </div>
                    </div>

                    {/* Tab Switcher Buttons */}
                    <div className="flex rounded-xl bg-slate-100 p-1">
                        <button
                            type="button"
                            onClick={() => setActiveTab('shell')}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                activeTab === 'shell'
                                    ? 'bg-white text-slate-900 shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            1. Shell &amp; Data Sheet (Riwayat + Drawer)
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('ledger')}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                activeTab === 'ledger'
                                    ? 'bg-white text-slate-900 shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            2. Financial Ledger (Neraca / Laba Rugi)
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('mobile')}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                activeTab === 'mobile'
                                    ? 'bg-white text-slate-900 shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            3. Simulasi Mobile 390px (Kasir &amp; Sheet)
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('auth')}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                activeTab === 'auth'
                                    ? 'bg-white text-slate-900 shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            4. Login Baru &amp; Midtrans Pending
                        </button>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                        <Link
                            href="/dashboard"
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-50 transition"
                        >
                            Kembali ke Dashboard Aktif &rarr;
                        </Link>
                    </div>
                </div>
            </div>

            {/* ── TAB 1: SHELL & DATA SHEET VIEW (RIWAYAT + DRAWER) ── */}
            {activeTab === 'shell' && (
                <div className="flex min-h-[calc(100vh-61px)]">
                    {/* Clean White Sidebar */}
                    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4 flex flex-col justify-between hidden md:flex">
                        <div className="space-y-6">
                            {/* Brand Header */}
                            <div className="flex items-center justify-between px-2">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#06281b] text-white font-black text-xs">
                                        R
                                    </div>
                                    <span className="font-bold text-slate-900 text-base tracking-tight">
                                        Rekapi
                                    </span>
                                </div>
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                    v1.0 RC
                                </span>
                            </div>

                            {/* Branch Selector Pill */}
                            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2 text-xs">
                                <div className="flex items-center justify-between text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">
                                    <span>Cabang Aktif</span>
                                    <span className="text-emerald-700 font-semibold">2 Cabang</span>
                                </div>
                                <div className="flex items-center justify-between font-bold text-slate-900 text-xs">
                                    <span>Outlet Melati #1</span>
                                    <span className="text-slate-400">▾</span>
                                </div>
                            </div>

                            {/* Clean Navigation Menu */}
                            <nav className="space-y-0.5 text-xs">
                                <div className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Operasional
                                </div>
                                <button className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition text-left">
                                    <span>📊</span> Ringkasan
                                </button>
                                <button className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition text-left">
                                    <span>🛒</span> Kasir POS
                                </button>
                                <button className="w-full flex items-center justify-between rounded-lg bg-emerald-950/5 px-2.5 py-2 font-bold text-emerald-900 border-l-2 border-emerald-800 text-left">
                                    <span className="flex items-center gap-2.5">
                                        <span>🧾</span> Riwayat Transaksi
                                    </span>
                                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] text-emerald-800">
                                        48
                                    </span>
                                </button>
                                <button className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition text-left">
                                    <span>📦</span> Katalog &amp; Stok
                                </button>
                                <button className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition text-left">
                                    <span>🥩</span> Bahan Baku
                                </button>

                                <div className="px-2 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Buku Besar
                                </div>
                                <button className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition text-left">
                                    <span>📈</span> Laba Rugi
                                </button>
                                <button className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition text-left">
                                    <span>⚖️</span> Neraca Keuangan
                                </button>
                                <button className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition text-left">
                                    <span>💸</span> Arus Kas
                                </button>
                                <button className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition text-left">
                                    <span>🤝</span> Utang &amp; Piutang
                                </button>
                            </nav>
                        </div>

                        {/* Bottom Profile & Plan Card */}
                        <div className="border-t border-slate-100 pt-3 text-xs space-y-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-bold text-slate-800">Kopi Rumpun</div>
                                    <div className="text-[10px] text-emerald-700 font-semibold">Paket Business • 22 Hari</div>
                                </div>
                                <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100"></span>
                            </div>
                        </div>
                    </aside>

                    {/* Main Content Area */}
                    <main className="flex-1 overflow-x-hidden bg-slate-50 p-6 sm:p-8">
                        <div className="mx-auto max-w-6xl space-y-6">
                            {/* Page Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                    <h1 className="text-xl font-bold tracking-tight text-slate-900">
                                        Riwayat Transaksi Penjualan
                                    </h1>
                                    <p className="text-xs text-slate-500">
                                        Data transaksi real-time dengan status pembayaran dan validasi stok otomatis.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setSideSheetOpen(!sideSheetOpen)}
                                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                                    >
                                        {sideSheetOpen ? 'Tutup Side Sheet Edit' : 'Buka Contoh Side Sheet Edit'}
                                    </button>
                                    <button className="rounded-lg bg-[#06281b] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#0a3827] transition">
                                        + Transaksi Baru
                                    </button>
                                </div>
                            </div>

                            {/* 1. STAT STRIP (Single-row metrics strip, no bulky cards) */}
                            <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs">
                                <div className="grid grid-cols-2 divide-y sm:grid-cols-4 sm:divide-y-0 sm:divide-x divide-slate-100 p-2">
                                    <div className="p-3">
                                        <span className="text-[11px] font-medium text-slate-500 block">Total Omzet Hari Ini</span>
                                        <div className="mt-1 flex items-baseline gap-2">
                                            <span className="text-lg font-extrabold text-slate-900 tabular-nums">Rp 4.250.000</span>
                                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">+12%</span>
                                        </div>
                                    </div>
                                    <div className="p-3">
                                        <span className="text-[11px] font-medium text-slate-500 block">Laba Kotor (Gross Profit)</span>
                                        <div className="mt-1 flex items-baseline gap-2">
                                            <span className="text-lg font-extrabold text-emerald-950 tabular-nums">Rp 2.650.000</span>
                                            <span className="text-[10px] font-medium text-slate-400">Margin 62%</span>
                                        </div>
                                    </div>
                                    <div className="p-3">
                                        <span className="text-[11px] font-medium text-slate-500 block">Total Transaksi</span>
                                        <div className="mt-1 flex items-baseline gap-2">
                                            <span className="text-lg font-extrabold text-slate-900 tabular-nums">48 Struk</span>
                                            <span className="text-[10px] text-slate-400">Rerata Rp 88rb</span>
                                        </div>
                                    </div>
                                    <div className="p-3">
                                        <span className="text-[11px] font-medium text-slate-500 block">Piutang / Kasbon Aktif</span>
                                        <div className="mt-1 flex items-baseline gap-2">
                                            <span className="text-lg font-extrabold text-amber-800 tabular-nums">Rp 850.000</span>
                                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">3 Nota</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 2. SPREADSHEET / DATA SHEET TABLE VIEW */}
                            <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
                                {/* Table Toolbar */}
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/50 px-4 py-2.5 text-xs">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            placeholder="Cari no. struk atau pelanggan..."
                                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none w-64"
                                            defaultValue=""
                                        />
                                        <select className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none">
                                            <option>Semua Metode Bayar</option>
                                            <option>Tunai (Cash)</option>
                                            <option>QRIS</option>
                                            <option>Kredit / Kasbon</option>
                                        </select>
                                    </div>
                                    <div className="text-slate-500 text-[11px]">
                                        Menampilkan <strong>4</strong> transaksi terbaru
                                    </div>
                                </div>

                                {/* Table Elements */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                            <tr>
                                                <th className="px-4 py-2.5">No. Struk</th>
                                                <th className="px-4 py-2.5">Waktu</th>
                                                <th className="px-4 py-2.5">Pelanggan</th>
                                                <th className="px-4 py-2.5">Metode</th>
                                                <th className="px-4 py-2.5 text-right">Total</th>
                                                <th className="px-4 py-2.5 text-right">Terbayar</th>
                                                <th className="px-4 py-2.5">Status</th>
                                                <th className="px-4 py-2.5 text-right">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                            {/* Row 1: Lunas Langsung (Editable) */}
                                            <tr className="hover:bg-slate-50/80 transition">
                                                <td className="px-4 py-3 font-mono font-bold text-slate-900">
                                                    INV-20261029-0048
                                                </td>
                                                <td className="px-4 py-3 text-slate-500">14:22</td>
                                                <td className="px-4 py-3 text-slate-800 font-semibold">Walk-in (Umum)</td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                                                        💵 Tunai
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
                                                    Rp 120.000
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-700">
                                                    Rp 120.000
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold text-[11px]">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
                                                        Lunas
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right space-x-1.5">
                                                    <button
                                                        onClick={() => setSideSheetOpen(true)}
                                                        className="rounded px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 transition cursor-pointer"
                                                    >
                                                        Edit (Drawer)
                                                    </button>
                                                    <button className="rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 transition">
                                                        Cetak
                                                    </button>
                                                </td>
                                            </tr>

                                            {/* Row 2: Kasbon Terkunci (Multi-Cicilan Sesuai 0036) */}
                                            <tr className="bg-amber-50/20 hover:bg-amber-50/40 transition">
                                                <td className="px-4 py-3 font-mono font-bold text-slate-900">
                                                    INV-20261028-0031
                                                </td>
                                                <td className="px-4 py-3 text-slate-500">Kemarin</td>
                                                <td className="px-4 py-3 text-slate-900 font-semibold">
                                                    Budi Coffee Roaster
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100/70 px-2 py-0.5 text-[11px] text-amber-900 font-medium">
                                                        ⏳ Kredit (2x Bayar)
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
                                                    Rp 650.000
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium tabular-nums text-emerald-800">
                                                    Rp 300.000 (Sisa 350rb)
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center gap-1.5 text-amber-800 font-bold text-[11px]">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                                        Sebagian
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right space-x-1.5">
                                                    {/* LOCKED BADGE (Kebijakan Hibrida 0036) */}
                                                    <span
                                                        className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 border border-slate-200 cursor-not-allowed"
                                                        title="Transaksi ini telah memiliki cicilan lanjutan dan tidak dapat diedit langsung. Silakan gunakan fitur Batalkan (Void) bila ingin merevisi."
                                                    >
                                                        🔒 Terkunci (Cicilan)
                                                    </span>
                                                    <button className="rounded px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 transition">
                                                        Void
                                                    </button>
                                                </td>
                                            </tr>

                                            {/* Row 3: QRIS / Bank Transfer */}
                                            <tr className="hover:bg-slate-50/80 transition">
                                                <td className="px-4 py-3 font-mono font-bold text-slate-900">
                                                    INV-20261029-0047
                                                </td>
                                                <td className="px-4 py-3 text-slate-500">13:10</td>
                                                <td className="px-4 py-3 text-slate-800 font-semibold">Ibu Ratna</td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center gap-1.5 rounded-md bg-teal-50 px-2 py-0.5 text-[11px] text-teal-800 font-medium">
                                                        📱 QRIS (BCA)
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
                                                    Rp 45.000
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-700">
                                                    Rp 45.000
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold text-[11px]">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
                                                        Lunas
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right space-x-1.5">
                                                    <button
                                                        onClick={() => setSideSheetOpen(true)}
                                                        className="rounded px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 transition cursor-pointer"
                                                    >
                                                        Edit (Drawer)
                                                    </button>
                                                    <button className="rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 transition">
                                                        Cetak
                                                    </button>
                                                </td>
                                            </tr>

                                            {/* Row 4: Voided */}
                                            <tr className="bg-slate-50/40 text-slate-400">
                                                <td className="px-4 py-3 font-mono line-through">
                                                    INV-20261029-0046
                                                </td>
                                                <td className="px-4 py-3">12:05</td>
                                                <td className="px-4 py-3">Walk-in</td>
                                                <td className="px-4 py-3">💵 Tunai</td>
                                                <td className="px-4 py-3 text-right tabular-nums line-through">
                                                    Rp 85.000
                                                </td>
                                                <td className="px-4 py-3 text-right tabular-nums">Rp 0</td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center gap-1.5 text-rose-600 font-bold text-[11px]">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                                                        Dibatalkan
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className="text-[10px] text-slate-400 italic">
                                                        Alasan: Salah input meja
                                                    </span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </main>

                    {/* 3. SIDE SHEET (Drawer Kanan untuk Edit Struk - Non-blocking Workspace) */}
                    {sideSheetOpen && (
                        <aside className="w-96 shrink-0 border-l border-slate-200 bg-white p-5 flex flex-col justify-between shadow-xl animate-in slide-in-from-right duration-200">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                    <div>
                                        <div className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">
                                            Side Sheet Editor
                                        </div>
                                        <h3 className="font-bold text-slate-900 text-sm">
                                            Edit Struk INV-20261029-0048
                                        </h3>
                                    </div>
                                    <button
                                        onClick={() => setSideSheetOpen(false)}
                                        className="h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center font-bold text-sm"
                                    >
                                        ✕
                                    </button>
                                </div>

                                <div className="rounded-lg bg-emerald-50/70 border border-emerald-200 p-2.5 text-xs text-emerald-950">
                                    <div className="font-bold">✓ Kebijakan Hibrida Aktif</div>
                                    <p className="text-[11px] text-emerald-900 mt-0.5">
                                        Transaksi lunas langsung. Perubahan nilai akan menyesuaikan kas &amp; jurnal secara otomatis di server.
                                    </p>
                                </div>

                                {/* Items Editor */}
                                <div className="space-y-2.5">
                                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                                        Rincian Produk
                                    </span>

                                    {/* Item 1 */}
                                    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-bold text-slate-900 text-xs">Americano Dingin</span>
                                            <span className="text-xs font-bold tabular-nums text-slate-900">Rp 50.000</span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                                            <span>@Rp 25.000 • Sisa stok cabang: <strong>18</strong></span>
                                            <div className="flex items-center gap-1.5">
                                                <button className="h-6 w-6 rounded border border-slate-300 font-bold">-</button>
                                                <span className="w-5 text-center font-bold text-slate-900">2</span>
                                                <button className="h-6 w-6 rounded border border-slate-300 font-bold">+</button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Item 2 */}
                                    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-bold text-slate-900 text-xs">Croissant Butter</span>
                                            <span className="text-xs font-bold tabular-nums text-slate-900">Rp 70.000</span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                                            <span>@Rp 35.000 • Sisa stok cabang: <strong>14</strong></span>
                                            <div className="flex items-center gap-1.5">
                                                <button className="h-6 w-6 rounded border border-slate-300 font-bold">-</button>
                                                <span className="w-5 text-center font-bold text-slate-900">2</span>
                                                <button className="h-6 w-6 rounded border border-slate-300 font-bold">+</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Reason textarea */}
                                <div>
                                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                                        Alasan Perubahan (Audit Trail)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Contoh: Koreksi jumlah pesanan pelanggan"
                                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-700"
                                    />
                                </div>
                            </div>

                            {/* Drawer Footer Actions */}
                            <div className="border-t border-slate-100 pt-4 space-y-2">
                                <div className="flex items-baseline justify-between text-xs">
                                    <span className="text-slate-500 font-medium">Total Akhir Struk</span>
                                    <span className="text-base font-extrabold text-emerald-950 tabular-nums">Rp 120.000</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 pt-1">
                                    <button
                                        onClick={() => setSideSheetOpen(false)}
                                        className="rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        onClick={() => {
                                            alert('Simulasi simpan berhasil! Saldo kas & sale_payments disinkronkan secara atomik.')
                                            setSideSheetOpen(false)
                                        }}
                                        className="rounded-lg bg-[#06281b] py-2 text-xs font-bold text-white hover:bg-[#0a3827] shadow-xs"
                                    >
                                        Simpan Perubahan
                                    </button>
                                </div>
                            </div>
                        </aside>
                    )}
                </div>
            )}

            {/* ── TAB 2: FINANCIAL LEDGER SHEET (NERACA & LABA RUGI) ── */}
            {activeTab === 'ledger' && (
                <div className="p-6 sm:p-10 max-w-4xl mx-auto space-y-6">
                    {/* View Switcher: Neraca vs Laba Rugi */}
                    <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                                Standar SAK EMKM Akuntansi
                            </span>
                            <h2 className="text-xl font-bold text-slate-900">
                                Lembar Laporan Keuangan Resmi
                            </h2>
                        </div>
                        <div className="flex rounded-xl bg-slate-200/80 p-1 text-xs font-bold">
                            <button
                                onClick={() => setLedgerMode('neraca')}
                                className={`rounded-lg px-3.5 py-1.5 transition ${
                                    ledgerMode === 'neraca'
                                        ? 'bg-white text-slate-900 shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                Neraca Keuangan
                            </button>
                            <button
                                onClick={() => setLedgerMode('labarugi')}
                                className={`rounded-lg px-3.5 py-1.5 transition ${
                                    ledgerMode === 'labarugi'
                                        ? 'bg-white text-slate-900 shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                Laba Rugi
                            </button>
                        </div>
                    </div>

                    {/* THE LEDGER SHEET PAPER (White accounting sheet) */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 sm:p-12 shadow-sm space-y-8 font-sans">
                        {/* Kop Laporan Bersih */}
                        <div className="text-center border-b border-slate-200 pb-6 space-y-1">
                            <h3 className="font-extrabold text-base uppercase tracking-wider text-slate-900">
                                PT KOPI RUMPUN NUSANTARA
                            </h3>
                            <div className="text-xs text-slate-500 font-medium">
                                NPWP: 01.234.567.8-901.000 • Outlet Melati #1, Bandung
                            </div>
                            <h4 className="text-lg font-bold text-emerald-950 pt-2 tracking-tight">
                                {ledgerMode === 'neraca'
                                    ? 'LAPORAN POSISI KEUANGAN (NERACA)'
                                    : 'LAPORAN LABA RUGI OPERASIONAL'}
                            </h4>
                            <p className="text-[11px] text-slate-400">
                                Per 29 Oktober 2026 (Mata Uang: Rupiah Indonesia)
                            </p>
                        </div>

                        {/* Thin Toolbar: Filter Cabang + Periode */}
                        <div className="flex flex-wrap items-center justify-between text-xs border-y border-slate-100 py-2.5 text-slate-600">
                            <div className="flex items-center gap-4">
                                <span>Cabang: <strong>Outlet Melati #1</strong></span>
                                <span>Basis: <strong>Akrual (SAK EMKM)</strong></span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                                    ✓ Terverifikasi Seimbang
                                </span>
                            </div>
                        </div>

                        {/* NERACA VIEW */}
                        {ledgerMode === 'neraca' && (
                            <div className="space-y-6 text-xs">
                                {/* 1. ASET */}
                                <div className="space-y-2">
                                    <div className="border-b border-slate-900 pb-1 font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                                        1. ASET (AKTIVA)
                                    </div>
                                    <div className="pl-4 space-y-1.5 font-medium">
                                        <div className="flex justify-between text-slate-700">
                                            <span>Kas &amp; Setara Kas (Rekening Kasir &amp; Bank Mandiri)</span>
                                            <span className="tabular-nums font-semibold text-slate-900">Rp 18.450.000</span>
                                        </div>
                                        <div className="flex justify-between text-slate-700">
                                            <span>Piutang Usaha (Tagihan Kasbon Pelanggan)</span>
                                            <span className="tabular-nums font-semibold text-slate-900">Rp 850.000</span>
                                        </div>
                                        <div className="flex justify-between text-slate-700">
                                            <span>Persediaan Produk Jadi (Merchandise Stock)</span>
                                            <span className="tabular-nums font-semibold text-slate-900">Rp 6.200.000</span>
                                        </div>
                                        <div className="flex justify-between text-slate-700">
                                            <span>Persediaan Bahan Baku (Biji Kopi &amp; Susu)</span>
                                            <span className="tabular-nums font-semibold text-slate-900">Rp 4.120.000</span>
                                        </div>
                                    </div>

                                    {/* Subtotal Aset Lancar */}
                                    <div className="flex justify-between border-t border-dashed border-slate-200 pt-1 pl-4 font-bold text-slate-900">
                                        <span>Total Aset Lancar</span>
                                        <span className="tabular-nums">Rp 29.620.000</span>
                                    </div>

                                    {/* Aset Tetap */}
                                    <div className="pl-4 pt-2 space-y-1.5">
                                        <div className="flex justify-between text-slate-700">
                                            <span>Aset Tetap Peralatan &amp; Mesin Espresso</span>
                                            <span className="tabular-nums font-semibold text-slate-900">Rp 15.000.000</span>
                                        </div>
                                    </div>

                                    {/* TOTAL ASET DENGAN DOUBLE UNDERLINE HIJAU */}
                                    <div className="flex justify-between border-t border-slate-900 border-b-4 border-double border-emerald-900 py-2 font-black text-sm text-emerald-950">
                                        <span>TOTAL ASET (AKTIVA)</span>
                                        <span className="tabular-nums text-base">Rp 44.620.000</span>
                                    </div>
                                </div>

                                {/* 2. LIABILITAS & EKUITAS */}
                                <div className="space-y-2 pt-4">
                                    <div className="border-b border-slate-900 pb-1 font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                                        2. KEWAJIBAN &amp; EKUITAS
                                    </div>
                                    <div className="pl-4 space-y-1.5 font-medium">
                                        <div className="flex justify-between text-slate-700">
                                            <span>Utang Usaha / Tempo Supplier Bahan Baku</span>
                                            <span className="tabular-nums font-semibold text-slate-900">Rp 3.500.000</span>
                                        </div>
                                        <div className="flex justify-between text-slate-700">
                                            <span>Modal Disetor Pemilik Usaha</span>
                                            <span className="tabular-nums font-semibold text-slate-900">Rp 35.000.000</span>
                                        </div>
                                        <div className="flex justify-between text-slate-700">
                                            <span>Saldo Laba Ditahan (Retained Earnings)</span>
                                            <span className="tabular-nums font-semibold text-slate-900">Rp 6.120.000</span>
                                        </div>
                                    </div>

                                    {/* TOTAL LIABILITAS & EKUITAS DENGAN DOUBLE UNDERLINE HIJAU */}
                                    <div className="flex justify-between border-t border-slate-900 border-b-4 border-double border-emerald-900 py-2 font-black text-sm text-emerald-950">
                                        <span>TOTAL LIABILITAS &amp; EKUITAS</span>
                                        <span className="tabular-nums text-base">Rp 44.620.000</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* LABA RUGI VIEW */}
                        {ledgerMode === 'labarugi' && (
                            <div className="space-y-4 text-xs">
                                <div className="space-y-1.5">
                                    <div className="flex justify-between font-bold text-slate-900">
                                        <span>Pendapatan Penjualan Bersih (Omzet)</span>
                                        <span className="tabular-nums text-sm font-extrabold text-slate-900">Rp 42.500.000</span>
                                    </div>
                                    <div className="flex justify-between text-slate-600 pl-4">
                                        <span>Harga Pokok Penjualan (HPP Produk Terjual)</span>
                                        <span className="tabular-nums font-semibold text-rose-800">(Rp 16.150.000)</span>
                                    </div>
                                    <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-emerald-900">
                                        <span>LABA KOTOR (GROSS PROFIT)</span>
                                        <span className="tabular-nums text-sm">Rp 26.350.000</span>
                                    </div>
                                </div>

                                <div className="space-y-1.5 pt-3">
                                    <div className="font-bold text-slate-900">Beban Operasional Usaha:</div>
                                    <div className="pl-4 space-y-1 text-slate-600">
                                        <div className="flex justify-between">
                                            <span>Gaji &amp; Upah Pegawai Toko</span>
                                            <span className="tabular-nums">Rp 12.000.000</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Sewa Tempat &amp; Listrik Outlet</span>
                                            <span className="tabular-nums">Rp 6.500.000</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Kemasan &amp; Perlengkapan Konsumabel</span>
                                            <span className="tabular-nums">Rp 1.730.000</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-800">
                                        <span>Total Beban Operasional</span>
                                        <span className="tabular-nums text-rose-800">(Rp 20.230.000)</span>
                                    </div>
                                </div>

                                <div className="flex justify-between border-t border-slate-900 border-b-4 border-double border-emerald-900 py-2.5 font-black text-sm text-emerald-950">
                                    <span>LABA BERSIH OPERASIONAL (NET PROFIT)</span>
                                    <span className="tabular-nums text-base">Rp 6.120.000</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── TAB 3: SIMULASI LAYAR HP 390px (KASIR & COMPACT SHEET) ── */}
            {activeTab === 'mobile' && (
                <div className="p-6 sm:p-10 flex flex-col items-center">
                    <div className="mb-4 flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-semibold">Tampilan Layar HP:</span>
                        <div className="flex rounded-lg bg-white border border-slate-200 p-0.5 text-xs font-bold shadow-2xs">
                            <button
                                onClick={() => setMobileSubTab('pos')}
                                className={`rounded px-3 py-1 transition ${
                                    mobileSubTab === 'pos'
                                        ? 'bg-[#06281b] text-white'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                3A. Kasir POS (Single Bottom Bar)
                            </button>
                            <button
                                onClick={() => setMobileSubTab('history')}
                                className={`rounded px-3 py-1 transition ${
                                    mobileSubTab === 'history'
                                        ? 'bg-[#06281b] text-white'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                3B. Mobile Compact Sheet (2 Kolom)
                            </button>
                        </div>
                    </div>

                    {/* THE 390px PHONE FRAME */}
                    <div className="relative w-[390px] h-[780px] bg-slate-950 rounded-[44px] p-3.5 shadow-2xl ring-1 ring-slate-800">
                        {/* Speaker Notch */}
                        <div className="absolute top-5 left-1/2 -translate-x-1/2 w-28 h-4 bg-slate-900 rounded-full z-50 flex items-center justify-center">
                            <div className="w-10 h-1 bg-slate-700 rounded-full"></div>
                        </div>

                        {/* Phone Screen Inner */}
                        <div className="w-full h-full bg-slate-50 rounded-[34px] overflow-hidden flex flex-col justify-between relative text-slate-900 text-xs">
                            {/* Screen Top Status Bar */}
                            <div className="h-10 bg-white/95 px-5 pt-2 flex items-center justify-between text-[11px] font-bold text-slate-800 border-b border-slate-100 z-30">
                                <span>09:41</span>
                                <div className="flex items-center gap-1.5 text-[10px]">
                                    <span>5G</span>
                                    <span>100%</span>
                                </div>
                            </div>

                            {/* MOBILE SCREEN CONTENT */}
                            {mobileSubTab === 'pos' && (
                                <div className="flex-1 flex flex-col justify-between overflow-hidden relative">
                                    {/* POS Header */}
                                    <div className="bg-white px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                                        <div>
                                            <div className="font-bold text-slate-900 text-xs">Kasir Outlet #1</div>
                                            <div className="text-[10px] text-emerald-700 font-medium">Stok cabang sinkron</div>
                                        </div>
                                        <button className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded text-slate-700">
                                            🔍 Cari
                                        </button>
                                    </div>

                                    {/* Product Grid 2 Kolom */}
                                    <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-24">
                                        <div className="grid grid-cols-2 gap-2">
                                            {/* Item 1 */}
                                            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs space-y-1.5 relative">
                                                <span className="absolute top-2 right-2 text-[9px] font-bold bg-emerald-50 text-emerald-800 px-1.5 py-0.2 rounded border border-emerald-200">
                                                    18 pcs
                                                </span>
                                                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-900">
                                                    ☕
                                                </div>
                                                <div className="font-bold text-slate-900 text-[11px] leading-tight pt-1">
                                                    Americano Cold
                                                </div>
                                                <div className="text-emerald-950 font-extrabold tabular-nums text-xs">
                                                    Rp 25.000
                                                </div>
                                                <button className="w-full rounded-lg bg-[#06281b] py-1 font-bold text-white text-[11px] hover:bg-[#0a3827]">
                                                    + Tambah
                                                </button>
                                            </div>

                                            {/* Item 2 */}
                                            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs space-y-1.5 relative">
                                                <span className="absolute top-2 right-2 text-[9px] font-bold bg-emerald-50 text-emerald-800 px-1.5 py-0.2 rounded border border-emerald-200">
                                                    12 pcs
                                                </span>
                                                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-sm font-bold text-amber-900">
                                                    🥐
                                                </div>
                                                <div className="font-bold text-slate-900 text-[11px] leading-tight pt-1">
                                                    Croissant Butter
                                                </div>
                                                <div className="text-emerald-950 font-extrabold tabular-nums text-xs">
                                                    Rp 35.000
                                                </div>
                                                <button className="w-full rounded-lg bg-[#06281b] py-1 font-bold text-white text-[11px] hover:bg-[#0a3827]">
                                                    + Tambah
                                                </button>
                                            </div>

                                            {/* Item 3 */}
                                            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs space-y-1.5 relative">
                                                <span className="absolute top-2 right-2 text-[9px] font-bold bg-rose-50 text-rose-800 px-1.5 py-0.2 rounded border border-rose-200">
                                                    Habis
                                                </span>
                                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600">
                                                    🍵
                                                </div>
                                                <div className="font-bold text-slate-400 text-[11px] leading-tight pt-1">
                                                    Matcha Latte
                                                </div>
                                                <div className="text-slate-400 font-bold tabular-nums text-xs">
                                                    Rp 28.000
                                                </div>
                                                <button disabled className="w-full rounded-lg bg-slate-200 py-1 font-bold text-slate-400 text-[11px] cursor-not-allowed">
                                                    Stok Kosong
                                                </button>
                                            </div>

                                            {/* Item 4 */}
                                            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs space-y-1.5 relative">
                                                <span className="absolute top-2 right-2 text-[9px] font-bold bg-emerald-50 text-emerald-800 px-1.5 py-0.2 rounded border border-emerald-200">
                                                    24 pcs
                                                </span>
                                                <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-sm font-bold text-sky-900">
                                                    🥪
                                                </div>
                                                <div className="font-bold text-slate-900 text-[11px] leading-tight pt-1">
                                                    Toast Srikaya
                                                </div>
                                                <div className="text-emerald-950 font-extrabold tabular-nums text-xs">
                                                    Rp 22.000
                                                </div>
                                                <button className="w-full rounded-lg bg-[#06281b] py-1 font-bold text-white text-[11px] hover:bg-[#0a3827]">
                                                    + Tambah
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── SINGLE CLEAN BOTTOM BAR (NO DOUBLE BAR CONFLICT) ── */}
                                    <div className="absolute inset-x-0 bottom-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 shadow-xl">
                                        <button
                                            onClick={() => setMobilePaymentOpen(true)}
                                            className="w-full flex items-center justify-between rounded-xl bg-[#06281b] p-3 text-white shadow-md active:scale-[0.98] transition"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-black">
                                                    2
                                                </span>
                                                <span className="font-bold text-xs">Lihat Tagihan</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-extrabold text-sm tabular-nums">Rp 60.000</span>
                                                <span>&rarr;</span>
                                            </div>
                                        </button>
                                    </div>

                                    {/* Mobile Payment Drawer Popup */}
                                    {mobilePaymentOpen && (
                                        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end">
                                            <div className="w-full bg-white rounded-t-3xl p-4 space-y-3 animate-in slide-in-from-bottom duration-200">
                                                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                                    <span className="font-bold text-slate-900">Pembayaran Kasir</span>
                                                    <button onClick={() => setMobilePaymentOpen(false)} className="font-bold text-slate-400">✕</button>
                                                </div>
                                                <div className="flex rounded-lg bg-slate-100 p-1 text-[11px] font-bold">
                                                    <button className="flex-1 py-1 bg-white rounded shadow-2xs text-slate-900">💵 Tunai</button>
                                                    <button className="flex-1 py-1 text-slate-600">📱 QRIS</button>
                                                    <button className="flex-1 py-1 text-slate-600">⏳ Kasbon</button>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-500 font-medium">Akun Penerima (0036 Sync)</span>
                                                    <select className="w-full rounded-lg border border-slate-200 p-1.5 text-xs font-semibold mt-0.5">
                                                        <option>Kas Laci Toko (Default Cash)</option>
                                                        <option>BCA Giro Operasional</option>
                                                    </select>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        alert('Transaksi kasir berhasil dibuat!')
                                                        setMobilePaymentOpen(false)
                                                    }}
                                                    className="w-full py-2.5 rounded-xl bg-emerald-700 font-bold text-white text-xs shadow-xs"
                                                >
                                                    Konfirmasi Pembayaran (Rp 60.000)
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 3B. COMPACT SHEET (2-KOLOM DATA UNTUK MOBILE RIWAYAT) */}
                            {mobileSubTab === 'history' && (
                                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                        <span className="font-bold text-slate-900 text-xs">Riwayat Struk (Mobile Card)</span>
                                        <span className="text-[10px] text-slate-400">Tanpa geser horizontal</span>
                                    </div>

                                    {/* Card 1 */}
                                    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5 shadow-2xs">
                                        <div className="flex items-center justify-between">
                                            <span className="font-mono font-bold text-slate-900 text-xs">INV-1029-0048</span>
                                            <span className="inline-flex items-center gap-1 text-emerald-800 font-bold text-[10px] bg-emerald-50 px-1.5 py-0.2 rounded">
                                                ● Lunas
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-slate-500 text-[11px]">
                                            <span>Walk-in • 14:22</span>
                                            <span>Tunai (Kas Toko)</span>
                                        </div>
                                        <div className="flex items-center justify-between border-t border-slate-100 pt-1.5">
                                            <span className="text-[11px] text-slate-400">Total Tagihan</span>
                                            <span className="font-extrabold text-slate-900 text-xs tabular-nums">Rp 120.000</span>
                                        </div>
                                    </div>

                                    {/* Card 2: Terkunci */}
                                    <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-3 space-y-1.5 shadow-2xs">
                                        <div className="flex items-center justify-between">
                                            <span className="font-mono font-bold text-slate-900 text-xs">INV-1028-0031</span>
                                            <span className="inline-flex items-center gap-1 text-amber-800 font-bold text-[10px] bg-amber-100 px-1.5 py-0.2 rounded">
                                                🔒 Terkunci (Cicilan)
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-slate-600 text-[11px]">
                                            <span>Budi Roaster • 2x Bayar</span>
                                            <span className="text-amber-800 font-semibold">Sisa Rp 350rb</span>
                                        </div>
                                        <div className="flex items-center justify-between border-t border-amber-100 pt-1.5">
                                            <span className="text-[11px] text-slate-500">Total Transaksi</span>
                                            <span className="font-extrabold text-slate-900 text-xs tabular-nums">Rp 650.000</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 4: LOGIN BARU & MIDTRANS PENDING BANNER ── */}
            {activeTab === 'auth' && (
                <div className="p-6 sm:p-10 max-w-4xl mx-auto space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                                Visual Redesign Sesi Auth &amp; Billing
                            </span>
                            <h2 className="text-xl font-bold text-slate-900">
                                Tema Forest Green untuk Login &amp; Transaksi Pending
                            </h2>
                        </div>
                        <div className="flex rounded-xl bg-slate-200/80 p-1 text-xs font-bold">
                            <button
                                onClick={() => setAuthSubTab('login')}
                                className={`rounded-lg px-3.5 py-1.5 transition ${
                                    authSubTab === 'login'
                                        ? 'bg-white text-slate-900 shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                4A. Login Baru (Forest Green)
                            </button>
                            <button
                                onClick={() => setAuthSubTab('pending')}
                                className={`rounded-lg px-3.5 py-1.5 transition ${
                                    authSubTab === 'pending'
                                        ? 'bg-white text-slate-900 shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                4B. Banner Midtrans Pending
                            </button>
                        </div>
                    </div>

                    {/* 4A: CLEAN LOGIN VIEW */}
                    {authSubTab === 'login' && (
                        <div className="flex justify-center py-6">
                            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm space-y-5">
                                <div className="text-center space-y-1">
                                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#06281b] text-white font-black text-lg shadow-sm">
                                        R
                                    </div>
                                    <h3 className="font-extrabold text-slate-900 text-lg tracking-tight pt-2">
                                        Masuk ke Rekapi
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        Sistem POS &amp; Pembukuan SAK EMKM UMKM
                                    </p>
                                </div>

                                {/* Form */}
                                <div className="space-y-3.5">
                                    <div>
                                        <label className="text-xs font-bold text-slate-700 block mb-1">Email</label>
                                        <input
                                            type="email"
                                            defaultValue="owner@kopirumpun.id"
                                            className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-xs font-bold text-slate-700">Kata Sandi</label>
                                            <span className="text-[11px] text-emerald-800 font-semibold hover:underline cursor-pointer">
                                                Lupa?
                                            </span>
                                        </div>
                                        <input
                                            type="password"
                                            defaultValue="••••••••"
                                            className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
                                        />
                                    </div>

                                    {/* Action Button: Deep Forest Green (Replacing Blue) */}
                                    <button
                                        type="button"
                                        onClick={() => alert('Simulasi login dengan tema Deep Forest Green!')}
                                        className="w-full rounded-xl bg-[#06281b] py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#0a3827] active:scale-[0.99] transition cursor-pointer"
                                    >
                                        Masuk ke Akun Toko &rarr;
                                    </button>
                                </div>

                                <div className="text-center text-[11px] text-slate-500">
                                    Belum punya toko di Rekapi?{' '}
                                    <span className="font-bold text-emerald-900 hover:underline cursor-pointer">
                                        Daftar Gratis 7 Hari
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 4B: MIDTRANS PENDING BANNER VIEW */}
                    {authSubTab === 'pending' && (
                        <div className="space-y-4">
                            {/* PENDING BANNER WITH ACTION BUTTONS */}
                            <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-5 shadow-xs space-y-3">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-200 text-amber-900 font-bold text-base">
                                            ⏳
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-900 text-sm">
                                                Menunggu Pembayaran Langganan
                                            </h4>
                                            <p className="text-xs text-slate-600">
                                                Order ID: <code className="font-mono font-bold text-slate-800">REKAPI-B92A-17301980</code> • Paket <strong>Business (Rp 299.000 / 28 Hari)</strong>
                                            </p>
                                        </div>
                                    </div>
                                    <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-amber-900">
                                        Pending
                                    </span>
                                </div>

                                <div className="rounded-xl bg-white border border-amber-200/60 p-3 text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                    <div>
                                        <span className="text-slate-500">Metode Bayar Dipilih:</span>{' '}
                                        <strong className="text-slate-900">BCA Virtual Account (82710098234)</strong>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => alert('Membuka kembali instruksi / Snap modal pembayaran Midtrans...')}
                                            className="rounded-lg bg-[#06281b] px-3 py-1.5 font-bold text-white text-xs hover:bg-[#0a3827] shadow-2xs"
                                        >
                                            Lanjutkan Pembayaran
                                        </button>
                                        <button
                                            onClick={() => alert('Pesanan pending berhasil dibatalkan.')}
                                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-rose-700 text-xs hover:bg-rose-50"
                                        >
                                            Batalkan Pesanan
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Normal Subscription Cards below banner */}
                            <div className="opacity-60 pointer-events-none rounded-xl border border-slate-200 p-4 text-center text-xs text-slate-400">
                                [ Kartu Paket Langganan Standard, Business, Pro akan muncul normal di bawah banner pending ]
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

