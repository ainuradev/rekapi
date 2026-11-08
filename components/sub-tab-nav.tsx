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
        <div className={`mb-4 sm:mb-6 w-full max-w-full overflow-x-auto no-scrollbar py-0.5 ${className}`}>
            <div className="inline-flex sm:flex w-auto sm:w-full items-center p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 shadow-2xs gap-1 min-w-max sm:min-w-0">
                {items.map((tab, idx) => {
                    return (
                        <Link
                            key={idx}
                            href={tab.href}
                            className={`shrink-0 sm:shrink sm:flex-1 flex items-center justify-center gap-1 sm:gap-2 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm whitespace-nowrap transition-all duration-150 ${
                                tab.active
                                    ? 'bg-white text-emerald-800 font-bold shadow-xs border border-slate-200/60'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-medium'
                            }`}
                        >
                            {tab.icon && (
                                <span className={tab.active ? 'text-emerald-800' : 'text-slate-400'}>
                                    {tab.icon}
                                </span>
                            )}
                            <span>{tab.label}</span>
                            {tab.badge !== undefined && (
                                <span
                                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                        tab.active
                                            ? 'bg-emerald-100 text-emerald-800'
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
