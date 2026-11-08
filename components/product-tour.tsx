'use client'

import { useState, useEffect, useCallback } from 'react'

export interface TourStep {
    target: string
    title: string
    description: string
    inSidebar?: boolean
}

export const OWNER_TOUR_STEPS: TourStep[] = [
    {
        target: 'dashboard-stats',
        title: 'Ringkasan Performa Bisnis',
        description:
            'Pantau omzet penjualan, laba bersih, total transaksi, dan peringatan stok menipis secara real-time.',
        inSidebar: false,
    },
    {
        target: 'branch-selector',
        title: 'Cabang Utama & Mode Konsolidasi',
        description:
            'Bisnis Anda otomatis memiliki Cabang Utama (Pusat). Gunakan pemilih ini untuk memfilter data per cabang atau melihat gabungan di Semua Cabang (Konsolidasi).',
        inSidebar: false,
    },
    {
        target: 'nav-stok',
        title: '1. Mulai dari Katalog Produk & Bahan',
        description:
            'Langkah pertama: tambahkan menu/produk jualan Anda beserta harga jual, HPP, dan stok awal di menu ini.',
        inSidebar: true,
    },
    {
        target: 'nav-kasir',
        title: '2. Operasikan Kasir POS',
        description:
            'Catat pesanan pelanggan (Tunai, QRIS, Transfer, atau Kasbon), pilih channel penjualan, dan cetak struk Bluetooth/PDF/WhatsApp.',
        inSidebar: true,
    },
    {
        target: 'nav-keuangan',
        title: '3. Pembukuan & Laporan Otomatis',
        description:
            'Seluruh uang masuk kasir, pencatatan beban, utang-piutang, hingga laporan Laba Rugi dan Neraca SAK EMKM tersusun otomatis di sini.',
        inSidebar: true,
    },
    {
        target: 'nav-cabang-pegawai',
        title: '4. Kelola Cabang & Akun Kasir',
        description:
            'Buat akun login khusus untuk staf kasir di cabang Anda agar operasional kasir tetap aman tanpa menampilkan laporan laba bersih pemilik.',
        inSidebar: true,
    },
]

export const PEGAWAI_TOUR_STEPS: TourStep[] = [
    {
        target: 'dashboard-stats',
        title: 'Ringkasan Kasir Cabang',
        description:
            'Pantau penjualan tunai dan jumlah pesanan di cabang penugasan Anda hari ini.',
        inSidebar: false,
    },
    {
        target: 'nav-kasir',
        title: 'Buka Kasir POS',
        description:
            'Gunakan menu ini untuk menginput pesanan pelanggan, menghitung kembalian, dan mencetak struk.',
        inSidebar: true,
    },
    {
        target: 'nav-riwayat',
        title: 'Riwayat Transaksi Cabang',
        description:
            'Cek ulang daftar struk penjualan yang telah diproses di cabang Anda.',
        inSidebar: true,
    },
]

export function getProductTourStorageKey(userId?: string | null): string {
    return `rekapi_product_tour_v1_${userId || 'guest'}`
}

interface TargetRect {
    top: number
    left: number
    width: number
    height: number
    bottom: number
    right: number
}

interface ViewportSize {
    width: number
    height: number
}

interface ProductTourProps {
    userId?: string | null
    isOwner: boolean
    isOpen: boolean
    currentStep: number
    onStepChange: (nextStep: number) => void
    onClose: () => void
    onOpen: () => void
    onToggleMobileDrawer?: (open: boolean) => void
    isDashboardHome: boolean
}

