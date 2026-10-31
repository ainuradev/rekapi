'use client'

export default function PrintButton({ label = 'Cetak / Simpan PDF' }: { label?: string }) {
    return (
        <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition cursor-pointer print:hidden"
        >
            <span>🖨️</span>
            <span>{label}</span>
        </button>
    )
}
