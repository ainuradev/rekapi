import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    return (
        <div className="relative min-h-screen overflow-x-hidden bg-white text-slate-900">
            {/* ════════════════════════════════════════════════════════
                NAVBAR
            ════════════════════════════════════════════════════════ */}
            <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-sm">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-2.5 group">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white text-lg shadow-sm shadow-blue-600/30 transition-transform group-hover:scale-105">
                            ⚡
                        </span>
                        <span className="text-lg font-extrabold tracking-tight text-slate-900">
                            Rekapin
                        </span>
                    </Link>

                    {/* Desktop Nav */}
                    <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
                        <a href="#tentang" className="transition hover:text-blue-600">Tentang</a>
                        <a href="#harga" className="transition hover:text-blue-600">Harga</a>
                        <a href="#cara-kerja" className="transition hover:text-blue-600">Cara Kerja</a>
                        <a href="#faq" className="transition hover:text-blue-600">FAQ</a>
                        <a href="#kontak" className="transition hover:text-blue-600">Kontak</a>
                    </nav>

                    {/* CTA */}
                    <div className="flex items-center gap-2">
                        {user ? (
                            <Link
                                href="/dashboard"
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700"
                            >
                                Buka Dashboard →
                            </Link>
                        ) : (
                            <>
                                <Link
                                    href="/login"
                                    className="hidden rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 sm:block"
                                >
                                    Masuk
                                </Link>
                                <Link
                                    href="/register"
                                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700"
                                >
                                    Coba Gratis
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <main>
                {/* ════════════════════════════════════════════════════════
                    HERO
                ════════════════════════════════════════════════════════ */}
                <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/60 to-white pt-20 pb-28 sm:pt-28 sm:pb-36">
                    {/* Subtle grid bg */}
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:40px_40px] opacity-40" />
                    {/* Blue glow */}
                    <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 -z-10 h-[500px] w-[800px] rounded-full bg-blue-500/10 blur-[100px]" />

                    <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6">
                        <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-700">
                            <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                            Kasir POS & Rekap Keuangan Multi-Cabang untuk UMKM
                        </div>

                        <h1 className="mt-7 text-4xl font-black tracking-tight text-slate-900 sm:text-6xl sm:leading-[1.12]">
                            Catat di Cabang,{' '}
                            <span className="text-blue-600">Rekap Otomatis</span>
                            {' '}Setiap Hari.
                        </h1>

                        <p className="mx-auto mt-6 max-w-2xl text-base text-slate-600 leading-relaxed sm:text-lg">
                            Aplikasi kasir yang membebaskan owner UMKM dari rekap nota fisik di malam hari.
                            Seluruh transaksi, HPP, dan laporan cabang terhubung rapi secara real-time.
                        </p>

                        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                            <Link
                                href="/register"
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 hover:scale-[1.02] active:scale-[0.99] sm:w-auto"
                            >
                                Mulai Gratis 7 Hari →
                            </Link>
                            <Link
                                href="/login"
                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-8 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700 sm:w-auto"
                            >
                                Masuk ke Akun
                            </Link>
                        </div>

                        {/* Trust badges */}
                        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs font-medium text-slate-500">
                            <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">✓ Tanpa kartu kredit</span>
                            <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">⚡ Siap pakai 2 menit</span>
                            <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">🔒 HPP aman dari kasir</span>
                            <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">📱 Ringan di HP manapun</span>
                        </div>

                        {/* Dashboard mockup */}
                        <div className="relative mt-16 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-900/10 sm:p-6">
                            {/* Window bar */}
                            <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                                <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                                <span className="ml-3 text-xs font-semibold text-slate-400">app.rekapin.com — Dashboard Owner</span>
                            </div>
                            <div className="grid gap-3 text-left sm:grid-cols-3">
                                {/* POS mock */}
                                <div className="col-span-2 rounded-xl border border-slate-100 bg-slate-50 p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-base">🧾</span>
                                            <div>
                                                <div className="text-xs font-bold text-slate-900">Kasir POS Aktif</div>
                                                <div className="text-[10px] text-slate-500">Pesanan #1042</div>
                                            </div>
                                        </div>
                                        <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                                            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                            Live
                                        </span>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between rounded-lg border border-blue-100 bg-white p-2.5 text-xs">
                                            <div>
                                                <div className="font-semibold text-slate-900">Dimsum Mentai Mozza (10 pcs)</div>
                                                <div className="text-slate-500">Rp35.000 × 2</div>
                                            </div>
                                            <span className="font-bold text-blue-600">Rp70.000</span>
                                        </div>
                                        <div className="flex justify-between rounded-lg border border-slate-100 bg-white p-2.5 text-xs">
                                            <div>
                                                <div className="font-semibold text-slate-900">Es Teh Manis Jumbo</div>
                                                <div className="text-slate-500">Rp6.000 × 2</div>
                                            </div>
                                            <span className="font-bold text-blue-600">Rp12.000</span>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                                        <span className="text-sm font-black text-slate-900">Total: Rp82.000</span>
                                        <span className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white">✓ Selesai</span>
                                    </div>
                                </div>
                                {/* Stats mock */}
                                <div className="flex flex-col gap-3">
                                    <div className="rounded-xl bg-blue-600 p-4 text-white">
                                        <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-200">Omzet Hari Ini</div>
                                        <div className="mt-1.5 text-xl font-black">Rp2.450.000</div>
                                        <div className="mt-0.5 text-[10px] text-blue-200">↑ 28 transaksi</div>
                                    </div>
                                    <div className="rounded-xl bg-emerald-600 p-4 text-white">
                                        <div className="flex items-center justify-between">
                                            <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-100">Laba Kotor</div>
                                            <span className="text-xs">🔒</span>
                                        </div>
                                        <div className="mt-1.5 text-lg font-black">Rp1.120.000</div>
                                        <div className="mt-0.5 text-[10px] text-emerald-100">Owner only</div>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                                        <div className="text-[10px] font-bold text-slate-700">📋 Salin Rekap WhatsApp</div>
                                        <div className="mt-1 text-[10px] text-slate-500">1-klik closing shift ke grup WA toko</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ════════════════════════════════════════════════════════
                    TENTANG
                ════════════════════════════════════════════════════════ */}
                <section id="tentang" className="border-t border-slate-100 bg-white py-20 sm:py-28">
                    <div className="mx-auto max-w-5xl px-4 sm:px-6">
                        <div className="grid items-center gap-12 sm:grid-cols-2">
                            <div>
                                <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700">
                                    Tentang Rekapin
                                </span>
                                <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                                    Dibuat untuk Pemilik UMKM yang Ingin Tenang
                                </h2>
                                <p className="mt-4 text-sm leading-relaxed text-slate-600">
                                    Rekapin adalah sistem kasir dan rekap keuangan berbasis web yang dirancang khusus untuk
                                    UMKM Indonesia yang memiliki lebih dari satu cabang. Tidak perlu instalasi, tidak perlu hardware mahal.
                                </p>
                                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                                    Kami percaya bahwa setiap pemilik usaha berhak punya laporan keuangan harian yang akurat dan
                                    rahasia modal yang aman — tanpa harus belajar software akuntansi yang rumit.
                                </p>
                                <div className="mt-6 flex flex-wrap gap-3">
                                    {[
                                        { icon: '🏪', text: 'Multi-Cabang' },
                                        { icon: '📊', text: 'Rekap Otomatis' },
                                        { icon: '🔒', text: 'HPP Terlindungi' },
                                        { icon: '📱', text: 'Mobile-First' },
                                    ].map((item) => (
                                        <span
                                            key={item.text}
                                            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                        >
                                            {item.icon} {item.text}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { value: '2 menit', label: 'Waktu setup akun pertama', color: 'bg-blue-50 border-blue-200 text-blue-700' },
                                    { value: '0 rupiah', label: 'Biaya hardware tambahan', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                                    { value: '100%', label: 'HPP & modal aman dari kasir', color: 'bg-amber-50 border-amber-200 text-amber-700' },
                                    { value: '∞', label: 'Cabang dapat dikelola sekaligus', color: 'bg-purple-50 border-purple-200 text-purple-700' },
                                ].map((s) => (
                                    <div key={s.label} className={`rounded-2xl border p-5 ${s.color}`}>
                                        <div className="text-2xl font-black">{s.value}</div>
                                        <div className="mt-1 text-xs font-medium leading-snug opacity-80">{s.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ════════════════════════════════════════════════════════
                    FITUR UNGGULAN (Before/After)
                ════════════════════════════════════════════════════════ */}
                <section className="border-t border-slate-100 bg-slate-50 py-20 sm:py-28">
                    <div className="mx-auto max-w-5xl px-4 sm:px-6">
                        <div className="text-center">
                            <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700">
                                Kenapa Rekapin?
                            </span>
                            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                                Hentikan Lembur Rekap Nota Setiap Malam
                            </h2>
                            <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500 sm:text-base">
                                Tinggalkan buku tulis dan spreadsheet manual yang rawan salah hitung.
                            </p>
                        </div>

                        <div className="mt-12 grid gap-6 sm:grid-cols-2">
                            {/* Sebelum */}
                            <div className="rounded-2xl border border-red-200 bg-red-50/60 p-7">
                                <div className="mb-5 inline-flex items-center gap-2 rounded-lg bg-red-100 px-3 py-1 text-sm font-bold text-red-700">
                                    ❌ Cara Lama
                                </div>
                                <ul className="space-y-3 text-sm text-slate-700">
                                    {[
                                        'Owner rekap nota 1–2 jam tiap malam',
                                        'HPP dan margin bocor ke kasir',
                                        'Tidak bisa pantau cabang lain dari jauh',
                                        'Kas sering selisih tanpa audit log yang jelas',
                                    ].map((item) => (
                                        <li key={item} className="flex items-start gap-2.5">
                                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-200 text-[10px] font-bold text-red-700">✕</span>
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            {/* Sesudah */}
                            <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-7 ring-2 ring-blue-200/60">
                                <div className="mb-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1 text-sm font-bold text-white shadow-sm">
                                    ⚡ Dengan Rekapin
                                </div>
                                <ul className="space-y-3 text-sm text-slate-700">
                                    {[
                                        'Kasir catat sekali, omzet langsung terhitung',
                                        'HPP dikunci di database — kasir tidak bisa lihat',
                                        'Pantau semua cabang real-time dari 1 dashboard',
                                        '1-klik rekap WhatsApp & export CSV/Excel',
                                    ].map((item) => (
                                        <li key={item} className="flex items-start gap-2.5">
                                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-200 text-[10px] font-bold text-blue-700">✓</span>
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* Feature grid */}
                        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {[
                                { icon: '🧾', title: 'Kasir Touch-Friendly', desc: 'Didesain mobile-first. Tombol besar, tambah order kilat, pilih channel Offline/GoFood/GrabFood/ShopeeFood.' },
                                { icon: '👥', title: '1 Akun Shared per Cabang', desc: 'Tidak perlu email baru untuk tiap karyawan. 1 login bersama per cabang, kasir langsung siap.' },
                                { icon: '🛡️', title: 'HPP Terkunci Aman', desc: 'Kolom HPP disembunyikan dan dikunci di level database. Margin hanya milik Anda.' },
                                { icon: '📊', title: 'Rekap Harian, Mingguan, Bulanan', desc: 'Filter instan omzet, transaksi, porsi terjual, dan breakdown QRIS/Cash/Transfer.' },
                                { icon: '📋', title: 'Export CSV & WhatsApp', desc: 'Tutup kasir malam hari? Satu klik kirim rekap rapi ke grup WA atau unduh Excel.' },
                                { icon: '✏️', title: 'Koreksi & Audit Log', desc: 'Transaksi salah bisa diedit. Sistem otomatis catat data lama vs baru di riwayat permanen.' },
                            ].map((f) => (
                                <div
                                    key={f.title}
                                    className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                                >
                                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-xl">{f.icon}</span>
                                    <h3 className="mt-4 text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{f.title}</h3>
                                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{f.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ════════════════════════════════════════════════════════
                    CARA KERJA
                ════════════════════════════════════════════════════════ */}
                <section id="cara-kerja" className="border-t border-slate-100 bg-white py-20 sm:py-28">
                    <div className="mx-auto max-w-5xl px-4 sm:px-6">
                        <div className="text-center">
                            <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700">
                                Cara Kerja
                            </span>
                            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                                Mulai dalam Kurang dari 2 Menit
                            </h2>
                        </div>

                        <div className="mt-14 grid gap-6 sm:grid-cols-3">
                            {[
                                {
                                    step: '1',
                                    title: 'Daftar Akun Bisnis',
                                    desc: 'Buat akun owner, masukkan nama bisnis dan cabang pertama. Langsung aktif tanpa instalasi.',
                                    color: 'bg-blue-600',
                                },
                                {
                                    step: '2',
                                    title: 'Input Produk & Buat Akun Kasir',
                                    desc: 'Masukkan menu dengan harga jual & HPP. Buat akun login kasir per cabang lewat menu Pegawai.',
                                    color: 'bg-blue-500',
                                },
                                {
                                    step: '3',
                                    title: 'Pantau Rekap Otomatis',
                                    desc: 'Kasir mulai mencatat dari HP. Anda duduk santai melihat grafik omzet dan profit real-time.',
                                    color: 'bg-blue-700',
                                },
                            ].map((step) => (
                                <div key={step.step} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
                                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${step.color} text-white font-black text-lg shadow-sm`}>
                                        {step.step}
                                    </div>
                                    <h3 className="mt-5 font-bold text-slate-900">{step.title}</h3>
                                    <p className="mt-2 text-xs text-slate-500 leading-relaxed">{step.desc}</p>
                                </div>
                            ))}
                        </div>

                        {/* Testimonial */}
                        <div className="mt-10 rounded-2xl border border-blue-100 bg-blue-50/60 p-6 sm:p-8">
                            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white">
                                    🍱
                                </div>
                                <div>
                                    <div className="text-sm text-amber-500 font-bold">★★★★★</div>
                                    <p className="mt-1 text-sm italic text-slate-700 font-medium">
                                        "Dulu tiap jam 10 malam pusing rekap tumpukan nota dari 2 cabang. Sekarang kasir tinggal klik
                                        Salin Rekap WA, omzet & laba langsung kelihatan detik itu juga."
                                    </p>
                                    <p className="mt-1.5 text-xs font-semibold text-slate-500">
                                        — Dimsum Mentai (2 Cabang Aktif)
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ════════════════════════════════════════════════════════
                    HARGA
                ════════════════════════════════════════════════════════ */}
                <section id="harga" className="border-t border-slate-100 bg-slate-50 py-20 sm:py-28">
                    <div className="mx-auto max-w-5xl px-4 sm:px-6">
                        <div className="text-center">
                            <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700">
                                Harga
                            </span>
                            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                                Transparan, Tanpa Biaya Tersembunyi
                            </h2>
                            <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500">
                                Mulai gratis selama 7 hari. Tidak perlu kartu kredit.
                            </p>
                        </div>

                        <div className="mt-12 grid gap-6 sm:grid-cols-3">
                            {/* Free */}
                            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
                                <div className="text-sm font-bold text-slate-500 uppercase tracking-wide">Trial</div>
                                <div className="mt-3 text-4xl font-black text-slate-900">Gratis</div>
                                <div className="mt-0.5 text-xs text-slate-400">7 hari penuh</div>
                                <ul className="mt-6 space-y-2.5 text-sm text-slate-600">
                                    {['Semua fitur kasir POS', 'Multi-cabang', 'Rekap harian & mingguan', 'Export CSV', 'Tanpa batas transaksi'].map((f) => (
                                        <li key={f} className="flex items-center gap-2">
                                            <span className="text-green-500">✓</span> {f}
                                        </li>
                                    ))}
                                </ul>
                                <Link href="/register" className="mt-7 block w-full rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-center text-sm font-bold text-blue-700 transition hover:bg-blue-100">
                                    Mulai Gratis
                                </Link>
                            </div>

                            {/* Pro — Popular */}
                            <div className="relative rounded-2xl border-2 border-blue-600 bg-blue-600 p-7 text-white shadow-xl shadow-blue-600/20">
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <span className="rounded-full bg-amber-400 px-3 py-0.5 text-[11px] font-black text-amber-900">TERPOPULER</span>
                                </div>
                                <div className="text-sm font-bold uppercase tracking-wide text-blue-200">Pro</div>
                                <div className="mt-3 text-4xl font-black">Rp149k</div>
                                <div className="mt-0.5 text-xs text-blue-200">per bulan / bisnis</div>
                                <ul className="mt-6 space-y-2.5 text-sm text-blue-100">
                                    {['Semua fitur Trial', 'Hingga 10 cabang', 'Rekap bulanan & tahunan', 'Export Excel & PDF', 'Laporan keuangan lengkap', 'Reset password pegawai', 'Prioritas support'].map((f) => (
                                        <li key={f} className="flex items-center gap-2">
                                            <span className="text-blue-300">✓</span> {f}
                                        </li>
                                    ))}
                                </ul>
                                <Link href="/register" className="mt-7 block w-full rounded-xl bg-white py-2.5 text-center text-sm font-bold text-blue-700 transition hover:bg-blue-50">
                                    Pilih Pro
                                </Link>
                            </div>

                            {/* Enterprise */}
                            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
                                <div className="text-sm font-bold text-slate-500 uppercase tracking-wide">Enterprise</div>
                                <div className="mt-3 text-4xl font-black text-slate-900">Custom</div>
                                <div className="mt-0.5 text-xs text-slate-400">hubungi kami</div>
                                <ul className="mt-6 space-y-2.5 text-sm text-slate-600">
                                    {['Semua fitur Pro', 'Cabang tidak terbatas', 'Custom domain', 'Onboarding khusus', 'Dedicated support', 'SLA & backup data'].map((f) => (
                                        <li key={f} className="flex items-center gap-2">
                                            <span className="text-green-500">✓</span> {f}
                                        </li>
                                    ))}
                                </ul>
                                <a href="#kontak" className="mt-7 block w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-center text-sm font-bold text-slate-700 transition hover:bg-slate-100">
                                    Hubungi Kami
                                </a>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ════════════════════════════════════════════════════════
                    FAQ
                ════════════════════════════════════════════════════════ */}
                <section id="faq" className="border-t border-slate-100 bg-white py-20 sm:py-28">
                    <div className="mx-auto max-w-3xl px-4 sm:px-6">
                        <div className="text-center">
                            <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700">
                                FAQ
                            </span>
                            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900">
                                Hal yang Sering Ditanyakan
                            </h2>
                        </div>

                        <div className="mt-12 space-y-3">
                            {[
                                {
                                    q: 'Apakah kasir bisa melihat HPP atau rahasia modal saya?',
                                    a: 'Sama sekali tidak. Rekapin menggunakan keamanan berlapis di level database (Postgres RLS). Kasir hanya melihat harga jual. HPP dan laba bersih dikunci khusus akun Owner.',
                                },
                                {
                                    q: 'Apakah saya harus membeli hardware atau mesin kasir?',
                                    a: 'Tidak perlu. Rekapin adalah web app yang berjalan mulus di browser smartphone kasir, tablet, maupun laptop yang sudah Anda miliki.',
                                },
                                {
                                    q: 'Bagaimana jika kasir saya berganti shift?',
                                    a: 'Rekapin menggunakan model 1 akun shared per cabang. Siapapun yang bertugas menggunakan login yang sama. Tutup shift? Klik "Salin Rekap WA" untuk serah terima kas.',
                                },
                                {
                                    q: 'Apakah ada biaya tersembunyi selama trial?',
                                    a: '100% gratis selama 7 hari tanpa kartu kredit. Semua fitur kasir, multi-cabang, dan rekap bisa dicoba bebas.',
                                },
                                {
                                    q: 'Apakah data saya aman jika saya berhenti berlangganan?',
                                    a: 'Data Anda tetap tersimpan selama 30 hari setelah masa aktif berakhir. Anda bisa export semua data dalam format CSV/Excel sebelum keluar.',
                                },
                            ].map((item) => (
                                <details
                                    key={item.q}
                                    className="group rounded-xl border border-slate-200 bg-white open:border-blue-200 open:bg-blue-50/30 transition"
                                >
                                    <summary className="flex cursor-pointer items-center justify-between p-5 font-semibold text-sm text-slate-900 list-none">
                                        <span>{item.q}</span>
                                        <span className="ml-4 shrink-0 text-slate-400 transition group-open:rotate-45">+</span>
                                    </summary>
                                    <p className="border-t border-slate-100 px-5 pb-5 pt-4 text-xs leading-relaxed text-slate-600">
                                        {item.a}
                                    </p>
                                </details>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ════════════════════════════════════════════════════════
                    KONTAK
                ════════════════════════════════════════════════════════ */}
                <section id="kontak" className="border-t border-slate-100 bg-slate-50 py-20 sm:py-28">
                    <div className="mx-auto max-w-3xl px-4 sm:px-6">
                        <div className="text-center">
                            <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700">
                                Kontak
                            </span>
                            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900">
                                Ada Pertanyaan? Kami Siap Membantu
                            </h2>
                            <p className="mx-auto mt-3 max-w-lg text-sm text-slate-500">
                                Tim kami akan membalas dalam 1×24 jam pada hari kerja.
                            </p>
                        </div>

                        <div className="mt-10 grid gap-5 sm:grid-cols-3">
                            {[
                                {
                                    icon: '💬',
                                    title: 'WhatsApp',
                                    desc: 'Chat langsung dengan tim support kami',
                                    link: 'https://wa.me/6281234567890',
                                    label: 'Chat Sekarang',
                                },
                                {
                                    icon: '📧',
                                    title: 'Email',
                                    desc: 'Kirim pertanyaan detail via email',
                                    link: 'mailto:halo@rekapin.com',
                                    label: 'halo@rekapin.com',
                                },
                                {
                                    icon: '📸',
                                    title: 'Instagram',
                                    desc: 'Update fitur & tips UMKM terbaru',
                                    link: 'https://instagram.com/rekapin.id',
                                    label: '@rekapin.id',
                                },
                            ].map((c) => (
                                <a
                                    key={c.title}
                                    href={c.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm transition hover:border-blue-300 hover:shadow-md"
                                >
                                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-2xl group-hover:bg-blue-100 transition">
                                        {c.icon}
                                    </span>
                                    <div className="mt-4 font-bold text-slate-900">{c.title}</div>
                                    <div className="mt-1 text-xs text-slate-500">{c.desc}</div>
                                    <div className="mt-3 text-xs font-semibold text-blue-600 group-hover:underline">{c.label}</div>
                                </a>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ════════════════════════════════════════════════════════
                    CTA FINAL
                ════════════════════════════════════════════════════════ */}
                <section className="bg-blue-600 py-20 text-center text-white sm:py-24">
                    <div className="mx-auto max-w-2xl px-4">
                        <h2 className="text-3xl font-black sm:text-4xl">
                            Siap Berhenti Rekap Manual?
                        </h2>
                        <p className="mx-auto mt-4 max-w-md text-sm text-blue-100">
                            Bergabung dengan pemilik UMKM yang sudah tenang karena keuangan cabangnya terpantau otomatis setiap hari.
                        </p>
                        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                            <Link
                                href="/register"
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 text-sm font-bold text-blue-700 shadow-lg shadow-blue-900/20 transition hover:bg-blue-50 sm:w-auto"
                            >
                                Mulai Gratis 7 Hari →
                            </Link>
                            <a
                                href="#kontak"
                                className="flex w-full items-center justify-center rounded-xl border border-blue-400 px-8 py-3.5 text-sm font-semibold text-blue-100 transition hover:border-white hover:text-white sm:w-auto"
                            >
                                Tanya Dulu
                            </a>
                        </div>
                        <p className="mt-5 text-xs text-blue-200">Tidak perlu kartu kredit · Langsung aktif · Bisa cancel kapan saja</p>
                    </div>
                </section>
            </main>

            {/* ════════════════════════════════════════════════════════
                FOOTER
            ════════════════════════════════════════════════════════ */}
            <footer className="border-t border-slate-200 bg-white py-10">
                <div className="mx-auto max-w-6xl px-4 sm:px-6">
                    <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                        <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white text-sm">⚡</span>
                            <span className="font-bold text-slate-900">Rekapin</span>
                            <span className="text-xs text-slate-400">— UMKM OS Indonesia</span>
                        </div>
                        <div className="flex items-center gap-5 text-xs text-slate-500">
                            <a href="#tentang" className="hover:text-blue-600 transition">Tentang</a>
                            <a href="#harga" className="hover:text-blue-600 transition">Harga</a>
                            <a href="#faq" className="hover:text-blue-600 transition">FAQ</a>
                            <a href="#kontak" className="hover:text-blue-600 transition">Kontak</a>
                            <Link href="/login" className="hover:text-blue-600 transition">Masuk</Link>
                        </div>
                        <p className="text-xs text-slate-400">© 2026 Rekapin. All rights reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    )
}
