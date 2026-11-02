import Link from 'next/link'
import type { GatedModule } from '@/lib/subscription-access'

interface PlanFeatureGateProps {
    module: GatedModule
    currentPlanName?: string | null
}

interface ModuleGateMeta {
    title: string
    badge: string
    requiredPlan: 'Business' | 'Pro'
    badgeStyle: string
    description: string
    benefits: string[]
}

const MODULE_META: Record<GatedModule, ModuleGateMeta> = {
    raw_materials: {
        title: 'Manajemen Bahan Baku & Belanja Supplier',
        badge: 'Tersedia di Paket Business',
        requiredPlan: 'Business',
        badgeStyle: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
        description:
            'Pantau stok bahan mentah, catat histori belanja dari supplier, dan cegah kekurangan bahan produksi pada setiap cabang usaha Anda.',
        benefits: [
            'Pencatatan persediaan bahan baku & peringatan stok menipis (low-stock alert)',
            'Histori transaksi belanja pasokan & perubahan harga beli supplier',
            'Buku data kontak rekanan supplier dan katalog belanja resmi',
            'Mutasi penyesuaian stok bahan (stock opname, bahan rusak, dan susut)',
        ],
    },
    cash_accounts: {
        title: 'Buku Kas & Multi-Rekening Bank',
        badge: 'Tersedia di Paket Business',
        requiredPlan: 'Business',
        badgeStyle: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
        description:
            'Kelola kas fisik kasir harian, rekening operasional bank (BCA, Mandiri, BRI), dan pantau setoran tunai antar-cabang secara akurat.',
        benefits: [
            'Pemisahan saldo kas kecil kasir fisik dengan rekening bank usaha',
            'Pencatatan setoran kasir harian langsung ke rekening bank utama',
            'Mutasi transfer internal antar-kas dan rekening tanpa selisih pembukuan',
            'Riwayat transaksi keuangan dan audit saldo riil per cabang usaha',
        ],
    },
    debts_receivables: {
        title: 'Buku Utang Supplier & Piutang Pelanggan',
        badge: 'Tersedia di Paket Business',
        requiredPlan: 'Business',
        badgeStyle: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
        description:
            'Kendalikan komitmen jatuh tempo pembayaran tagihan supplier dan piutang kasbon pelanggan tempo secara rapi dan transparan.',
        benefits: [
            'Pencatatan utang pembelian tempo ke supplier beserta tanggal jatuh tempo',
            'Pencatatan piutang kasbon pelanggan dari transaksi kasir tempo',
            'Peringatan otomatis untuk tagihan mendekati dan melewati batas waktu',
            'Histori pencatatan cicilan pelunasan bertahap yang akurat',
        ],
    },
    capital_equity: {
        title: 'Modal Usaha & Ekuitas Pemilik',
        badge: 'Tersedia di Paket Pro',
        requiredPlan: 'Pro',
        badgeStyle: 'bg-amber-50 text-amber-800 border-amber-200/80',
        description:
            'Pisahkan keuangan pribadi dan perusahaan secara profesional dengan pembukuan modal awal, penambahan investasi, dan penarikan prive.',
        benefits: [
            'Pencatatan setoran modal awal pendirian dan penambahan investasi modal pemilik',
            'Pencatatan prive (penarikan dana pribadi pemilik usaha) yang transparan',
            'Pelacakan akumulasi saldo modal bersih bisnis dari waktu ke waktu',
            'Kepatuhan pembukuan standar akuntansi untuk proteksi aset bisnis',
        ],
    },
    cash_flow_report: {
        title: 'Laporan Arus Kas (3 Aktivitas SAK EMKM)',
        badge: 'Tersedia di Paket Pro',
        requiredPlan: 'Pro',
        badgeStyle: 'bg-amber-50 text-amber-800 border-amber-200/80',
        description:
            'Ketahui secara presisi ke mana setiap rupiah kas mengalir melalui klasifikasi standar operasional, investasi, dan pendanaan.',
        benefits: [
            'Arus kas dari aktivitas operasi (penerimaan kasir & pengeluaran beban usaha)',
            'Arus kas dari aktivitas investasi (pembelian dan penjualan aset operasional)',
            'Arus kas dari aktivitas pendanaan (setoran modal, pinjaman, dan prive)',
            'Rekonsiliasi kenaikan/penurunan kas bersih periode berjalan',
        ],
    },
    balance_sheet: {
        title: 'Laporan Posisi Keuangan (Neraca SAK EMKM)',
        badge: 'Tersedia di Paket Pro',
        requiredPlan: 'Pro',
        badgeStyle: 'bg-amber-50 text-amber-800 border-amber-200/80',
        description:
            'Sajikan posisi aset, liabilitas utang, dan ekuitas modal seimbang sesuai Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah.',
        benefits: [
            'Penyajian total aset lancar (kas riil, piutang usaha, persediaan barang) & aset tetap',
            'Penyajian total liabilitas jangka pendek (utang usaha supplier)',
            'Penyajian ekuitas pemilik (modal disetor + saldo laba ditahan usaha)',
            'Validasi keseimbangan neraca (Aset = Liabilitas + Ekuitas) siap audit dan perbankan',
        ],
    },
}

export default function PlanFeatureGate({
    module,
    currentPlanName,
}: PlanFeatureGateProps) {
    const meta = MODULE_META[module]
    const effectivePlanName = currentPlanName || 'Standard'

    return (
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 shadow-xs">
                {/* Header Badge & Title */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-slate-100">
                    <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${meta.badgeStyle}`}
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {meta.badge}
                    </span>

                    <span className="text-xs text-slate-500">
                        Paket Anda saat ini:{' '}
                        <strong className="text-slate-800 font-bold">{effectivePlanName}</strong>
                    </span>
                </div>

                <div className="mt-6">
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                        {meta.title}
                    </h2>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                        {meta.description}
                    </p>
                </div>

                {/* Key Benefits List */}
                <div className="mt-8 rounded-xl bg-slate-50/80 border border-slate-100 p-5 sm:p-6">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
                        Manfaat Utama Modul Ini:
                    </h3>
                    <ul className="space-y-3">
                        {meta.benefits.map((benefit, idx) => (
                            <li key={idx} className="flex items-start gap-3 text-xs sm:text-sm text-slate-700">
                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 mt-0.5">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2.5}
                                            d="M5 13l4 4L19 7"
                                        />
                                    </svg>
                                </div>
                                <span className="leading-snug">{benefit}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Actions */}
                <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition order-2 sm:order-1 text-center"
                    >
                        ← Kembali ke Dashboard
                    </Link>

                    <Link
                        href="/dashboard/subscription"
                        className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-xs transition order-1 sm:order-2 text-center"
                    >
                        <span>Upgrade ke Paket {meta.requiredPlan}</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M14 5l7 7m0 0l-7 7m7-7H3"
                            />
                        </svg>
                    </Link>
                </div>
            </div>
        </div>
    )
}

