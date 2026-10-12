export default function DashboardLoading() {
    return (
        <div className="space-y-6 animate-pulse">
            {/* Header skeleton */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
                <div className="space-y-2">
                    <div className="h-7 w-48 bg-slate-200 rounded-xl" />
                    <div className="h-4 w-72 bg-slate-100 rounded-lg" />
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-9 w-28 bg-slate-200 rounded-xl" />
                    <div className="h-9 w-24 bg-slate-200 rounded-xl" />
                </div>
            </div>

            {/* Quick Metrics skeleton cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="h-3 w-20 bg-slate-200 rounded-md" />
                            <div className="w-8 h-8 rounded-xl bg-slate-100" />
                        </div>
                        <div className="h-6 w-32 bg-slate-300 rounded-lg" />
                        <div className="h-2.5 w-16 bg-slate-100 rounded-md" />
                    </div>
                ))}
            </div>

            {/* Main content placeholder / table skeleton */}
            <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="h-5 w-36 bg-slate-200 rounded-lg" />
                    <div className="h-4 w-20 bg-slate-100 rounded-md" />
                </div>
                <div className="space-y-3 pt-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-100" />
                                <div className="space-y-1.5">
                                    <div className="h-4 w-40 bg-slate-200 rounded-md" />
                                    <div className="h-3 w-24 bg-slate-100 rounded-md" />
                                </div>
                            </div>
                            <div className="space-y-1 text-right">
                                <div className="h-4 w-20 bg-slate-200 rounded-md ml-auto" />
                                <div className="h-3 w-12 bg-slate-100 rounded-md ml-auto" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
