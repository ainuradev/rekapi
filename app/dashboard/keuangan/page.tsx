import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveBranchId } from '@/lib/active-branch'
import { resolveEffectiveBranchFilter } from '@/lib/inventory-valuation'

function fmt(n: number) {
    return 'Rp' + Math.round(n).toLocaleString('id-ID')
}

export default async function KeuanganHubPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profileRaw } = await supabase
        .from('profiles')
        .select('role, business_id, full_name, businesses(name)')
        .eq('id', user.id)
        .single()

    const profile = profileRaw as unknown as {
        role: string
        business_id: string
        full_name: string | null
        businesses: { name: string } | null
    } | null

    if (!profile || profile.role !== 'owner' || !profile.business_id) {
        redirect('/dashboard')
    }

    const businessId = profile.business_id
    const businessName = profile.businesses?.name || 'Bisnis Anda'
    const candidateBranchId = await getActiveBranchId()

    // Ambil daftar cabang milik bisnis pengguna & validasi cabang efektif
    const { data: branches } = await supabase
        .from('branches')
        .select('id, name')
        .eq('business_id', businessId)
        .order('name')

    const branchList = branches ?? []
    const { selectedBranchId, selectedBranch, branchLabel } = resolveEffectiveBranchFilter(candidateBranchId, branchList)

    // Fetch live statistics in parallel
    let salesCount = 0
    let expenseCount = 0
    let purchaseCount = 0
    let productCount = 0

    let totalCashAndBank = 0
    let activeDebtsCount = 0
    let activeRecCount = 0
    let netEquityTotal = 0

    if (businessId) {
        let sQuery = supabase.from('sales').select('*', { count: 'exact', head: true }).eq('business_id', businessId)
        let expQuery = supabase.from('expenses').select('*', { count: 'exact', head: true }).eq('business_id', businessId)
        let purQuery = supabase.from('purchases').select('*', { count: 'exact', head: true }).eq('business_id', businessId)

        if (selectedBranchId !== 'all') {
            sQuery = sQuery.eq('branch_id', selectedBranchId)
            expQuery = expQuery.eq('branch_id', selectedBranchId)
            purQuery = purQuery.eq('branch_id', selectedBranchId)
        }

        const [
            { count: sCnt },
            { count: expCnt },
            { count: purCnt },
            { count: prodCnt },
            { data: accountsData },
            { data: debtsData },
            { data: recsData },
            { data: equityData },
        ] = await Promise.all([
            sQuery,
            expQuery,
            purQuery,
            supabase.from('products').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
            supabase.from('financial_accounts').select('current_balance').eq('business_id', businessId).eq('status', 'active'),
            supabase.from('debts_payables').select('total_amount, paid_amount, branch_id, purchases(branch_id)').eq('business_id', businessId).neq('status', 'paid'),
            supabase.from('receivables').select('total_amount, paid_amount, branch_id, sales(branch_id)').eq('business_id', businessId).neq('status', 'paid'),
            supabase.from('equity_records').select('amount, type').eq('business_id', businessId),
        ])

        if (typeof sCnt === 'number') salesCount = sCnt
        if (typeof expCnt === 'number') expenseCount = expCnt
        if (typeof purCnt === 'number') purchaseCount = purCnt
        if (typeof prodCnt === 'number') productCount = prodCnt

        if (accountsData) {
            totalCashAndBank = accountsData.reduce((acc, a) => acc + Number(a.current_balance || 0), 0)
        }
        if (debtsData) {
            const branchDebts = (debtsData as unknown as { total_amount: number; paid_amount: number; branch_id?: string | null; purchases?: { branch_id?: string | null } | null }[]).filter((d) => {
                if (selectedBranchId === 'all') return true
                const bId = d.branch_id || d.purchases?.branch_id
                return bId === selectedBranchId
            })
            activeDebtsCount = branchDebts.length
        }
        if (recsData) {
            const branchRecs = (recsData as unknown as { total_amount: number; paid_amount: number; branch_id?: string | null; sales?: { branch_id?: string | null } | null }[]).filter((r) => {
                if (selectedBranchId === 'all') return true
                const bId = r.branch_id || r.sales?.branch_id
                return bId === selectedBranchId
            })
            activeRecCount = branchRecs.length
        }
        if (equityData) {
            netEquityTotal = equityData.reduce((acc, eq) => {
                const amt = Number(eq.amount || 0)
                return eq.type === 'drawings_prive' ? acc - amt : acc + amt
            }, 0)
        }
    }

    // ── Kartu Modul Pembukuan Operasional ──
    const operationalCards = [
        {
            title: 'Buku Kas & Rekening Bank',
            href: '/dashboard/keuangan/kas-rekening',
            countBadge: selectedBranchId === 'all'
                ? (totalCashAndBank > 0 ? fmt(totalCashAndBank) : 'Atur Saldo Awal')
                : 'Rekening Pusat',
            badgeStyle: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
            hoverBorder: 'hover:border-emerald-600 hover:shadow-emerald-600/10',
            arrowHover: 'group-hover:text-emerald-700',
            iconBg: 'bg-emerald-50 text-emerald-800 border-emerald-100 group-hover:bg-emerald-800 group-hover:text-white',
            description: 'Kelola kas fisik toko, rekening bank (BCA, Mandiri, BRI), saldo awal usaha, transfer antar kas, dan mutasi kasir.',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
            ),
        },
        {
            title: 'Buku Utang & Piutang Usaha',
            href: '/dashboard/keuangan/utang-piutang',
            countBadge: activeDebtsCount > 0 || activeRecCount > 0
                ? `${activeDebtsCount} Utang • ${activeRecCount} Piutang`
                : 'Kontrol Tagihan',
            badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200/60',
            hoverBorder: 'hover:border-amber-500 hover:shadow-amber-500/10',
            arrowHover: 'group-hover:text-amber-600',
            iconBg: 'bg-amber-50 text-amber-600 border-amber-100 group-hover:bg-amber-600 group-hover:text-white',
            description: 'Pantau utang pembelian bahan baku ke supplier tempo, bon tagihan piutang pelanggan, dan pencatatan pelunasannya.',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
            ),
        },
        {
            title: 'Modal Usaha & Ekuitas Pemilik',
            href: '/dashboard/keuangan/modal',
            countBadge: selectedBranchId === 'all'
                ? (netEquityTotal > 0 ? fmt(netEquityTotal) : 'Modal Disetor')
                : 'Modal Terpusat',
            badgeStyle: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
            hoverBorder: 'hover:border-emerald-600 hover:shadow-emerald-600/10',
            arrowHover: 'group-hover:text-emerald-700',
            iconBg: 'bg-emerald-50 text-emerald-800 border-emerald-100 group-hover:bg-emerald-800 group-hover:text-white',
            description: 'Catatan setoran modal awal pendirian, tambahan modal disetor pemilik, dan penarikan dana pribadi (prive).',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
        },
    ]

    // ── Kartu Laporan SAK EMKM ──
    const reportCards = [
        {
            title: 'Laporan Posisi Keuangan (Neraca)',
            href: '/dashboard/keuangan/neraca',
            countBadge: 'SAK EMKM • Seimbang',
            badgeStyle: 'bg-sky-50 text-sky-700 border-sky-200/60',
            hoverBorder: 'hover:border-sky-500 hover:shadow-sky-500/10',
            arrowHover: 'group-hover:text-sky-600',
            iconBg: 'bg-sky-50 text-sky-600 border-sky-100 group-hover:bg-sky-600 group-hover:text-white',
            description: 'Posisi aset lancar (kas riil, piutang & persediaan stok produk/bahan), liabilitas utang nyata, dan ekuitas modal seimbang.',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
            ),
        },
        {
            title: 'Laporan Laba Rugi & Saldo Laba',
            href: '/dashboard/keuangan/laba-rugi',
            countBadge: 'Laba Kotor & Bersih',
            badgeStyle: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
            hoverBorder: 'hover:border-emerald-600 hover:shadow-emerald-600/10',
            arrowHover: 'group-hover:text-emerald-700',
            iconBg: 'bg-emerald-50 text-emerald-800 border-emerald-100 group-hover:bg-emerald-800 group-hover:text-white',
            description: 'Perhitungan pendapatan omzet kasir, harga pokok penjualan (HPP), beban operasional, dan margin laba bersih usaha.',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
        },
        {
            title: 'Laporan Arus Kas',
            href: '/dashboard/keuangan/arus-kas',
            countBadge: purchaseCount > 0 ? `${purchaseCount} Belanja Stok` : 'Kas Masuk & Keluar',
            badgeStyle: 'bg-teal-50 text-teal-700 border-teal-200/60',
            hoverBorder: 'hover:border-teal-500 hover:shadow-teal-500/10',
            arrowHover: 'group-hover:text-teal-600',
            iconBg: 'bg-teal-50 text-teal-600 border-teal-100 group-hover:bg-teal-600 group-hover:text-white',
            description: 'Rekap aliran kas masuk riil dari penjualan kasir tunai & digital, serta kas keluar belanja pasokan & biaya toko.',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
            ),
        },
        {
            title: 'Laporan Beban Usaha & Pengeluaran',
            href: '/dashboard/keuangan/beban',
            countBadge: `${expenseCount} Biaya Terkini`,
            badgeStyle: 'bg-rose-50 text-rose-700 border-rose-200/60',
            hoverBorder: 'hover:border-rose-500 hover:shadow-rose-500/10',
            arrowHover: 'group-hover:text-rose-600',
            iconBg: 'bg-rose-50 text-rose-600 border-rose-100 group-hover:bg-rose-600 group-hover:text-white',
            description: 'Struktur beban biaya operasional (gaji, listrik, sewa, marketing, packaging) dan pencatatan biaya baru.',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                </svg>
            ),
        },
        {
            title: 'Laporan Kinerja Penjualan & Produk',
            href: '/dashboard/keuangan/kinerja',
            countBadge: `${productCount} Produk & Ekspor`,
            badgeStyle: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
            hoverBorder: 'hover:border-emerald-600 hover:shadow-emerald-600/10',
            arrowHover: 'group-hover:text-emerald-700',
            iconBg: 'bg-emerald-50 text-emerald-800 border-emerald-100 group-hover:bg-emerald-800 group-hover:text-white',
            description: 'Peringkat produk terlaris, kontribusi omzet per cabang, volume penjualan, dan ekspor pembukuan resmi format PDF/Excel/CSV.',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            ),
        },
        {
            title: 'Laporan Riwayat Transaksi',
            href: '/dashboard/penjualan/riwayat',
            countBadge: `${salesCount} Transaksi`,
            badgeStyle: 'bg-slate-50 text-slate-700 border-slate-200/60',
            hoverBorder: 'hover:border-slate-500 hover:shadow-slate-500/10',
            arrowHover: 'group-hover:text-slate-600',
            iconBg: 'bg-slate-50 text-slate-600 border-slate-100 group-hover:bg-slate-600 group-hover:text-white',
            description: 'Daftar riwayat seluruh transaksi penjualan kasir POS, rincian struk belanja, audit trail, dan cetak ulang struk.',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
            ),
        },
    ]

    return (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10 space-y-10">
            {/* Page Header */}
            <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800 mb-1">
                    <span>Pusat Pembukuan & Keuangan</span>
                    <span>•</span>
                    <span className="text-slate-500">{businessName}</span>
                    <span>•</span>
                    <span className="font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md normal-case">
                        🏢 {branchLabel}
                    </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                    Keuangan & Akuntansi Bisnis
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
                    Kelola saldo kas, rekening bank, utang supplier, piutang pelanggan, modal usaha, serta akses seluruh laporan keuangan resmi terstandar untuk {selectedBranch ? branchLabel : 'seluruh outlet usaha Anda'}.
                </p>
            </div>

            {/* SEKSI 1: Kas & Buku Keuangan Operasional */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-base font-extrabold text-slate-900">Pembukuan Kas & Keuangan Operasional</h2>
                        <p className="text-xs text-slate-500">Master kasir, saldo awal, rekening bank, pencatatan utang-piutang, dan modal usaha.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
                    {operationalCards.map((card) => (
                        <Link
                            key={card.title}
                            href={card.href}
                            className={`group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs hover:shadow-lg ${card.hoverBorder} hover:-translate-y-1 transition-all duration-200 cursor-pointer`}
                        >
                            <div>
                                <div className="flex items-center justify-between mb-5">
                                    <div className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-all duration-200 shadow-xs ${card.iconBg}`}>
                                        {card.icon}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${card.badgeStyle}`}>
                                            {card.countBadge}
                                        </span>
                                        <span className={`text-slate-300 ${card.arrowHover} group-hover:translate-x-1 transition-all duration-200 font-bold text-lg`}>
                                            →
                                        </span>
                                    </div>
                                </div>

                                <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-800 transition-colors">
                                    {card.title}
                                </h3>

                                <p className="mt-2 text-xs sm:text-sm text-slate-500 leading-relaxed">
                                    {card.description}
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>

            {/* SEKSI 2: Laporan Keuangan Resmi (SAK EMKM) */}
            <div>
                <div className="flex items-center justify-between mb-4 border-t border-slate-200/80 pt-8">
                    <div>
                        <h2 className="text-base font-extrabold text-slate-900">Laporan Keuangan Resmi (Standar SAK EMKM)</h2>
                        <p className="text-xs text-slate-500">Neraca seimbang, laba rugi, arus kas nyata, analisis beban, dan ekspor pembukuan.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                    {reportCards.map((card) => (
                        <Link
                            key={card.title}
                            href={card.href}
                            className={`group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs hover:shadow-lg ${card.hoverBorder} hover:-translate-y-1 transition-all duration-200 cursor-pointer`}
                        >
                            <div>
                                <div className="flex items-center justify-between mb-5">
                                    <div className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-all duration-200 shadow-xs ${card.iconBg}`}>
                                        {card.icon}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${card.badgeStyle}`}>
                                            {card.countBadge}
                                        </span>
                                        <span className={`text-slate-300 ${card.arrowHover} group-hover:translate-x-1 transition-all duration-200 font-bold text-lg`}>
                                            →
                                        </span>
                                    </div>
                                </div>

                                <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-800 transition-colors">
                                    {card.title}
                                </h3>

                                <p className="mt-2 text-xs sm:text-sm text-slate-500 leading-relaxed">
                                    {card.description}
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    )
}
