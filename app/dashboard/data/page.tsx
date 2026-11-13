import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveBranchId } from '@/lib/active-branch'

export default async function DataHubPage() {
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
    const businessName = profile?.businesses?.name || 'Bisnis Anda'
    const activeBranchId = await getActiveBranchId()

    // Ambil nama cabang aktif jika spesifik
    const { data: activeBranch } = (activeBranchId && activeBranchId !== 'all')
        ? await supabase.from('branches').select('name').eq('id', activeBranchId).single()
        : { data: null }

    // Fetch live statistics in parallel
    let supplierCount = 0
    let branchCount = 0
    let productCount = 0
    let rawMaterialCount = 0
    let customerCount = 0
    let employeeCount = 0
    let salesCount = 0

    if (businessId) {
        // 1. Supplier count
        const { count: supCnt, error: supErr } = await supabase
            .from('suppliers')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
        if (!supErr && typeof supCnt === 'number') supplierCount = supCnt

        // 2. Branch count
        const { count: brCnt, error: brErr } = await supabase
            .from('branches')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
        if (!brErr && typeof brCnt === 'number') branchCount = brCnt

        // 3. Product count
        const { count: prodCnt, error: prodErr } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
        if (!prodErr && typeof prodCnt === 'number') productCount = prodCnt

        // 4. Raw Material count
        const { count: rmCnt, error: rmErr } = await supabase
            .from('raw_materials')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
        if (!rmErr && typeof rmCnt === 'number') rawMaterialCount = rmCnt

        // 5. Customer count
        const { count: custCnt, error: custErr } = await supabase
            .from('customers')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
        if (!custErr && typeof custCnt === 'number') customerCount = custCnt

        // 6. Employee count (filtered if specific branch selected)
        let empQuery = supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
            .eq('role', 'pegawai')
        if (activeBranchId && activeBranchId !== 'all') {
            empQuery = empQuery.eq('branch_id', activeBranchId)
        }
        const { count: empCnt, error: empErr } = await empQuery
        if (!empErr && typeof empCnt === 'number') employeeCount = empCnt

        // 7. Sales transaction count (filtered if specific branch selected)
        let sQuery = supabase
            .from('sales')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
        if (activeBranchId && activeBranchId !== 'all') {
            sQuery = sQuery.eq('branch_id', activeBranchId)
        }
        const { count: sCnt, error: sErr } = await sQuery
        if (!sErr && typeof sCnt === 'number') salesCount = sCnt
    }

    const cards = [
        {
            title: 'Data Supplier',
            href: '/dashboard/bahan-baku?tab=supplier',
            countBadge: `${supplierCount} Pemasok`,
            badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
            hoverBorder: 'hover:border-emerald-500 hover:shadow-emerald-500/10',
            arrowHover: 'group-hover:text-emerald-600',
            iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white',
            description: 'Master kontak vendor bahan baku, alamat, nomor rekening, dan riwayat pasokan.',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
            ),
        },
        {
            title: 'Data Cabang',
            href: '/dashboard/cabang',
            countBadge: `${branchCount} Cabang`,
            badgeStyle: 'bg-sky-50 text-sky-700 border-sky-200/60',
            hoverBorder: 'hover:border-sky-500 hover:shadow-sky-500/10',
            arrowHover: 'group-hover:text-sky-600',
            iconBg: 'bg-sky-50 text-sky-600 border-sky-100 group-hover:bg-sky-600 group-hover:text-white',
            description: 'Daftar outlet kasir toko, alamat operasional, dan pemisahan stok inventaris.',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
            ),
        },
        {
            title: 'Produk dan Bahan',
            href: '/dashboard/produk',
            countBadge: `${productCount} Produk • ${rawMaterialCount} Bahan`,
            badgeStyle: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
            hoverBorder: 'hover:border-indigo-500 hover:shadow-indigo-500/10',
            arrowHover: 'group-hover:text-indigo-600',
            iconBg: 'bg-indigo-50 text-indigo-600 border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white',
            description: 'Katalog jualan kasir, multi-satuan, HPP, serta stok bahan baku mentah dan kartu mutasi.',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
            ),
        },
        {
            title: 'Data Pelanggan',
            href: '/dashboard/pelanggan',
            countBadge: customerCount > 0 ? `${customerCount} Pelanggan` : 'Kontak Pelanggan',
            badgeStyle: 'bg-rose-50 text-rose-700 border-rose-200/60',
            hoverBorder: 'hover:border-rose-500 hover:shadow-rose-500/10',
            arrowHover: 'group-hover:text-rose-600',
            iconBg: 'bg-rose-50 text-rose-600 border-rose-100 group-hover:bg-rose-600 group-hover:text-white',
            description: 'Direktori pembeli toko, kontak WhatsApp promosi, dan riwayat pesanan pelanggan.',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            ),
        },
        {
            title: 'SDM / Karyawan',
            href: '/dashboard/pegawai',
            countBadge: `${employeeCount} Karyawan`,
            badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200/60',
            hoverBorder: 'hover:border-amber-500 hover:shadow-amber-500/10',
            arrowHover: 'group-hover:text-amber-600',
            iconBg: 'bg-amber-50 text-amber-600 border-amber-100 group-hover:bg-amber-600 group-hover:text-white',
            description: 'Manajemen akun staf kasir, penugasan cabang outlet, dan wewenang akses kasir.',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
            ),
        },
        {
            title: 'Keuangan',
            href: '/dashboard/keuangan',
            countBadge: `${salesCount} Transaksi`,
            badgeStyle: 'bg-teal-50 text-teal-700 border-teal-200/60',
            hoverBorder: 'hover:border-teal-500 hover:shadow-teal-500/10',
            arrowHover: 'group-hover:text-teal-600',
            iconBg: 'bg-teal-50 text-teal-600 border-teal-100 group-hover:bg-teal-600 group-hover:text-white',
            description: 'Laba rugi usaha akrual, arus kas kasir, rekapitulasi harian, dan ekspor pembukuan.',
            icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
        },
    ]

    return (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
                    <span>Pusat Data</span>
                    <span>•</span>
                    <span className="text-slate-500">{businessName}</span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md normal-case">
                        <svg className="w-3.5 h-3.5 text-sky-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <span>{activeBranch ? `Cabang ${activeBranch.name}` : 'Semua Cabang (Konsolidasi)'}</span>
                    </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                    Data Bisnis
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
                    Pusat pengelolaan master data usaha untuk {activeBranch ? `Cabang ${activeBranch.name}` : 'seluruh cabang bisnis Anda'}. Klik kartu untuk membuka dan mengelola data.
                </p>
            </div>

            {/* Grid 6 Clickable Clean UI-Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                {cards.map((card) => (
                    <Link
                        key={card.title}
                        href={card.href}
                        className={`group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs hover:shadow-lg ${card.hoverBorder} hover:-translate-y-1 transition-all duration-200 cursor-pointer`}
                    >
                        <div>
                            {/* Top row: Icon + Count Badge + Click Cue */}
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

                            {/* Card Title */}
                            <h2 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                {card.title}
                            </h2>

                            {/* Card Description */}
                            <p className="mt-2 text-xs sm:text-sm text-slate-500 leading-relaxed">
                                {card.description}
                            </p>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}
