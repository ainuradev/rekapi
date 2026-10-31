export interface InvoiceItem {
    name: string
    quantity: number
    price: number
    subtotal: number
}

export interface InvoiceData {
    invoiceNumber: string
    date: string
    businessName: string
    branchName?: string
    address?: string
    phone?: string
    logoUrl?: string
    items: InvoiceItem[]
    subtotal: number
    tax?: number
    discount?: number
    total: number
    paymentMethod?: string
    cashierName?: string
    cashReceived?: number
    change?: number
    customerName?: string
    tableNumber?: string
    notes?: string
}

export function formatCurrencyIDR(val: number): string {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(val)
}

export function formatDateTimeID(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleString('id-ID', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}
