'use client'

import { useState } from 'react'
import { BRAND_CONTACT, getWhatsAppUrl } from '@/lib/brand-contact'

const QUICK_TOPICS = [
    {
        label: 'Tanya Fitur & Demo Aplikasi',
        message:
            'Halo CS Rekapi, saya ingin bertanya seputar fitur Kasir POS, Pembukuan Keuangan, dan panduan demo aplikasi Rekapi.',
    },
    {
        label: 'Konsultasi Paket Langganan UMKM',
        message:
            'Halo CS Rekapi, saya ingin berkonsultasi mengenai pilihan Paket Langganan (Standard / Business / Pro) yang sesuai untuk bisnis saya.',
    },
    {
        label: 'Konfirmasi Pembayaran Manual',
        message:
            'Halo CS Rekapi, saya membutuhkan bantuan terkait konfirmasi pembayaran / aktivasi paket langganan Rekapi.',
    },
] as const

export function WhatsAppIcon({ className = 'w-5 h-5' }: { className?: string }) {
    return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
        </svg>
    )
}

export default function WhatsAppCSWidget() {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end font-sans">
            {/* Pop-up Card Customer Service */}
            {isOpen && (
                <div className="w-80 sm:w-88 max-w-[calc(100vw-2.5rem)] rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden mb-3">
                    {/* Header */}
                    <div className="bg-[#065F46] text-white px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                                <WhatsAppIcon className="w-5 h-5 text-white" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <h3 className="text-xs sm:text-sm font-semibold text-white truncate">
                                        Customer Service {BRAND_CONTACT.brandName}
                                    </h3>
                                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                </div>
                                <p className="text-[11px] text-emerald-100 truncate">
                                    Biasanya membalas dalam beberapa menit
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            aria-label="Tutup popup Customer Service"
                            className="p-1 rounded-lg text-emerald-100 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-3.5 bg-slate-50/70 space-y-2.5">
                        <div className="rounded-lg bg-white border border-slate-200/80 p-3 text-xs text-slate-700 leading-relaxed shadow-2xs">
                            Halo! Ada yang ingin ditanyakan seputar fitur kasir POS, pembukuan, atau paket langganan Rekapi?
                        </div>

                        <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold text-slate-500 px-0.5">
                                Pilih topik pertanyaan cepat:
                            </p>
                            {QUICK_TOPICS.map((topic) => (
                                <a
                                    key={topic.label}
                                    href={getWhatsAppUrl(topic.message)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setIsOpen(false)}
                                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-emerald-600 hover:bg-emerald-50/40 text-xs font-medium text-slate-800 hover:text-emerald-900 transition"
                                >
                                    <span>{topic.label}</span>
                                    <svg className="w-3.5 h-3.5 text-emerald-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-3 bg-white border-t border-slate-200">
                        <a
                            href={getWhatsAppUrl()}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setIsOpen(false)}
                            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#065F46] hover:bg-emerald-900 text-white text-xs font-semibold shadow-xs transition"
                        >
                            <WhatsAppIcon className="w-4 h-4" />
                            <span>Hubungi via WhatsApp Sekarang</span>
                        </a>
                        <p className="text-[10px] text-center text-slate-400 mt-1.5">
                            WhatsApp Resmi: {BRAND_CONTACT.whatsappDisplay}
                        </p>
                    </div>
                </div>
            )}

            {/* Floating Trigger Button */}
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                aria-label="Chat CS Rekapi via WhatsApp"
                className="bg-[#065F46] hover:bg-emerald-900 text-white shadow-lg border border-emerald-700/50 rounded-full p-3 sm:px-4 sm:py-2.5 flex items-center gap-2.5 transition-all cursor-pointer"
            >
                <div className="relative flex items-center justify-center">
                    <WhatsAppIcon className="w-5 h-5 text-white" />
                    <span
                        title="Online"
                        className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#065F46]"
                    />
                </div>
                <span className="hidden sm:inline text-xs font-semibold tracking-tight">
                    Chat CS Rekapi
                </span>
            </button>
        </div>
    )
}

