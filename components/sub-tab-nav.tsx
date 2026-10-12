'use client'

import Link from 'next/link'

export interface SubTabItem {
    href: string
    label: string
    icon?: React.ReactNode
    active: boolean
    badge?: string | number
}

interface SubTabNavProps {
    items: SubTabItem[]
    className?: string
}

export default function SubTabNav({ items, className = '' }: SubTabNavProps) {
    return (
        <div className={`mb-6 flex w-full sm:w-auto ${className}`}>
            <div className="flex w-full sm:w-auto items-center p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 shadow-2xs gap-1">
                {items.map((tab, idx) => {
                    return (
                        <Link
                            key={idx}
                            href={tab.href}
                            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs sm:text-sm transition-all duration-150 ${
                                tab.active
                                    ? 'bg-white text-blue-600 font-bold shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-medium'
                            }`}
                        >
                            {tab.icon && (
                                <span className={tab.active ? 'text-blue-600' : 'text-slate-400'}>
                                    {tab.icon}
                                </span>
                            )}
                            <span>{tab.label}</span>
                            {tab.badge !== undefined && (
                                <span
                                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                        tab.active
                                            ? 'bg-blue-100 text-blue-700'
                                            : 'bg-slate-200 text-slate-600'
                                    }`}
                                >
                                    {tab.badge}
                                </span>
                            )}
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}
