/**
 * Utility modul tanggal & zona waktu Indonesia (WIB - Asia/Jakarta, UTC+07:00).
 * Menjamin seluruh pencatatan transaksi, rekap laba rugi, dan pengeluaran
 * konsisten menggunakan kalender & jam Indonesia.
 */

export const TIMEZONE_INDONESIA = 'Asia/Jakarta'

/**
 * Mendapatkan string tanggal YYYY-MM-DD sesuai waktu Indonesia (WIB).
 */
export function getIndonesianDate(date: Date = new Date()): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE_INDONESIA,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    })
    return formatter.format(date)
}

export type PeriodType = 'today' | 'week' | 'month'

export interface IndonesianPeriodRange {
    dateFrom: string       // YYYY-MM-DD (untuk kolom DATE seperti expense_date & purchase_date)
    dateTo: string         // YYYY-MM-DD
    timestampFrom: string  // ISO string dengan offset +07:00 (untuk kolom TIMESTAMPTZ seperti transaction_date)
    timestampTo: string    // ISO string dengan offset +07:00
}

/**
 * Menghitung rentang tanggal & timestamp periodik (Hari Ini, Minggu Ini, Bulan Ini)
 * berdasarkan zona waktu Indonesia (Asia/Jakarta).
 */
export function getIndonesianPeriodRange(
    period: PeriodType,
    now: Date = new Date()
): IndonesianPeriodRange {
    const todayStr = getIndonesianDate(now) // e.g. "2026-09-24"
    const [year, month, day] = todayStr.split('-').map(Number)

    if (period === 'today') {
        return {
            dateFrom: todayStr,
            dateTo: todayStr,
            timestampFrom: `${todayStr}T00:00:00+07:00`,
            timestampTo: `${todayStr}T23:59:59.999+07:00`,
        }
    }

    if (period === 'week') {
        // Hitung Senin sampai Minggu dari kalender Indonesia
        const currentCal = new Date(Date.UTC(year, month - 1, day))
        const dayOfWeek = currentCal.getUTCDay() // 0=Minggu, 1=Senin, ..., 6=Sabtu
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
        const diffToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek

        const mondayCal = new Date(Date.UTC(year, month - 1, day + diffToMonday))
        const sundayCal = new Date(Date.UTC(year, month - 1, day + diffToSunday))

        const dateFrom = mondayCal.toISOString().slice(0, 10)
        const dateTo = sundayCal.toISOString().slice(0, 10)

        return {
            dateFrom,
            dateTo,
            timestampFrom: `${dateFrom}T00:00:00+07:00`,
            timestampTo: `${dateTo}T23:59:59.999+07:00`,
        }
    }

    // month: Awal bulan (tanggal 1) sampai akhir bulan
    const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDayCal = new Date(Date.UTC(year, month, 0)) // hari terakhir bulan berjalan
    const dateTo = lastDayCal.toISOString().slice(0, 10)

    return {
        dateFrom,
        dateTo,
        timestampFrom: `${dateFrom}T00:00:00+07:00`,
        timestampTo: `${dateTo}T23:59:59.999+07:00`,
    }
}

/**
 * Format tampilan tanggal bahasa Indonesia (WIB).
 */
export function formatIndonesianDate(
    dateInput: string | Date,
    options: Intl.DateTimeFormatOptions = {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    }
): string {
    let d: Date
    if (typeof dateInput === 'string') {
        // Jika hanya YYYY-MM-DD, parse ke siang hari WIB agar tidak bergeser hari
        d = dateInput.includes('T')
            ? new Date(dateInput)
            : new Date(`${dateInput}T12:00:00+07:00`)
    } else {
        d = dateInput
    }

    return d.toLocaleDateString('id-ID', {
        timeZone: TIMEZONE_INDONESIA,
        ...options,
    })
}

/**
 * Format tanggal & jam bahasa Indonesia (WIB).
 */
export function formatIndonesianDateTime(dateInput: string | Date): string {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
    return (
        d.toLocaleDateString('id-ID', {
            timeZone: TIMEZONE_INDONESIA,
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        }) +
        ', ' +
        d.toLocaleTimeString('id-ID', {
            timeZone: TIMEZONE_INDONESIA,
            hour: '2-digit',
            minute: '2-digit',
        }) +
        ' WIB'
    )
}