export default function ProductTour({
    userId,
    isOwner,
    isOpen,
    currentStep,
    onStepChange,
    onClose,
    onOpen,
    onToggleMobileDrawer,
    isDashboardHome,
}: ProductTourProps) {
    const steps = isOwner ? OWNER_TOUR_STEPS : PEGAWAI_TOUR_STEPS
    const activeStep = steps[currentStep] || steps[0]

    const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
    const [viewport, setViewport] = useState<ViewportSize>({ width: 1280, height: 800 })

    // Auto-start 500ms saat pengguna baru pertama kali masuk ke /dashboard
    useEffect(() => {
        if (!isDashboardHome || !userId) return
        const storageKey = getProductTourStorageKey(userId)
        try {
            const seen = window.localStorage.getItem(storageKey)
            if (seen) return
        } catch {
            return
        }

        const timer = window.setTimeout(() => {
            onOpen()
        }, 500)

        return () => window.clearTimeout(timer)
    }, [isDashboardHome, userId, onOpen])

    // Temukan elemen yang sedang terlihat di layar untuk atribut data-tour aktif
    const measureTarget = useCallback(() => {
        if (typeof window === 'undefined' || !isOpen || !activeStep) return

        const vw = window.innerWidth
        const vh = window.innerHeight
        setViewport({ width: vw, height: vh })

        const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${activeStep.target}"]`)
        let visibleEl: HTMLElement | null = null

        for (let i = 0; i < candidates.length; i++) {
            const el = candidates[i]
            const rect = el.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
                visibleEl = el
                break
            }
        }

        if (!visibleEl) {
            setTargetRect(null)
            return
        }

        const r = visibleEl.getBoundingClientRect()
        setTargetRect({
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
            bottom: r.bottom,
            right: r.right,
        })
    }, [isOpen, activeStep])

    // Otomatis buka/tutup drawer mobile (< 640px) jika langkah berada di sidebar, lalu ukur posisi elemen
    useEffect(() => {
        if (!isOpen || !activeStep || typeof window === 'undefined') return

        const isMobile = window.innerWidth < 640
        if (isMobile && onToggleMobileDrawer) {
            onToggleMobileDrawer(Boolean(activeStep.inSidebar))
        }

        // Scroll ke elemen jika bukan di sidebar agar masuk ke viewport
        const syncDelay = isMobile && activeStep.inSidebar ? 220 : 60
        const timer = window.setTimeout(() => {
            const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${activeStep.target}"]`)
            for (let i = 0; i < candidates.length; i++) {
                const el = candidates[i]
                const r = el.getBoundingClientRect()
                if (r.width > 0 && r.height > 0) {
                    if (!activeStep.inSidebar && (r.top < 64 || r.bottom > window.innerHeight - 80)) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }
                    break
                }
            }
            measureTarget()
        }, syncDelay)

        const timerFollowUp = window.setTimeout(() => {
            measureTarget()
        }, syncDelay + 200)

        const handleResizeOrScroll = () => {
            window.requestAnimationFrame(() => {
                measureTarget()
            })
        }

        window.addEventListener('resize', handleResizeOrScroll)
        window.addEventListener('scroll', handleResizeOrScroll, true)

        return () => {
            window.clearTimeout(timer)
            window.clearTimeout(timerFollowUp)
            window.removeEventListener('resize', handleResizeOrScroll)
            window.removeEventListener('scroll', handleResizeOrScroll, true)
        }
    }, [isOpen, currentStep, activeStep, measureTarget, onToggleMobileDrawer])

    if (!isOpen || !activeStep) return null

    const markTourCompletedAndClose = () => {
        if (typeof window !== 'undefined' && userId) {
            try {
                window.localStorage.setItem(getProductTourStorageKey(userId), 'completed')
            } catch {
                // Abaikan jika storage penuh
            }
        }
        if (onToggleMobileDrawer) {
            onToggleMobileDrawer(false)
        }
        onClose()
    }

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            onStepChange(currentStep + 1)
        } else {
            markTourCompletedAndClose()
        }
    }

    const handlePrev = () => {
        if (currentStep > 0) {
            onStepChange(currentStep - 1)
        }
    }

    const totalSteps = steps.length
    const progressPct = Math.round(((currentStep + 1) / totalSteps) * 100)
    const isLastStep = currentStep === totalSteps - 1
    const isMobileViewport = viewport.width < 640

    // Padding di sekeliling cutout sorotan
    const pad = 6
    const cutoutStyle: React.CSSProperties | null = targetRect
        ? {
              top: Math.max(4, targetRect.top - pad),
              left: Math.max(4, targetRect.left - pad),
              width: Math.min(viewport.width - 8, targetRect.width + pad * 2),
              height: targetRect.height + pad * 2,
              boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.60)',
          }
        : null

    // Hitung posisi kartu Popover agar aman di layar Desktop maupun Mobile (360px-375px)
    const getPopoverStyle = (): React.CSSProperties => {
        const cardEstimatedHeight = 225

        if (isMobileViewport || !targetRect) {
            if (!targetRect) {
                return {
                    left: 12,
                    right: 12,
                    bottom: 20,
                }
            }

            // Jika langkah menyorot menu di mobile drawer atau berada di paruh atas layar,
            // letakkan kartu popover di bawah elemen atau di bagian bawah layar agar tidak menutupi sorotan
            const spaceBelow = viewport.height - targetRect.bottom
            if (spaceBelow >= cardEstimatedHeight + 20) {
                return {
                    left: 12,
                    right: 12,
                    top: Math.max(12, targetRect.bottom + 14),
                }
            }

            const spaceAbove = targetRect.top
            if (spaceAbove >= cardEstimatedHeight + 20) {
                return {
                    left: 12,
                    right: 12,
                    top: Math.max(12, targetRect.top - cardEstimatedHeight - 12),
                }
            }

            return {
                left: 12,
                right: 12,
                bottom: 16,
            }
        }

        // Layar Desktop (>= 640px)
        const cardWidth = 350

        if (activeStep.inSidebar) {
            const leftPos = Math.min(viewport.width - cardWidth - 16, targetRect.right + 18)
            const topPos = Math.min(
                viewport.height - cardEstimatedHeight - 16,
                Math.max(16, targetRect.top - 8)
            )
            return {
                width: cardWidth,
                left: leftPos,
                top: topPos,
            }
        }

        // Elemen di area utama atau header
        const preferBelow = targetRect.bottom + cardEstimatedHeight + 20 <= viewport.height
        const topPos = preferBelow
            ? targetRect.bottom + 14
            : Math.max(16, targetRect.top - cardEstimatedHeight - 14)
        const leftPos = Math.min(
            viewport.width - cardWidth - 16,
            Math.max(16, targetRect.left)
        )

        return {
            width: cardWidth,
            left: leftPos,
            top: topPos,
        }
    }

    return (
        <div
            className="fixed inset-0 z-[70] select-none"
            role="dialog"
            aria-modal="true"
            aria-label="Panduan Aplikasi Rekapi"
        >
            {/* Backdrop penahan klik di luar; jika target belum terukur gunakan bg-slate-900/60 */}
            <div
                className={`fixed inset-0 transition-opacity duration-300 ${
                    cutoutStyle ? 'bg-transparent' : 'bg-slate-900/60'
                }`}
                onClick={markTourCompletedAndClose}
            />

            {/* Cutout Sorotan Terang di Sekeliling Target */}
            {cutoutStyle && (
                <div
                    style={cutoutStyle}
                    className="fixed z-[71] pointer-events-none ring-4 ring-emerald-500/80 rounded-xl transition-all duration-300"
                />
            )}

            {/* Kartu Popover Panduan (Clean Sheet Emerald) */}
            <div
                style={getPopoverStyle()}
                className="fixed z-[72] max-w-[calc(100vw-24px)] sm:max-w-sm rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden transition-all duration-300"
            >
                {/* Progress Bar Tipis di Atas */}
                <div className="w-full h-1 bg-slate-100">
                    <div
                        className="h-full bg-emerald-700 transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>

                <div className="p-4 space-y-3">
                    {/* Baris Indikator Langkah & Tombol Lewati */}
                    <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                            Langkah {currentStep + 1} dari {totalSteps}
                        </span>
                        <button
                            type="button"
                            onClick={markTourCompletedAndClose}
                            className="text-xs font-medium text-slate-400 hover:text-slate-700 transition cursor-pointer"
                        >
                            Lewati
                        </button>
                    </div>

                    {/* Judul & Penjelasan Singkat */}
                    <div className="space-y-1">
                        <h3 className="text-sm sm:text-base font-semibold text-slate-900 leading-snug">
                            {activeStep.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                            {activeStep.description}
                        </p>
                    </div>

                    {/* Footer Navigasi Langkah */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                        <div>
                            {currentStep > 0 ? (
                                <button
                                    type="button"
                                    onClick={handlePrev}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                                >
                                    Kembali
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={markTourCompletedAndClose}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition cursor-pointer"
                                >
                                    Tutup
                                </button>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={handleNext}
                            className="px-4 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                        >
                            {isLastStep ? 'Selesai & Mulai' : 'Lanjut'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

