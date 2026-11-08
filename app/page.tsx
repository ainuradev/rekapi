import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
    title: 'Rekapi — Kelola Bisnis UMKM Lebih Mudah',
    description:
        'Satu platform untuk kasir, pembelian, stok, dan laporan keuangan. Rekapi membantu kamu mengelola bisnis dengan lebih rapi, hemat waktu, dan siap berkembang.',
}

export default async function HomePage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    return (
        <div className="relative min-h-screen bg-white font-sans text-slate-800 antialiased selection:bg-emerald-100 selection:text-emerald-900">
            {/* ════════════════════════════════════════════════════════
                1. NAVBAR
            ════════════════════════════════════════════════════════ */}
            <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-100 transition-all">
                <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 sm:px-10 lg:px-12">
                    {/* Brand Logo */}
                    <Link href="/" className="flex items-center gap-2.5 group">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden shadow-sm shadow-emerald-950/20 transition-transform group-hover:scale-105">
                            <Image
                                src="/logo.png?v=2"
                                alt="Logo Rekapi"
                                width={40}
                                height={40}
                                className="w-full h-full object-contain"
                                priority
                                unoptimized
                            />
                        </div>
                        <span className="text-xl font-bold tracking-tight text-slate-900">
                            Rekapi
                        </span>
                    </Link>

                    {/* Navigation Links */}
                    <nav className="hidden items-center gap-9 text-sm font-medium text-slate-600 md:flex">
                        <a href="#beranda" className="text-slate-900 font-semibold hover:text-[#0f7654] transition">
                            Beranda
                        </a>
                        <a href="#fitur" className="hover:text-[#0f7654] transition">
                            Fitur
                        </a>
                        <a href="#harga" className="hover:text-[#0f7654] transition">
                            Harga
                        </a>
                        <a href="#tentang" className="hover:text-[#0f7654] transition">
                            Tentang
                        </a>
                    </nav>

                    {/* Auth Actions */}
                    <div className="flex items-center gap-4">
                        {user ? (
                            <Link
                                href="/dashboard"
                                className="inline-flex items-center justify-center rounded-full bg-[#0f7654] px-6 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#0f7654]/25 hover:bg-[#0d6447] transition active:scale-[0.98]"
                            >
                                Dashboard →
                            </Link>
                        ) : (
                            <>
                                <Link
                                    href="/login"
                                    className="text-sm font-medium text-slate-700 hover:text-[#0f7654] transition px-3 py-2"
                                >
                                    Masuk
                                </Link>
                                <Link
                                    href="/register"
                                    className="inline-flex items-center justify-center rounded-full bg-[#0f7654] px-6 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#0f7654]/25 hover:bg-[#0d6447] transition active:scale-[0.98]"
                                >
                                    Mulai Sekarang
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <main>
                {/* ════════════════════════════════════════════════════════
                    2. HERO SECTION
                ════════════════════════════════════════════════════════ */}
                <section id="beranda" className="relative overflow-hidden pt-12 pb-20 lg:pt-16 lg:pb-28">
                    {/* Subtle mint ambient glow in background */}
                    <div
                        aria-hidden
                        className="pointer-events-none absolute top-0 right-0 -z-10 h-[550px] w-[650px] rounded-full bg-emerald-100/40 blur-[130px]"
                    />
                    <div
                        aria-hidden
                        className="pointer-events-none absolute top-40 left-0 -z-10 h-[450px] w-[450px] rounded-full bg-teal-50/50 blur-[100px]"
                    />

                    <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-12">
                        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
                            {/* Left Text Column (5 cols) */}
                            <div className="lg:col-span-5 text-left">
                                {/* Badge */}
                                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f7f0] border border-[#cbeedc] px-3.5 py-1 text-xs font-semibold text-[#0f7654]">
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                    <span>Web Kasir & Keuangan UMKM</span>
                                </div>

                                {/* Headline */}
                                <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-[46px] lg:leading-[1.18]">
                                    Kelola Bisnis UMKM
                                    <br />
                                    Lebih Mudah dengan
                                    <br />
                                    <span className="text-[#0f7654]">Rekapi</span>
                                </h1>

                                {/* Subheadline */}
                                <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg lg:text-[15px] lg:leading-normal">
                                    Satu platform untuk kasir, pembelian, stok, dan laporan keuangan. Rekapi membantu kamu mengelola bisnis dengan lebih rapi, hemat waktu, dan siap berkembang.
                                </p>

                                {/* Buttons */}
                                <div className="mt-8 flex flex-wrap items-center gap-4">
                                    <Link
                                        href="/register"
                                        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0f7654] px-7 py-3.5 text-sm font-semibold text-white shadow-md shadow-[#0f7654]/25 hover:bg-[#0d6447] transition hover:translate-y-[-1px] active:translate-y-0"
                                    >
                                        Mulai Sekarang <span>→</span>
                                    </Link>
                                    <a
                                        href="#fitur"
                                        className="inline-flex items-center justify-center gap-2.5 rounded-full px-5 py-3.5 text-sm font-semibold text-slate-800 hover:text-[#0f7654] transition group"
                                    >
                                        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white shadow-xs group-hover:border-[#0f7654] group-hover:text-[#0f7654] transition">
                                            <svg className="w-3.5 h-3.5 fill-current ml-0.5" viewBox="0 0 24 24">
                                                <path d="M8 5v14l11-7z" />
                                            </svg>
                                        </span>
                                        <span>Lihat Fitur</span>
                                    </a>
                                </div>

                                {/* Trust points */}
                                <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-600">
                                    <div className="flex items-center gap-1.5">
                                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#e8f7f0] text-[#0f7654] text-[10px] font-bold">✓</span>
                                        <span>Tanpa ribet</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#e8f7f0] text-[#0f7654] text-[10px] font-bold">✓</span>
                                        <span>Akses di semua perangkat</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#e8f7f0] text-[#0f7654] text-[10px] font-bold">✓</span>
                                        <span>Data aman di cloud</span>
                                    </div>
                                </div>
                            </div>

                            {/* Right Mockup Column (7 cols) - Laptop + Phone */}
                            <div className="relative lg:col-span-7 flex justify-center lg:justify-end">
                                {/* Decorative green sparks on top right */}
                                <div className="absolute -top-4 right-8 lg:right-2 text-[#0f7654] select-none pointer-events-none z-20">
                                    <svg className="w-10 h-10 opacity-70" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                        <line x1="8" y1="20" x2="2" y2="18" />
                                        <line x1="16" y1="12" x2="12" y2="4" />
                                        <line x1="26" y1="16" x2="34" y2="10" />
                                    </svg>
                                </div>

                                <div className="relative w-full max-w-[620px]">
                                    {/* ── LAPTOP FRAME ── */}
                                    <div className="relative mx-auto rounded-t-2xl border-[7px] border-slate-900 bg-slate-900 shadow-2xl shadow-slate-900/15">
                                        {/* Camera hole */}
                                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-slate-700" />

                                        {/* Screen content */}
                                        <div className="overflow-hidden rounded-t-lg bg-[#f8faf9] text-slate-800 text-left select-none">
                                            <div className="flex h-[360px] sm:h-[400px]">
                                                {/* Mini Sidebar */}
                                                <div className="w-[110px] sm:w-[125px] border-r border-slate-200 bg-white p-3 shrink-0 flex flex-col justify-between">
                                                    <div>
                                                        {/* Brand */}
                                                        <div className="flex items-center gap-1.5 px-1 pb-3 border-b border-slate-100">
                                                            <div className="h-5 w-5 rounded bg-[#0f7654] text-white flex items-center justify-center text-[10px] font-bold">R</div>
                                                            <span className="text-xs font-bold text-slate-900">Rekapi</span>
                                                        </div>

                                                        {/* Navigation Menu */}
                                                        <div className="mt-3 space-y-1 text-[10px] font-medium text-slate-600">
                                                            <div className="flex items-center gap-1.5 rounded-md bg-[#e8f7f0] px-2 py-1 text-[#0f7654] font-semibold">
                                                                <svg className="w-3 h-3 text-[#0f7654]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                                                </svg>
                                                                <span>Beranda</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 px-2 py-1 hover:text-slate-900">
                                                                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                                </svg>
                                                                <span>Kasir POS</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 px-2 py-1 hover:text-slate-900">
                                                                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                                </svg>
                                                                <span>Riwayat</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 px-2 py-1 hover:text-slate-900">
                                                                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                                                </svg>
                                                                <span>Katalog &amp; Stok</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 px-2 py-1 hover:text-slate-900">
                                                                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                </svg>
                                                                <span>Keuangan</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 px-2 py-1 hover:text-slate-900">
                                                                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                                </svg>
                                                                <span>Laporan</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 px-2 py-1 hover:text-slate-900">
                                                                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                                </svg>
                                                                <span>Cabang</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 px-2 py-1 hover:text-slate-900">
                                                                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                </svg>
                                                                <span>Pengaturan</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Dashboard Body */}
                                                <div className="flex-1 p-3.5 sm:p-4 overflow-hidden">
                                                    {/* Header */}
                                                    <div>
                                                        <h4 className="text-xs sm:text-sm font-bold text-slate-900">Halo, Pemilik Usaha</h4>
                                                        <p className="text-[10px] text-slate-500">Berikut ringkasan bisnis kamu hari ini</p>
                                                    </div>

                                                    {/* Top KPI Cards (3 cols) */}
                                                    <div className="mt-3 grid grid-cols-3 gap-2">
                                                        <div className="rounded-lg border border-slate-100 bg-white p-2 shadow-2xs">
                                                            <div className="text-[9px] text-slate-500">Omzet Hari Ini</div>
                                                            <div className="mt-0.5 text-xs sm:text-sm font-bold text-slate-900">Rp 4.850.000</div>
                                                            <div className="mt-0.5 text-[8px] font-semibold text-emerald-600">▲ 12% dari kemarin</div>
                                                        </div>
                                                        <div className="rounded-lg border border-slate-100 bg-white p-2 shadow-2xs">
                                                            <div className="text-[9px] text-slate-500">Laba Bersih</div>
                                                            <div className="mt-0.5 text-xs sm:text-sm font-bold text-slate-900">Rp 1.230.000</div>
                                                            <div className="mt-0.5 text-[8px] font-semibold text-emerald-600">▲ 8% dari kemarin</div>
                                                        </div>
                                                        <div className="rounded-lg border border-slate-100 bg-white p-2 shadow-2xs">
                                                            <div className="text-[9px] text-slate-500">Transaksi</div>
                                                            <div className="mt-0.5 text-xs sm:text-sm font-bold text-slate-900">48</div>
                                                            <div className="mt-0.5 text-[8px] font-semibold text-emerald-600">▲ 5% dari kemarin</div>
                                                        </div>
                                                    </div>

                                                    {/* Graph & Latest Transactions */}
                                                    <div className="mt-3 grid grid-cols-12 gap-2">
                                                        {/* Sales Chart (7 cols) */}
                                                        <div className="col-span-7 rounded-lg border border-slate-100 bg-white p-2.5 shadow-2xs">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[10px] font-bold text-slate-800">Grafik Penjualan</span>
                                                                <span className="text-[8px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">7 Hari</span>
                                                            </div>
                                                            {/* SVG Smooth Curve */}
                                                            <div className="mt-2 h-24 w-full">
                                                                <svg className="h-full w-full" viewBox="0 0 160 70" preserveAspectRatio="none">
                                                                    <defs>
                                                                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                                                                            <stop offset="0%" stopColor="#0f7654" stopOpacity="0.25" />
                                                                            <stop offset="100%" stopColor="#0f7654" stopOpacity="0" />
                                                                        </linearGradient>
                                                                    </defs>
                                                                    <path
                                                                        d="M0,50 Q25,60 50,45 T100,30 T130,15 T160,25 L160,70 L0,70 Z"
                                                                        fill="url(#chartGrad)"
                                                                    />
                                                                    <path
                                                                        d="M0,50 Q25,60 50,45 T100,30 T130,15 T160,25"
                                                                        fill="none"
                                                                        stroke="#0f7654"
                                                                        strokeWidth="2.5"
                                                                    />
                                                                    <circle cx="130" cy="15" r="3" fill="#0f7654" />
                                                                </svg>
                                                            </div>
                                                            <div className="flex justify-between text-[8px] text-slate-400 mt-1">
                                                                <span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span>
                                                            </div>
                                                        </div>

                                                        {/* Recent Transactions (5 cols) */}
                                                        <div className="col-span-5 rounded-lg border border-slate-100 bg-white p-2.5 shadow-2xs">
                                                            <span className="text-[10px] font-bold text-slate-800">Transaksi Terbaru</span>
                                                            <div className="mt-2 space-y-1.5">
                                                                <div className="flex items-center justify-between text-[8px] border-b border-slate-50 pb-1">
                                                                    <span className="font-medium text-slate-700">#TRX-00048</span>
                                                                    <span className="font-bold text-[#0f7654]">Rp 130.000</span>
                                                                </div>
                                                                <div className="flex items-center justify-between text-[8px] border-b border-slate-50 pb-1">
                                                                    <span className="font-medium text-slate-700">#TRX-00047</span>
                                                                    <span className="font-bold text-[#0f7654]">Rp 65.000</span>
                                                                </div>
                                                                <div className="flex items-center justify-between text-[8px] border-b border-slate-50 pb-1">
                                                                    <span className="font-medium text-slate-700">#TRX-00046</span>
                                                                    <span className="font-bold text-[#0f7654]">Rp 240.000</span>
                                                                </div>
                                                                <div className="flex items-center justify-between text-[8px]">
                                                                    <span className="font-medium text-slate-700">#TRX-00045</span>
                                                                    <span className="font-bold text-[#0f7654]">Rp 82.000</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Laptop Bottom Base Stand */}
                                    <div className="relative mx-auto -mt-[1px] h-3 w-[108%] -left-[4%] rounded-b-xl bg-slate-300 shadow-md">
                                        <div className="mx-auto h-1 w-16 rounded-b bg-slate-500" />
                                    </div>

                                    {/* ── SMARTPHONE MOCKUP (Right side floating) ── */}
                                    <div className="absolute -bottom-6 -right-2 sm:-right-6 w-[170px] sm:w-[195px] rounded-[32px] border-[5px] border-slate-900 bg-white p-1.5 shadow-2xl shadow-slate-900/30 z-30">
                                        {/* Dynamic Island / Speaker Notch */}
                                        <div className="relative mx-auto mb-1.5 mt-0.5 h-3 w-16 rounded-full bg-slate-900">
                                            <div className="absolute right-3 top-1 h-1 w-1 rounded-full bg-slate-700" />
                                        </div>

                                        <div className="rounded-[22px] bg-slate-50 p-2 text-left text-slate-800">
                                            {/* Status bar */}
                                            <div className="flex justify-between items-center text-[7px] text-slate-400 font-bold px-1 mb-1">
                                                <span>9:41</span>
                                                <div className="flex items-center gap-1 text-slate-400">
                                                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                                        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                                                    </svg>
                                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M3 5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2H3zm13 3a1 1 0 011-1h1a1 1 0 011 1v4a1 1 0 01-1 1h-1a1 1 0 01-1-1V8z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                            </div>

                                            {/* Mobile Header */}
                                            <div className="flex items-center justify-between border-b border-slate-200 pb-1 px-1">
                                                <div className="flex items-center gap-1">
                                                    <div className="h-3.5 w-3.5 rounded bg-[#0f7654] text-white flex items-center justify-center text-[7px] font-bold">R</div>
                                                    <span className="text-[9px] font-bold text-slate-900">Rekapi</span>
                                                </div>
                                                <span className="text-[8px] text-slate-500 font-medium">Kasir</span>
                                            </div>

                                            {/* Mobile Cart Summary */}
                                            <div className="mt-2 rounded-lg bg-white p-2 border border-slate-200/80 shadow-2xs">
                                                <div className="text-[8px] text-slate-400">Total</div>
                                                <div className="text-xs font-black text-slate-900">Rp 120.000</div>
                                                <button className="mt-1.5 w-full rounded-md bg-[#0f7654] py-1 text-center text-[9px] font-bold text-white shadow-xs">
                                                    Bayar
                                                </button>
                                            </div>

                                            {/* Order Lines */}
                                            <div className="mt-2 space-y-1.5">
                                                <div className="flex items-center justify-between rounded-md bg-white p-1.5 border border-slate-100 text-[8px]">
                                                    <div>
                                                        <div className="font-bold text-slate-800">Dimsum Mentai</div>
                                                        <div className="text-slate-400 text-[7px]">1 x 35.000</div>
                                                    </div>
                                                    <span className="font-bold text-slate-900">35.000</span>
                                                </div>
                                                <div className="flex items-center justify-between rounded-md bg-white p-1.5 border border-slate-100 text-[8px]">
                                                    <div>
                                                        <div className="font-bold text-slate-800">Es Teh Manis</div>
                                                        <div className="text-slate-400 text-[7px]">1 x 10.000</div>
                                                    </div>
                                                    <span className="font-bold text-slate-900">10.000</span>
                                                </div>
                                            </div>

                                            {/* Mobile Bottom Tab Bar */}
                                            <div className="mt-3 flex justify-around border-t border-slate-200 pt-1.5 text-[8px] text-slate-400">
                                                <div className="text-[#0f7654] font-bold text-center flex flex-col items-center gap-0.5">
                                                    <svg className="w-3.5 h-3.5 text-[#0f7654]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                    </svg>
                                                    <span>Kasir</span>
                                                </div>
                                                <div className="text-center flex flex-col items-center gap-0.5">
                                                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                    </svg>
                                                    <span>Riwayat</span>
                                                </div>
                                                <div className="text-center flex flex-col items-center gap-0.5">
                                                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                    </svg>
                                                    <span>Laporan</span>
                                                </div>
                                                <div className="text-center flex flex-col items-center gap-0.5">
                                                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                                    </svg>
                                                    <span>Menu</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ════════════════════════════════════════════════════════
                    3. FITUR UTAMA (5 Horizontal Feature Columns)
                ════════════════════════════════════════════════════════ */}
                <section id="fitur" className="py-20 bg-white">
                    <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-12 text-center">
                        {/* Section Pill */}
                        <div className="inline-block rounded-full bg-[#e8f7f0] px-4 py-1 text-xs font-semibold text-[#0f7654]">
                            Fitur Utama
                        </div>

                        {/* Title */}
                        <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                            Semua yang Kamu Butuhkan,
                            <br />
                            Dalam Satu Platform
                        </h2>

                        {/* Subtitle */}
                        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-500 sm:text-base">
                            Rekapi dirancang khusus untuk UMKM di Indonesia. Fitur lengkap, mudah digunakan, dan siap membantu bisnis kamu dari hari pertama.
                        </p>

                        {/* 5 Features Grid */}
                        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 text-center">
                            {/* Feature 1 */}
                            <div className="flex flex-col items-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f7f0] text-[#0f7654] shadow-xs">
                                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="2" y="3" width="20" height="14" rx="2" />
                                        <line x1="8" y1="21" x2="16" y2="21" />
                                        <line x1="12" y1="17" x2="12" y2="21" />
                                        <circle cx="7" cy="8" r="1" fill="currentColor" />
                                        <circle cx="12" cy="8" r="1" fill="currentColor" />
                                        <circle cx="17" cy="8" r="1" fill="currentColor" />
                                    </svg>
                                </div>
                                <h3 className="mt-5 text-base font-bold text-slate-900">Kasir Online</h3>
                                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                    Transaksi cepat dan mudah dengan tampilan yang simpel.
                                </p>
                            </div>

                            {/* Feature 2 */}
                            <div className="flex flex-col items-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f7f0] text-[#0f7654] shadow-xs">
                                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="9" cy="21" r="1" />
                                        <circle cx="20" cy="21" r="1" />
                                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                                    </svg>
                                </div>
                                <h3 className="mt-5 text-base font-bold text-slate-900">Pembelian & Supplier</h3>
                                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                    Kelola pembelian bahan baku dan catat supplier dengan rapi.
                                </p>
                            </div>

                            {/* Feature 3 */}
                            <div className="flex flex-col items-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f7f0] text-[#0f7654] shadow-xs">
                                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                        <line x1="12" y1="22.08" x2="12" y2="12" />
                                    </svg>
                                </div>
                                <h3 className="mt-5 text-base font-bold text-slate-900">Manajemen Stok</h3>
                                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                    Pantau stok barang dan bahan baku secara real-time.
                                </p>
                            </div>

                            {/* Feature 4 */}
                            <div className="flex flex-col items-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f7f0] text-[#0f7654] shadow-xs">
                                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="20" x2="18" y2="10" />
                                        <line x1="12" y1="20" x2="12" y2="4" />
                                        <line x1="6" y1="20" x2="6" y2="14" />
                                        <path d="M4 8l6-4 4 4 6-6" />
                                    </svg>
                                </div>
                                <h3 className="mt-5 text-base font-bold text-slate-900">Laporan Keuangan</h3>
                                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                    Lihat laba, omzet, pengeluaran, dan arus kas bisnis kamu.
                                </p>
                            </div>

                            {/* Feature 5 */}
                            <div className="flex flex-col items-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f7f0] text-[#0f7654] shadow-xs">
                                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                        <circle cx="9" cy="7" r="4" />
                                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                    </svg>
                                </div>
                                <h3 className="mt-5 text-base font-bold text-slate-900">Multi Cabang</h3>
                                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                    Kelola beberapa cabang dalam satu akun.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ════════════════════════════════════════════════════════
                    4. CARA KERJA (How It Works with 3 Connected Steps)
                ════════════════════════════════════════════════════════ */}
                <section id="cara-kerja" className="bg-[#f4faf7] py-20 lg:py-24">
                    <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-12">
                        <div className="grid items-center gap-10 lg:grid-cols-12">
                            {/* Left Side (4 cols) */}
                            <div className="lg:col-span-4 text-left">
                                <div className="inline-block rounded-full bg-[#e0f3ea] px-3.5 py-1 text-xs font-semibold text-[#0f7654]">
                                    Cara Kerja
                                </div>
                                <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                                    Bikin Bisnis Kamu
                                    <br />
                                    Lebih Teratur
                                </h2>
                                <p className="mt-4 text-sm leading-relaxed text-slate-600">
                                    Mulai dari pencatatan transaksi hingga laporan keuangan, semuanya bisa kamu lakukan dengan mudah di Rekapi.
                                </p>
                                <div className="mt-7">
                                    <a
                                        href="#fitur"
                                        className="inline-flex items-center gap-2 rounded-full bg-[#0f7654] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#0d6447] transition"
                                    >
                                        Lihat Semua Fitur <span>→</span>
                                    </a>
                                </div>
                            </div>

                            {/* Right Side (8 cols): 3 Process Step Cards with Arrows */}
                            <div className="lg:col-span-8 flex flex-col md:flex-row items-center gap-4 lg:gap-3">
                                {/* Step 1 */}
                                <div className="relative flex-1 w-full rounded-2xl bg-white p-6 shadow-sm border border-slate-100 text-center">
                                    {/* Top step badge */}
                                    <div className="absolute top-4 left-4 flex h-6 w-6 items-center justify-center rounded-full bg-[#0f7654] text-[11px] font-bold text-white">
                                        1
                                    </div>
                                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f7f0] text-[#0f7654]">
                                        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="4" y="2" width="16" height="20" rx="2" />
                                            <line x1="8" y1="6" x2="16" y2="6" />
                                            <line x1="8" y1="10" x2="16" y2="10" />
                                            <line x1="8" y1="14" x2="12" y2="14" />
                                        </svg>
                                    </div>
                                    <h3 className="mt-5 text-sm font-bold text-slate-900">Catat Transaksi</h3>
                                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                        Proses penjualan di kasir dengan cepat dan akurat.
                                    </p>
                                </div>

                                {/* Connecting Arrow 1 */}
                                <div className="hidden md:flex text-slate-300 font-bold text-lg select-none">
                                    →
                                </div>

                                {/* Step 2 */}
                                <div className="relative flex-1 w-full rounded-2xl bg-white p-6 shadow-sm border border-slate-100 text-center">
                                    <div className="absolute top-4 left-4 flex h-6 w-6 items-center justify-center rounded-full bg-[#0f7654] text-[11px] font-bold text-white">
                                        2
                                    </div>
                                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f7f0] text-[#0f7654]">
                                        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="9" cy="21" r="1" />
                                            <circle cx="20" cy="21" r="1" />
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                                        </svg>
                                    </div>
                                    <h3 className="mt-5 text-sm font-bold text-slate-900">Kelola Pembelian</h3>
                                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                        Catat pembelian bahan baku dan barang dagang.
                                    </p>
                                </div>

                                {/* Connecting Arrow 2 */}
                                <div className="hidden md:flex text-slate-300 font-bold text-lg select-none">
                                    →
                                </div>

                                {/* Step 3 */}
                                <div className="relative flex-1 w-full rounded-2xl bg-white p-6 shadow-sm border border-slate-100 text-center">
                                    <div className="absolute top-4 left-4 flex h-6 w-6 items-center justify-center rounded-full bg-[#0f7654] text-[11px] font-bold text-white">
                                        3
                                    </div>
                                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f7f0] text-[#0f7654]">
                                        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <line x1="18" y1="20" x2="18" y2="10" />
                                            <line x1="12" y1="20" x2="12" y2="4" />
                                            <line x1="6" y1="20" x2="6" y2="14" />
                                        </svg>
                                    </div>
                                    <h3 className="mt-5 text-sm font-bold text-slate-900">Lihat Laporan</h3>
                                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                        Pantau laba, omzet, stok, dan arus kas secara real-time.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ════════════════════════════════════════════════════════
                    5. HARGA (3 Pricing Plans)
                ════════════════════════════════════════════════════════ */}
                <section id="harga" className="py-20 lg:py-24 bg-white">
                    <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-12 text-center">
                        <div className="inline-block rounded-full bg-[#e8f7f0] px-4 py-1 text-xs font-semibold text-[#0f7654]">
                            Harga
                        </div>
                        <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                            Pilih Paket yang Sesuai dengan Bisnismu
                        </h2>
                        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500">
                            Semua paket berlaku 28 hari. Kamu bisa upgrade kapan saja sesuai kebutuhan.
                        </p>

                        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3 max-w-6xl mx-auto text-left items-stretch">
                            {/* Card 1: Standard */}
                            <div className="rounded-2xl border border-slate-200 bg-white p-7 sm:p-8 flex flex-col justify-between shadow-xs hover:shadow-md transition">
                                <div>
                                    <h3 className="text-xl font-bold text-slate-900">Standard</h3>
                                    <p className="mt-1 text-xs text-slate-500">Cocok untuk bisnis kecil yang baru mulai.</p>

                                    <div className="mt-6 flex items-baseline gap-1">
                                        <span className="text-3xl font-extrabold text-slate-900">Rp 149.000</span>
                                        <span className="text-xs text-slate-500 font-medium">/ 28 hari</span>
                                    </div>

                                    <ul className="mt-6 space-y-3 text-xs text-slate-700 font-medium">
                                        <li className="flex items-center gap-2.5">
                                            <span className="text-[#0f7654] font-bold">✓</span> 1 Cabang
                                        </li>
                                        <li className="flex items-center gap-2.5">
                                            <span className="text-[#0f7654] font-bold">✓</span> Kasir & Laporan Keuangan
                                        </li>
                                        <li className="flex items-center gap-2.5">
                                            <span className="text-[#0f7654] font-bold">✓</span> Manajemen Stok
                                        </li>
                                        <li className="flex items-center gap-2.5">
                                            <span className="text-[#0f7654] font-bold">✓</span> Dukungan Support
                                        </li>
                                    </ul>
                                </div>

                                <div className="mt-8">
                                    <Link
                                        href="/register"
                                        className="block w-full rounded-xl border border-[#0f7654] py-3 text-center text-xs font-bold text-[#0f7654] hover:bg-[#e8f7f0] transition"
                                    >
                                        Pilih Paket
                                    </Link>
                                </div>
                            </div>

                            {/* Card 2: Business (Paling Populer) */}
                            <div className="relative rounded-2xl border-2 border-[#0f7654] bg-white p-7 sm:p-8 flex flex-col justify-between shadow-lg shadow-[#0f7654]/10">
                                {/* Paling Populer Badge inside top right */}
                                <div className="absolute top-5 right-5">
                                    <span className="rounded-full bg-[#0f7654] px-3 py-1 text-[10px] font-bold text-white tracking-wide">
                                        Paling Populer
                                    </span>
                                </div>

                                <div>
                                    <h3 className="text-xl font-bold text-slate-900">Business</h3>
                                    <p className="mt-1 text-xs text-slate-500">Untuk bisnis yang sedang berkembang.</p>

                                    <div className="mt-6 flex items-baseline gap-1">
                                        <span className="text-3xl font-extrabold text-slate-900">Rp 299.000</span>
                                        <span className="text-xs text-slate-500 font-medium">/ 28 hari</span>
                                    </div>

                                    <ul className="mt-6 space-y-3 text-xs text-slate-700 font-medium">
                                        <li className="flex items-center gap-2.5">
                                            <span className="text-[#0f7654] font-bold">✓</span> 3 Cabang
                                        </li>
                                        <li className="flex items-center gap-2.5">
                                            <span className="text-[#0f7654] font-bold">✓</span> Kasir & Laporan Keuangan
                                        </li>
                                        <li className="flex items-center gap-2.5">
                                            <span className="text-[#0f7654] font-bold">✓</span> Manajemen Stok
                                        </li>
                                        <li className="flex items-center gap-2.5">
                                            <span className="text-[#0f7654] font-bold">✓</span> Dukungan Support Prioritas
                                        </li>
                                    </ul>
                                </div>

                                <div className="mt-8">
                                    <Link
                                        href="/register"
                                        className="block w-full rounded-xl bg-[#0f7654] py-3 text-center text-xs font-bold text-white shadow-sm hover:bg-[#0d6447] transition"
                                    >
                                        Pilih Paket
                                    </Link>
                                </div>
                            </div>

                            {/* Card 3: Pro */}
                            <div className="rounded-2xl border border-slate-200 bg-white p-7 sm:p-8 flex flex-col justify-between shadow-xs hover:shadow-md transition">
                                <div>
                                    <h3 className="text-xl font-bold text-slate-900">Pro</h3>
                                    <p className="mt-1 text-xs text-slate-500">Untuk bisnis skala lebih besar.</p>

                                    <div className="mt-6 flex items-baseline gap-1">
                                        <span className="text-3xl font-extrabold text-slate-900">Rp 499.000</span>
                                        <span className="text-xs text-slate-500 font-medium">/ 28 hari</span>
                                    </div>

                                    <ul className="mt-6 space-y-3 text-xs text-slate-700 font-medium">
                                        <li className="flex items-center gap-2.5">
                                            <span className="text-[#0f7654] font-bold">✓</span> 5 Cabang
                                        </li>
                                        <li className="flex items-center gap-2.5">
                                            <span className="text-[#0f7654] font-bold">✓</span> Kasir & Laporan Keuangan
                                        </li>
                                        <li className="flex items-center gap-2.5">
                                            <span className="text-[#0f7654] font-bold">✓</span> Manajemen Stok
                                        </li>
                                        <li className="flex items-center gap-2.5">
                                            <span className="text-[#0f7654] font-bold">✓</span> Fitur Barcode & SKU
                                        </li>
                                        <li className="flex items-center gap-2.5">
                                            <span className="text-[#0f7654] font-bold">✓</span> Dukungan Support Prioritas
                                        </li>
                                    </ul>
                                </div>

                                <div className="mt-8">
                                    <Link
                                        href="/register"
                                        className="block w-full rounded-xl border border-[#0f7654] py-3 text-center text-xs font-bold text-[#0f7654] hover:bg-[#e8f7f0] transition"
                                    >
                                        Pilih Paket
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ════════════════════════════════════════════════════════
                    6. CALL TO ACTION BANNER (Dark Green Card with Illustration)
                ════════════════════════════════════════════════════════ */}
                <section className="py-12 bg-white">
                    <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-12">
                        <div className="relative overflow-hidden rounded-3xl bg-[#142820] px-8 py-12 sm:px-12 lg:px-16 text-white shadow-xl">
                            {/* Background glowing gradient */}
                            <div
                                aria-hidden
                                className="pointer-events-none absolute -right-16 -top-16 h-80 w-80 rounded-full bg-[#0f7654]/30 blur-3xl"
                            />

                            <div className="relative grid items-center gap-8 lg:grid-cols-12">
                                {/* Left Content */}
                                <div className="lg:col-span-7 text-left">
                                    <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
                                        Siap Mulai?
                                    </span>
                                    <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                                        Kelola Bisnismu Sekarang Juga!
                                    </h2>
                                    <p className="mt-2 text-xs sm:text-sm text-slate-300">
                                        Daftar dalam hitungan menit dan rasakan kemudahannya.
                                    </p>
                                    <div className="mt-6">
                                        <Link
                                            href="/register"
                                            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0f7654] px-6 py-3 text-xs sm:text-sm font-semibold text-white shadow-md hover:bg-[#128f66] transition"
                                        >
                                            Mulai Sekarang <span>→</span>
                                        </Link>
                                    </div>
                                </div>

                                {/* Right Illustration: Business owner line art with speech bubble */}
                                <div className="lg:col-span-5 flex items-center justify-center lg:justify-end">
                                    <div className="relative flex items-center gap-3">
                                        {/* Owner / Cashier Line Art Illustration */}
                                        <div className="w-48 sm:w-56 h-auto opacity-95">
                                            <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full stroke-emerald-200">
                                                {/* Person Head & Face */}
                                                <circle cx="100" cy="40" r="18" strokeWidth="2.5" />
                                                <path d="M92 42c2 3 6 4 9 2" strokeWidth="2" strokeLinecap="round" />
                                                <circle cx="95" cy="36" r="1.5" fill="#a7f3d0" />
                                                <circle cx="107" cy="37" r="1.5" fill="#a7f3d0" />
                                                {/* Hair */}
                                                <path d="M84 38c0-10 7-18 18-18s18 8 18 16c-4-4-10-6-16-4-6 2-12 1-20 6z" strokeWidth="2.5" fill="#142820" />
                                                {/* Body / Apron */}
                                                <path d="M78 80l6-22c1-4 5-6 9-6h14c4 0 8 2 9 6l6 22" strokeWidth="2.5" strokeLinecap="round" />
                                                <path d="M84 75h32v40H84z" strokeWidth="2" strokeLinecap="round" />
                                                {/* Apron straps */}
                                                <line x1="88" y1="58" x2="88" y2="75" strokeWidth="2" />
                                                <line x1="112" y1="58" x2="112" y2="75" strokeWidth="2" />
                                                {/* Arms typing on laptop */}
                                                <path d="M78 80l14 16h10" strokeWidth="2.5" strokeLinecap="round" />
                                                <path d="M122 80l-14 16h-6" strokeWidth="2.5" strokeLinecap="round" />
                                                {/* Laptop desk */}
                                                <rect x="75" y="96" width="50" height="26" rx="2" strokeWidth="2" />
                                                <path d="M60 122h80" strokeWidth="2.5" strokeLinecap="round" />
                                                {/* Coffee cup */}
                                                <rect x="145" y="112" width="10" height="10" rx="1" strokeWidth="1.5" />
                                                <path d="M155 114c2 0 3 1 3 3s-1 3-3 3" strokeWidth="1.5" />
                                            </svg>
                                        </div>

                                        {/* Handwritten Style Quote Bubble */}
                                        <div className="relative text-left max-w-[150px]">
                                            <p className="font-serif italic text-xs text-emerald-200 leading-snug tracking-wide">
                                                &ldquo;Bersama Rekapi, bisnis kamu lebih maju!&rdquo;
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* ════════════════════════════════════════════════════════
                7. FOOTER
            ════════════════════════════════════════════════════════ */}
            <footer id="tentang" className="bg-[#0f1214] text-slate-400 py-14 border-t border-slate-800">
                <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-12">
                    {/* Top Row */}
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-slate-800/80">
                        {/* Logo */}
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
                                <Image
                                    src="/logo.png?v=2"
                                    alt="Logo Rekapi"
                                    width={32}
                                    height={32}
                                    className="w-full h-full object-contain"
                                    unoptimized
                                />
                            </div>
                            <span className="text-lg font-bold text-white tracking-tight">Rekapi</span>
                        </div>

                        {/* Navigation Links */}
                        <div className="flex items-center gap-8 text-xs font-medium text-slate-300">
                            <a href="#fitur" className="hover:text-white transition">Fitur</a>
                            <a href="#harga" className="hover:text-white transition">Harga</a>
                            <a href="#tentang" className="hover:text-white transition">Tentang</a>
                            <a href="https://wa.me/6281234567890" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">Bantuan</a>
                        </div>

                        {/* Social Icons */}
                        <div className="flex items-center gap-4 text-slate-400">
                            {/* Instagram */}
                            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="hover:text-white transition">
                                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                                </svg>
                            </a>
                            {/* YouTube */}
                            <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="hover:text-white transition">
                                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                                </svg>
                            </a>
                            {/* WhatsApp */}
                            <a href="https://wa.me/6281234567890" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="hover:text-white transition">
                                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                                </svg>
                            </a>
                        </div>
                    </div>

                    {/* Bottom Row */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 text-xs text-slate-500">
                        <p>SaaS untuk UMKM yang lebih baik.</p>
                        <p>© 2026 Rekapi. Semua hak dilindungi.</p>
                    </div>
                </div>
            </footer>
        </div>
    )
}
