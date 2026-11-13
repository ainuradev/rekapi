'use client'

import { useState, useMemo, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { createSale } from './actions'
import InvoiceModal, { InvoiceData } from '@/components/invoice-modal'
import {
    formatInsufficientStockError,
    resolveBranchProductStock,
    validateSaleStockAvailability,
} from '@/lib/sale-stock-integrity'

type Product = {
    id: string
    name: string
    selling_price: number
    cost_price: number
    stock: number
    unit?: string
    image_url?: string | null
    category?: 'makanan' | 'minuman' | 'lainnya' | string | null
}

type Branch = {
    id: string
    name: string
    address?: string | null
    phone?: string | null
}

type CartLine = {
    product_id: string
    name: string
    quantity: number
    price: number
    cost_price: number
    unit?: string
    image_url?: string | null
}

function getProductInitials(name: string): string {
    const cleaned = name.trim()
    if (!cleaned) return 'PR'
    const words = cleaned.split(/\s+/).filter(Boolean)
    if (words[0] && words[0].length === 2 && /^[A-Za-z0-9]+$/.test(words[0])) {
        return words[0].toUpperCase()
    }
    if (words.length >= 2) {
        return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase()
    }
    return cleaned.slice(0, 2).toUpperCase()
}

const CHANNELS = ['offline', 'gofood', 'grabfood', 'shopeefood', 'whatsapp', 'qris', 'lainnya']
const PAYMENT_METHODS = ['cash', 'qris', 'transfer', 'lainnya']

type ProductGroup = {
    name: string
    category?: string | null
    variants: Product[]
}

type BranchStock = {
    product_id: string
    branch_id: string
    stock: number
}

type Customer = {
    id: string
    name: string
    phone?: string | null
    receivable_limit?: number
    current_receivable?: number
}

type Account = {
    id: string
    name: string
    type: string
    is_default_cash?: boolean
    is_default_bank?: boolean
}

export default function KasirClient({
    products: initialProducts,
    branches,
    branchStocks = [],
    customers = [],
    accounts = [],
    fixedBranchId,
    businessName,
    businessAddress,
    businessPhone,
    businessLogoUrl,
    businessQrisUrl,
    userName,
}: {
    products: Product[]
    branches: Branch[]
    branchStocks?: BranchStock[]
    customers?: Customer[]
    accounts?: Account[]
    fixedBranchId: string | null
    businessName: string
    businessAddress?: string | null
    businessPhone?: string | null
    businessLogoUrl?: string | null
    businessQrisUrl?: string | null
    userName: string
}) {
    const router = useRouter()
    const [cart, setCart] = useState<Record<string, CartLine>>({})
    const [selectedBranch, setSelectedBranch] = useState(fixedBranchId ?? branches[0]?.id ?? '')
    const [channel, setChannel] = useState('offline')
    const [paymentMethod, setPaymentMethod] = useState('cash')

    // State untuk Pembayaran Tunai & Kembalian
    const [cashReceived, setCashReceived] = useState<number | ''>('')

    // State untuk Catatan / No. Meja
    const [orderNote, setOrderNote] = useState<string>('')

    // State Status Jaringan / Offline Detection (SSR-safe external store)
    const isOnline = useSyncExternalStore(
        (onStoreChange) => {
            window.addEventListener('online', onStoreChange)
            window.addEventListener('offline', onStoreChange)
            return () => {
                window.removeEventListener('online', onStoreChange)
                window.removeEventListener('offline', onStoreChange)
            }
        },
        () => navigator.onLine,
        () => true
    )

    // State untuk Penjualan Kredit / Piutang
    const [isCreditSale, setIsCreditSale] = useState(false)
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
    const [dpAmount, setDpAmount] = useState<number>(0)
    const [dueDate, setDueDate] = useState<string>('')
    const [notes, setNotes] = useState<string>('')
    const defaultCashAccount = accounts.find((a) => a.is_default_cash || a.type === 'cash') || accounts[0]
    const defaultBankAccount = accounts.find((a) => a.is_default_bank || a.type === 'bank' || a.type === 'e_wallet') || accounts[0]

    const [selectedAccountId, setSelectedAccountId] = useState<string>(defaultCashAccount?.id || accounts[0]?.id || '')

    const handlePaymentMethodChange = (newMethod: string) => {
        setPaymentMethod(newMethod)
        const matching = newMethod === 'cash' ? defaultCashAccount : defaultBankAccount
        if (matching) {
            setSelectedAccountId(matching.id)
        }
    }


    // Resolusi stok produk berdasarkan cabang yang sedang dipilih di kasir
    const products = useMemo(() => {
        if (!selectedBranch) {
            return initialProducts
        }
        return initialProducts.map((p) => ({
            ...p,
            stock: resolveBranchProductStock({
                productId: p.id,
                branchId: selectedBranch,
                branchStocks,
                fallbackProductStock: p.stock,
            }),
        }))
    }, [initialProducts, branchStocks, selectedBranch])
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [selectingGroup, setSelectingGroup] = useState<ProductGroup | null>(null)
    const [showInvoice, setShowInvoice] = useState(false)
    const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
    const [showQrisModal, setShowQrisModal] = useState(false)

    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<'semua' | 'makanan' | 'minuman' | 'lainnya'>('semua')
    const [mobileCheckoutOpen, setMobileCheckoutOpen] = useState(false)

    // Mengelompokkan produk berdasarkan nama (case-insensitive) agar produk dengan banyak satuan
    // tampil menjadi satu kartu menu utama di kasir.
    const groupedProducts = useMemo(() => {
        const map = new Map<string, ProductGroup>()
        for (const p of products) {
            const key = p.name.trim().toLowerCase()
            const existing = map.get(key)
            if (existing) {
                existing.variants.push(p)
                if (!existing.category && p.category) {
                    existing.category = p.category
                }
            } else {
                map.set(key, {
                    name: p.name.trim(),
                    category: p.category ?? null,
                    variants: [p],
                })
            }
        }
        return Array.from(map.values())
    }, [products])

    // Filter produk berdasarkan Search dan Category tab
    const filteredGroupedProducts = useMemo(() => {
        return groupedProducts.filter((group) => {
            const nameLower = group.name.toLowerCase()
            const matchesSearch = !searchQuery || nameLower.includes(searchQuery.toLowerCase().trim())
            if (!matchesSearch) return false

            if (selectedCategory === 'semua') return true

            // Jika produk memiliki kategori eksplisit dari database ('makanan' | 'minuman' | 'lainnya')
            if (group.category) {
                const catLower = group.category.toLowerCase().trim()
                if (catLower === selectedCategory) return true
                if (['makanan', 'minuman', 'lainnya'].includes(catLower)) {
                    return false
                }
            }

            // Fallback untuk produk lawas yang belum diisi kategori di database:
            const drinkKeywords = ['es', 'teh', 'kopi', 'jeruk', 'jus', 'drink', 'water', 'mineral', 'boba', 'susu', 'coffee', 'tea']
            const isDrink = drinkKeywords.some((k) => nameLower.includes(k))

            if (selectedCategory === 'minuman') return isDrink
            if (selectedCategory === 'makanan') return !isDrink
            if (selectedCategory === 'lainnya') return false

            return true
        })
    }, [groupedProducts, searchQuery, selectedCategory])

    const total = useMemo(
        () => Object.values(cart).reduce((sum, item) => sum + item.price * item.quantity, 0),
        [cart]
    )

    const currentCashNumber = typeof cashReceived === 'number' ? cashReceived : 0
    const cashChange = Math.max(0, currentCashNumber - total)
    const isCashSufficient = paymentMethod !== 'cash' || isCreditSale || (typeof cashReceived === 'number' && cashReceived >= total)

    const quickCashPresets = useMemo(() => {
        if (total <= 0) return []
        const presets = new Set<number>()
        presets.add(total)

        const roundups = [10000, 20000, 50000, 100000]
        for (const r of roundups) {
            const nextRound = Math.ceil(total / r) * r
            if (nextRound >= total) presets.add(nextRound)
        }

        if (total < 50000) presets.add(50000)
        if (total < 100000) presets.add(100000)

        return Array.from(presets)
            .sort((a, b) => a - b)
            .slice(0, 5)
    }, [total])

    function addToCart(product: Product) {
        const stock = product.stock !== undefined && product.stock !== null ? Number(product.stock) : 0
        const currentQty = cart[product.id]?.quantity ?? 0
        if (currentQty >= stock) {
            setMessage(`Gagal: ${formatInsufficientStockError(product.name, stock)}`)
            return
        }

        setMessage(null)
        setCart((prev) => {
            const existing = prev[product.id]
            const existingQty = existing?.quantity ?? 0
            if (existingQty >= stock) {
                return prev
            }

            // Jika ada lebih dari 1 produk dengan nama yang sama, sertakan satuan di nama item keranjang
            const isMultiVariant = products.filter(
                (p) => p.name.trim().toLowerCase() === product.name.trim().toLowerCase()
            ).length > 1

            const displayName = isMultiVariant
                ? `${product.name} (${product.unit || 'pcs'})`
                : product.name

            return {
                ...prev,
                [product.id]: {
                    product_id: product.id,
                    name: displayName,
                    price: product.selling_price,
                    cost_price: product.cost_price,
                    quantity: existingQty + 1,
                    unit: product.unit || 'pcs',
                    image_url: product.image_url ?? null,
                },
            }
        })
    }

    function removeFromCart(productId: string) {
        setMessage(null)
        setCart((prev) => {
            const next = { ...prev }
            delete next[productId]
            return next
        })
    }

    function changeQty(productId: string, delta: number) {
        const prod = products.find((p) => p.id === productId)
        const stock = prod?.stock !== undefined && prod?.stock !== null ? Number(prod.stock) : 0
        const currentItem = cart[productId]
        if (currentItem && delta > 0 && currentItem.quantity + delta > stock) {
            setMessage(`Gagal: ${formatInsufficientStockError(currentItem.name || prod?.name || 'Produk', stock)}`)
            return
        }

        setMessage(null)
        setCart((prev) => {
            const item = prev[productId]
            if (!item) return prev
            const newQty = item.quantity + delta
            if (delta > 0 && newQty > stock) {
                return prev
            }
            if (newQty <= 0) {
                const next = { ...prev }
                delete next[productId]
                return next
            }
            return { ...prev, [productId]: { ...item, quantity: newQty } }
        })
    }

    const selectedCustomer = useMemo(
        () => customers.find((c) => c.id === selectedCustomerId),
        [customers, selectedCustomerId]
    )

    // Eksekusi checkout transaksi ke server
    async function executeCheckout() {
        if (saving) return // Guard klik ganda di client
        setSaving(true)
        setMessage(null)

        // Buat idempotency key unik untuk request checkout ini
        const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined

        const totalAmount = Object.values(cart).reduce((sum, item) => sum + item.price * item.quantity, 0)
        const finalPaidAmount = isCreditSale ? Math.min(totalAmount, Math.max(0, dpAmount)) : totalAmount
        const finalPaymentStatus: 'unpaid' | 'partial' | 'paid' = isCreditSale
            ? (finalPaidAmount === 0 ? 'unpaid' : (finalPaidAmount < totalAmount ? 'partial' : 'paid'))
            : 'paid'

        // Gabungkan catatan kredit dan catatan pesanan/meja
        const combinedNotes = [notes.trim(), orderNote.trim()].filter(Boolean).join(' • ')

        const result = await createSale({
            branch_id: selectedBranch,
            channel,
            payment_method: isCreditSale && finalPaidAmount === 0 ? 'lainnya' : paymentMethod,
            items: Object.values(cart),
            idempotency_key: idempotencyKey,
            customer_id: isCreditSale ? selectedCustomerId : (selectedCustomerId || undefined),
            payment_status: finalPaymentStatus,
            paid_amount: finalPaidAmount,
            due_date: isCreditSale && dueDate ? dueDate : undefined,
            notes: combinedNotes || undefined,
            account_id: finalPaidAmount > 0 ? (selectedAccountId || undefined) : undefined,
        })

        setSaving(false)
        setShowQrisModal(false)

        if (result.error) {
            setMessage(`Gagal: ${result.error}`)
            return
        }

        // Gunakan invoice number resmi dari server
        const now = new Date()
        const invoiceNumber = result.invoiceNumber || `INV/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}/${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`

        // Get branch name & profile
        const branch = branches.find(b => b.id === selectedBranch)

        // Resolusi info kontak struk: Utamakan alamat/telepon cabang spesifik, fallback ke kontak bisnis utama
        const receiptAddress = (branch?.address?.trim() || businessAddress?.trim()) || undefined
        const receiptPhone = (branch?.phone?.trim() || businessPhone?.trim()) || undefined
        const receiptLogo = businessLogoUrl?.trim() || undefined

        const received = paymentMethod === 'cash' && !isCreditSale && typeof cashReceived === 'number'
            ? cashReceived
            : (paymentMethod === 'cash' ? totalAmount : undefined)
        const change = received !== undefined ? Math.max(0, received - totalAmount) : undefined

        // Prepare invoice data
        const invoice: InvoiceData = {
            invoiceNumber,
            date: now.toLocaleString('id-ID', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            businessName: businessName || 'Rekapi',
            branchName: branch?.name,
            address: receiptAddress,
            phone: receiptPhone,
            logoUrl: receiptLogo,
            items: Object.values(cart).map(item => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                subtotal: item.price * item.quantity,
            })),
            subtotal: totalAmount,
            total: totalAmount,
            paymentMethod: isCreditSale ? (finalPaidAmount === 0 ? 'Kredit / Bon' : `Kredit (DP ${paymentMethod.toUpperCase()})`) : paymentMethod,
            cashierName: userName,
            cashReceived: received,
            change: change,
            customerName: selectedCustomer?.name,
            notes: combinedNotes || undefined,
        }

        setInvoiceData(invoice)
        setShowInvoice(true)
        setCart({})
        setIsCreditSale(false)
        setSelectedCustomerId('')
        setDpAmount(0)
        setDueDate('')
        setNotes('')
        setOrderNote('')
        setCashReceived('')
        setMobileCheckoutOpen(false)
        setMessage('Transaksi tersimpan!')
        router.refresh()
    }

    async function handleSubmit() {
        if (!isOnline) {
            setMessage('Gagal: Koneksi internet terputus. Hubungkan kembali untuk memproses transaksi.')
            return
        }

        const cartItems = Object.values(cart)
        const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
        if (cartItems.length === 0 || totalAmount <= 0) return

        // Validasi ketat ketersediaan stok pada cabang aktif sebelum checkout
        const stockMap = new Map(
            products.map((p) => [p.id, { currentStock: Number(p.stock ?? 0), name: p.name }])
        )
        const stockCheck = validateSaleStockAvailability({
            requestedItems: cartItems,
            oldItems: [],
            stockByProductId: stockMap,
        })
        if (!stockCheck.ok) {
            setMessage(`Gagal: ${stockCheck.error}`)
            return
        }

        if (isCreditSale && !selectedCustomerId) {
            setMessage('Gagal: Penjualan kredit/tempo wajib memilih pelanggan terdaftar.')
            return
        }

        if (paymentMethod === 'cash' && !isCreditSale) {
            if (cashReceived === '' || Number(cashReceived) < totalAmount) {
                setMessage(`Gagal: Uang yang diterima (Rp ${(Number(cashReceived) || 0).toLocaleString('id-ID')}) kurang dari total tagihan (Rp ${totalAmount.toLocaleString('id-ID')}).`)
                return
            }
        }

        // Jika metode pembayaran QRIS di toko (offline) dan bukan kredit tanpa DP, munculkan pop-up QRIS untuk di-scan pelanggan
        if (paymentMethod === 'qris' && channel === 'offline' && (!isCreditSale || dpAmount > 0)) {
            setShowQrisModal(true)
            return
        }

        await executeCheckout()
    }


    const itemCount = Object.values(cart).reduce((sum, i) => sum + i.quantity, 0)

    return (
        <div className="mx-auto max-w-5xl px-4 py-4 sm:py-8 pb-32 lg:pb-16">
            {/* Banner Offline Indicator */}
            {!isOnline && (
                <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-300 p-3.5 flex items-center justify-between text-amber-900 animate-in fade-in duration-200 shadow-xs">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-3 w-3 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                        </span>
                        <div>
                            <p className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                                <svg className="w-4 h-4 text-amber-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span>Koneksi Internet Terputus (Mode Offline)</span>
                            </p>
                            <p className="text-[11px] text-amber-800">
                                Kasir tidak dapat memproses transaksi baru saat offline. Silakan periksa koneksi WiFi atau paket data Anda.
                            </p>
                        </div>
                    </div>
                    <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-lg bg-amber-200/80 text-amber-950 tracking-wide">
                        OFFLINE
                    </span>
                </div>
            )}

            {/* Header POS */}
            <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2.5">
                        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                            Kasir
                        </h1>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[11px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            POS Aktif
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">Scan barcode atau pilih produk untuk transaksi cepat.</p>
                </div>

                {!fixedBranchId && branches.length > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-medium">Cabang:</span>
                        <select
                            value={selectedBranch}
                            onChange={(e) => setSelectedBranch(e.target.value)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none cursor-pointer"
                        >
                            {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Scan / Cari Produk Input */}
            <div className="mb-4">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari nama menu / scan barcode produk..."
                        className="w-full pl-10 pr-12 py-3 rounded-2xl border border-slate-200 bg-white text-xs font-medium text-slate-800 placeholder:text-slate-400 shadow-2xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                    />
                    <button
                        type="button"
                        onClick={() => alert('Fitur Scan Barcode siap digunakan dengan scanner kamera atau hardware barcode scanner.')}
                        title="Scan Barcode"
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-emerald-600 hover:text-emerald-700 transition cursor-pointer"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Category Filter Pills (Clean Text, Zero-Icon) */}
            <div className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {(
                    [
                        { id: 'semua', label: 'Semua Menu' },
                        { id: 'makanan', label: 'Makanan' },
                        { id: 'minuman', label: 'Minuman' },
                        { id: 'lainnya', label: 'Lainnya' },
                    ] as const
                ).map((cat) => (
                    <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                            selectedCategory === cat.id
                                ? 'bg-emerald-800 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                        }`}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Product Catalog List (Compact 2-Col Mobile & 3-Col Desktop Grid) */}
                <div className="lg:col-span-2">
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
                        {filteredGroupedProducts.map((group) => {
                            const isSingle = group.variants.length === 1

                            if (isSingle) {
                                const product = group.variants[0]
                                const qtyInCart = cart[product.id]?.quantity ?? 0
                                const stock = product.stock !== undefined && product.stock !== null ? Number(product.stock) : null
                                const outOfStock = stock !== null && stock <= 0
                                const reachedLimit = stock !== null && qtyInCart >= stock
                                const isDisabled = outOfStock || reachedLimit

                                return (
                                    <div
                                        key={product.id}
                                        onClick={() => !isDisabled && addToCart(product)}
                                        className={`flex flex-col justify-between rounded-2xl border overflow-hidden bg-white transition text-left select-none cursor-pointer ${
                                            outOfStock
                                                ? 'border-slate-200 opacity-60 bg-slate-50 cursor-not-allowed'
                                                : qtyInCart > 0
                                                ? 'border-emerald-700 ring-1 ring-emerald-700 shadow-xs'
                                                : 'border-slate-200 hover:border-emerald-700 shadow-2xs'
                                        }`}
                                    >
                                        {/* Area Gambar Atas (Full-Bleed Top Image + Floating Stock Badge) */}
                                        <div className="relative w-full aspect-[4/3] bg-slate-100 overflow-hidden">
                                            {product.image_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={product.image_url}
                                                    alt={product.name}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <div className="h-full w-full bg-gradient-to-br from-slate-200 via-emerald-100/75 to-teal-200/70 flex items-center justify-center">
                                                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-emerald-400/50 via-emerald-600/55 to-emerald-900/70 shadow-md flex items-center justify-center">
                                                        <span className="text-emerald-950 font-extrabold text-lg sm:text-xl tracking-tight">
                                                            {getProductInitials(product.name)}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Floating Stock Pill di Pojok Kanan Atas Gambar */}
                                            <span
                                                className={`absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shadow-xs backdrop-blur-xs tabular-nums ${
                                                    outOfStock
                                                        ? 'bg-rose-600/95 text-white'
                                                        : 'bg-white/95 text-slate-800'
                                                }`}
                                            >
                                                {outOfStock
                                                    ? 'Habis'
                                                    : stock !== null
                                                    ? `Stok ${stock} ${product.unit || 'pcs'}`
                                                    : 'Tersedia'}
                                            </span>
                                        </div>

                                        {/* Area Konten Bawah Kartu: Nama Produk, Harga, dan Stepper / Tombol + */}
                                        <div className="p-3 sm:p-3.5 flex flex-col gap-2.5 flex-1 justify-between">
                                            <h3
                                                className="font-bold text-sm sm:text-[15px] text-slate-900 line-clamp-1 leading-snug"
                                                title={product.name}
                                            >
                                                {product.name}
                                            </h3>

                                            <div className="flex items-center justify-between gap-2 pt-0.5">
                                                <span className="font-bold text-sm sm:text-[15px] tabular-nums text-emerald-900">
                                                    Rp {product.selling_price.toLocaleString('id-ID')}
                                                </span>

                                                <div
                                                    className="flex items-center shrink-0"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {qtyInCart > 0 ? (
                                                        <div className="inline-flex items-center rounded-lg border border-emerald-800 overflow-hidden bg-white shadow-2xs">
                                                            <button
                                                                type="button"
                                                                onClick={() => changeQty(product.id, -1)}
                                                                className="w-7 h-7 bg-emerald-800 text-white hover:bg-emerald-900 font-bold text-sm flex items-center justify-center transition cursor-pointer"
                                                                title="Kurangi"
                                                            >
                                                                -
                                                            </button>
                                                            <span className="w-7 h-7 bg-white text-slate-900 font-bold text-xs flex items-center justify-center tabular-nums">
                                                                {qtyInCart}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => !isDisabled && addToCart(product)}
                                                                disabled={isDisabled}
                                                                className={`w-7 h-7 font-bold text-sm flex items-center justify-center transition cursor-pointer ${
                                                                    isDisabled
                                                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                                                        : 'bg-emerald-800 text-white hover:bg-emerald-900'
                                                                }`}
                                                                title="Tambah"
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => !isDisabled && addToCart(product)}
                                                            disabled={isDisabled}
                                                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-bold text-base transition cursor-pointer ${
                                                                isDisabled
                                                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                                    : 'bg-emerald-800 text-white hover:bg-emerald-900 shadow-2xs active:scale-95'
                                                            }`}
                                                            title="Tambah ke Keranjang"
                                                        >
                                                            +
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            }

                            // Multi-variant (memiliki beberapa satuan pilihan)
                            const groupQtyInCart = group.variants.reduce((sum, v) => sum + (cart[v.id]?.quantity ?? 0), 0)
                            const allOutOfStock = group.variants.every(
                                (v) => v.stock !== undefined && v.stock !== null && Number(v.stock) <= 0
                            )
                            const groupImageUrl = group.variants.find((v) => v.image_url)?.image_url || null

                            const prices = group.variants.map((v) => v.selling_price)
                            const minPrice = Math.min(...prices)
                            const maxPrice = Math.max(...prices)
                            const priceDisplay = minPrice === maxPrice
                                ? `Rp ${minPrice.toLocaleString('id-ID')}`
                                : `Rp ${minPrice.toLocaleString('id-ID')} - ${maxPrice.toLocaleString('id-ID')}`

                            return (
                                <div
                                    key={group.name}
                                    onClick={() => !allOutOfStock && setSelectingGroup(group)}
                                    className={`flex flex-col justify-between rounded-2xl border overflow-hidden bg-white transition text-left select-none cursor-pointer ${
                                        allOutOfStock
                                            ? 'border-slate-200 opacity-60 bg-slate-50 cursor-not-allowed'
                                            : groupQtyInCart > 0
                                            ? 'border-emerald-700 ring-1 ring-emerald-700 shadow-xs'
                                            : 'border-slate-200 hover:border-emerald-700 shadow-2xs'
                                    }`}
                                >
                                    {/* Area Gambar Atas (Full-Bleed Top Image + Floating Variant Badge) */}
                                    <div className="relative w-full aspect-[4/3] bg-slate-100 overflow-hidden">
                                        {groupImageUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={groupImageUrl}
                                                alt={group.name}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="h-full w-full bg-gradient-to-br from-slate-200 via-emerald-100/75 to-teal-200/70 flex items-center justify-center">
                                                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-emerald-400/50 via-emerald-600/55 to-emerald-900/70 shadow-md flex items-center justify-center">
                                                    <span className="text-emerald-950 font-extrabold text-lg sm:text-xl tracking-tight">
                                                        {getProductInitials(group.name)}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        <span
                                            className={`absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shadow-xs backdrop-blur-xs ${
                                                allOutOfStock
                                                    ? 'bg-rose-600/95 text-white'
                                                    : 'bg-white/95 text-slate-800'
                                            }`}
                                        >
                                            {allOutOfStock ? 'Habis' : `${group.variants.length} Varian`}
                                        </span>
                                    </div>

                                    {/* Area Konten Bawah Kartu */}
                                    <div className="p-3 sm:p-3.5 flex flex-col gap-2.5 flex-1 justify-between">
                                        <div className="flex items-start justify-between gap-1">
                                            <h3
                                                className="font-bold text-sm sm:text-[15px] text-slate-900 line-clamp-1 leading-snug"
                                                title={group.name}
                                            >
                                                {group.name}
                                            </h3>
                                            {groupQtyInCart > 0 && (
                                                <span className="shrink-0 px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-900 tabular-nums">
                                                    {groupQtyInCart}x
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between gap-2 pt-0.5">
                                            <span className="font-bold text-sm sm:text-[15px] tabular-nums text-emerald-900 truncate">
                                                {priceDisplay}
                                            </span>

                                            <button
                                                type="button"
                                                disabled={allOutOfStock}
                                                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-bold text-base shrink-0 transition cursor-pointer ${
                                                    allOutOfStock
                                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                        : 'bg-emerald-800 text-white hover:bg-emerald-900 shadow-2xs active:scale-95'
                                                }`}
                                                title="Pilih Varian"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {filteredGroupedProducts.length === 0 && (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-12 text-center text-xs text-slate-400">
                            Tidak ada produk yang cocok dengan pencarian atau kategori ini.
                        </div>
                    )}
                </div>

                {/* Desktop Cart Sidebar */}
                <div className="hidden lg:block">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sticky top-20">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                                <span>Keranjang</span>
                                {itemCount > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200/60 tabular-nums">
                                        {itemCount} item
                                    </span>
                                )}
                            </h2>
                            {itemCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setCart({})}
                                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                                >
                                    Kosongkan
                                </button>
                            )}
                        </div>

                        <div className="mt-3 space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                            {Object.values(cart).map((item) => {
                                const itemImageUrl =
                                    item.image_url ??
                                    products.find((p) => p.id === item.product_id)?.image_url ??
                                    null

                                return (
                                    <div key={item.product_id} className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-b-0">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className="w-14 h-14 shrink-0 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center">
                                                {itemImageUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={itemImageUrl}
                                                        alt={item.name}
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="h-full w-full bg-gradient-to-br from-slate-200 via-emerald-100/75 to-teal-200/70 flex items-center justify-center">
                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400/50 via-emerald-600/55 to-emerald-900/70 flex items-center justify-center">
                                                            <span className="text-emerald-950 font-extrabold text-[11px] tracking-tight">
                                                                {getProductInitials(item.name)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="font-semibold text-xs text-slate-800 truncate">{item.name}</div>
                                                <div className="text-[11px] font-bold text-emerald-700 tabular-nums mt-0.5">
                                                    Rp {item.price.toLocaleString('id-ID')}
                                                </div>
                                                <div className="inline-flex items-center gap-1 mt-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => changeQty(item.product_id, -1)}
                                                        className="w-6 h-6 rounded-md border border-slate-200 bg-slate-50 font-bold text-slate-600 flex items-center justify-center hover:bg-slate-100 active:scale-95 transition cursor-pointer"
                                                    >
                                                        -
                                                    </button>
                                                    <span className="w-6 text-center font-bold text-xs text-slate-800 tabular-nums">
                                                        {item.quantity}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => changeQty(item.product_id, 1)}
                                                        className="w-6 h-6 rounded-md bg-emerald-800 text-white font-bold flex items-center justify-center hover:bg-emerald-900 active:scale-95 transition cursor-pointer"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => removeFromCart(item.product_id)}
                                            className="w-6 h-6 rounded-md bg-rose-100 text-rose-600 hover:bg-rose-200 flex items-center justify-center text-[10px] font-bold shrink-0 transition cursor-pointer"
                                            title="Hapus dari Keranjang"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                )
                            })}

                            {Object.keys(cart).length === 0 && (
                                <div className="py-8 text-center text-xs text-slate-400">
                                    Pilih menu untuk menambahkan ke keranjang.
                                </div>
                            )}
                        </div>

                        <div className="my-4 border-t border-slate-100 pt-3">
                            <div className="flex items-baseline justify-between mb-3">
                                <span className="text-xs font-semibold text-slate-500">Total Tagihan</span>
                                <span className="text-xl font-bold tabular-nums text-emerald-900">
                                    Rp {total.toLocaleString('id-ID')}
                                </span>
                            </div>

                            {/* Toggle Tipe Transaksi: Tunai vs Kredit */}
                            <div className="flex rounded-lg bg-slate-100 p-1 mb-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsCreditSale(false)
                                        setDpAmount(0)
                                    }}
                                    className={`flex-1 py-1.5 text-xs font-semibold rounded transition cursor-pointer ${
                                        !isCreditSale ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    Tunai / Lunas
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsCreditSale(true)}
                                    className={`flex-1 py-1.5 text-xs font-semibold rounded transition cursor-pointer ${
                                        isCreditSale ? 'bg-rose-700 text-white shadow-xs' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    Kredit / Tempo
                                </button>
                            </div>

                            {isCreditSale && (
                                <div className="space-y-2 rounded-xl bg-rose-50/60 border border-rose-200 p-3 mb-3">
                                    <div>
                                        <label className="text-[11px] font-bold text-rose-900 block mb-1">
                                            Pelanggan (Wajib) *
                                        </label>
                                        {customers.length === 0 ? (
                                            <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-800">
                                                <p className="font-semibold">Belum ada pelanggan terdaftar.</p>
                                                <p className="text-[10px] text-slate-600 mt-0.5">
                                                    Tambahkan pelanggan di{' '}
                                                    <a href="/dashboard/pelanggan" target="_blank" className="font-bold underline text-amber-900">
                                                        Menu Pelanggan &rarr;
                                                    </a>
                                                </p>
                                            </div>
                                        ) : (
                                            <select
                                                value={selectedCustomerId}
                                                onChange={(e) => setSelectedCustomerId(e.target.value)}
                                                className="w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-rose-500 focus:outline-none"
                                            >
                                                <option value="">-- Pilih Pelanggan ({customers.length} terdaftar) --</option>
                                                {customers.map((c) => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.name} {c.phone ? `(${c.phone})` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                        {selectedCustomer && (
                                            <div className="mt-1 text-[10px] text-slate-600 flex justify-between">
                                                <span>Piutang saat ini: Rp {(selectedCustomer.current_receivable || 0).toLocaleString('id-ID')}</span>
                                                {selectedCustomer.receivable_limit ? (
                                                    <span className="font-semibold text-rose-700">Limit: Rp {selectedCustomer.receivable_limit.toLocaleString('id-ID')}</span>
                                                ) : null}
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-medium text-slate-700 block mb-1">
                                            Uang Muka / DP (Rp, Opsional)
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={total}
                                            value={dpAmount || ''}
                                            placeholder="0 (Belum ada pembayaran)"
                                            onChange={(e) => setDpAmount(Number(e.target.value))}
                                            className="w-full rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-rose-500 focus:outline-none"
                                        />
                                        <div className="mt-1 text-[10px] font-semibold text-slate-600 flex justify-between">
                                            <span>Sisa Piutang:</span>
                                            <span className="text-rose-600 font-bold">Rp {Math.max(0, total - dpAmount).toLocaleString('id-ID')}</span>
                                        </div>
                                    </div>

                                    {dpAmount > 0 && accounts.length > 0 && (
                                        <div>
                                            <label className="text-[11px] font-medium text-slate-700 block mb-1">
                                                Rekening / Kas Penerima DP
                                            </label>
                                            <select
                                                value={selectedAccountId}
                                                onChange={(e) => setSelectedAccountId(e.target.value)}
                                                className="w-full rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-rose-500 focus:outline-none"
                                            >
                                                {accounts.map((acc) => (
                                                    <option key={acc.id} value={acc.id}>
                                                        {acc.name} ({acc.type.toUpperCase()})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div>
                                        <label className="text-[11px] font-medium text-slate-700 block mb-1">
                                            Tanggal Jatuh Tempo (Opsional)
                                        </label>
                                        <input
                                            type="date"
                                            value={dueDate}
                                            onChange={(e) => setDueDate(e.target.value)}
                                            className="w-full rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-rose-500 focus:outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-medium text-slate-700 block mb-1">
                                            Catatan Kredit (Opsional)
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Contoh: Titip bon / jatuh tempo 2 minggu"
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            className="w-full rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-rose-500 focus:outline-none"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2 mb-4">
                                {(!isCreditSale || dpAmount > 0) && (
                                    <div>
                                        <label className="text-[11px] font-medium text-slate-600 block mb-1">
                                            {isCreditSale ? 'Metode Pembayaran DP' : 'Metode Bayar'}
                                        </label>
                                        <select
                                            value={paymentMethod}
                                            onChange={(e) => handlePaymentMethodChange(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                                        >
                                            {PAYMENT_METHODS.map((m) => (
                                                <option key={m} value={m}>
                                                    {m.toUpperCase()}
                                                </option>
                                            ))}
                                        </select>
                                        {paymentMethod === 'qris' && businessQrisUrl && (
                                            <div className="mt-2 rounded-xl bg-emerald-50/70 border border-emerald-200 p-2.5 space-y-2">
                                                <div className="flex items-center gap-2.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowQrisModal(true)}
                                                        title="Klik untuk memperbesar Kode QRIS"
                                                        className="h-14 w-14 shrink-0 rounded-lg border border-emerald-200 bg-white p-1 overflow-hidden flex items-center justify-center hover:border-emerald-600 transition cursor-pointer shadow-2xs"
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={businessQrisUrl}
                                                            alt="Preview QRIS Toko"
                                                            className="h-full w-full object-contain"
                                                        />
                                                    </button>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[11px] font-bold text-emerald-950">
                                                            Kode QRIS Statis Toko
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowQrisModal(true)}
                                                            className="mt-1 inline-flex items-center gap-1 rounded-lg bg-emerald-800 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-900 transition cursor-pointer"
                                                        >
                                                            <span>Lihat / Tampilkan Kode QRIS Toko</span>
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-emerald-900 leading-snug border-t border-emerald-200/70 pt-1.5">
                                                    Pastikan bukti pembayaran QRIS pada HP pelanggan telah berhasil sebelum menekan tombol Proses Pembayaran.
                                                </p>
                                            </div>
                                        )}
                                        {paymentMethod === 'qris' && !businessQrisUrl && (
                                            <div className="mt-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[10px] text-amber-800 flex items-center gap-1.5">
                                                <svg className="w-3.5 h-3.5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                                <span>QRIS toko belum diunggah owner di Profil Bisnis</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {(!isCreditSale || dpAmount > 0) && accounts.length > 0 && (
                                    <div>
                                        <label className="text-[11px] font-medium text-slate-600 block mb-1">
                                            Akun Penampung Kas / Bank
                                        </label>
                                        <select
                                            value={selectedAccountId}
                                            onChange={(e) => setSelectedAccountId(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                                        >
                                            {accounts.map((acc) => (
                                                <option key={acc.id} value={acc.id}>
                                                    {acc.name} ({acc.type.toUpperCase()})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div>
                                    <label className="text-[11px] font-medium text-slate-600 block mb-1">Channel Penjualan</label>
                                    <select
                                        value={channel}
                                        onChange={(e) => setChannel(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none capitalize"
                                    >
                                        {CHANNELS.map((c) => (
                                            <option key={c} value={c}>
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Bagian Pembayaran Tunai (Uang Diterima & Kembalian) */}
                                {paymentMethod === 'cash' && !isCreditSale && total > 0 && (
                                    <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200/90 p-3.5 space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[11px] font-bold text-emerald-950 flex items-center gap-1.5">
                                                <span>Uang Tunai Diterima</span>
                                            </label>
                                            {typeof cashReceived === 'number' && cashReceived > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setCashReceived('')}
                                                    className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                                                >
                                                    Reset
                                                </button>
                                            )}
                                        </div>

                                        <div className="relative">
                                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400">
                                                Rp
                                            </span>
                                            <input
                                                type="number"
                                                min={0}
                                                value={cashReceived}
                                                onChange={(e) => setCashReceived(e.target.value === '' ? '' : Number(e.target.value))}
                                                placeholder={total.toLocaleString('id-ID')}
                                                className="w-full pl-9 pr-3 py-2 rounded-lg border border-emerald-200 bg-white text-xs font-extrabold text-slate-900 shadow-2xs focus:border-emerald-600 focus:outline-none tabular-nums"
                                            />
                                        </div>

                                        {/* Quick Amount Chips */}
                                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                                            {quickCashPresets.map((preset) => (
                                                <button
                                                    key={preset}
                                                    type="button"
                                                    onClick={() => setCashReceived(preset)}
                                                    className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer tabular-nums ${
                                                        cashReceived === preset
                                                            ? 'bg-emerald-800 text-white shadow-2xs'
                                                            : 'bg-white border border-emerald-200 text-emerald-900 hover:bg-emerald-100/70'
                                                    }`}
                                                >
                                                    {preset === total ? 'Uang Pas' : `Rp ${preset.toLocaleString('id-ID')}`}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Kembalian / Kurang Banner */}
                                        {typeof cashReceived === 'number' && cashReceived > 0 && (
                                            <div className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-between ${
                                                cashReceived >= total
                                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                                    : 'bg-rose-50 border-rose-200 text-rose-700'
                                            }`}>
                                                <span>{cashReceived >= total ? 'Kembalian:' : 'Uang Kurang:'}</span>
                                                <span className="text-sm font-extrabold tabular-nums">
                                                    {cashReceived >= total
                                                        ? `Rp ${cashChange.toLocaleString('id-ID')}`
                                                        : `Rp ${(total - cashReceived).toLocaleString('id-ID')}`}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Catatan Transaksi / No. Meja */}
                                <div>
                                    <label className="text-[11px] font-medium text-slate-600 block mb-1">
                                        Catatan / No. Meja (Opsional)
                                    </label>
                                    <input
                                        type="text"
                                        value={orderNote}
                                        onChange={(e) => setOrderNote(e.target.value)}
                                        placeholder="Contoh: Meja 04 / Takeaway Budi"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-emerald-600 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={saving || Object.keys(cart).length === 0 || !selectedBranch || !isOnline || !isCashSufficient}
                                className="w-full rounded-lg bg-emerald-800 py-3 text-xs font-bold text-white shadow-2xs hover:bg-emerald-900 active:scale-[0.99] transition disabled:opacity-40 cursor-pointer"
                            >
                                {saving ? (
                                    'Menyimpan...'
                                ) : !isOnline ? (
                                    'Koneksi Offline (Tidak Dapat Checkout)'
                                ) : isCreditSale ? (
                                    dpAmount > 0 ? `Simpan Kredit (DP Rp ${dpAmount.toLocaleString('id-ID')})` : 'Simpan Bon / Piutang'
                                ) : paymentMethod === 'cash' && typeof cashReceived === 'number' && cashReceived > 0 && cashReceived < total ? (
                                    `Uang Kurang (Rp ${(total - cashReceived).toLocaleString('id-ID')})`
                                ) : paymentMethod === 'cash' && typeof cashReceived === 'number' && cashReceived >= total && cashChange > 0 ? (
                                    `Bayar & Kembalian Rp ${cashChange.toLocaleString('id-ID')}`
                                ) : (
                                    'Bayar Sekarang'
                                )}
                            </button>

                            {message && (
                                <p className={`mt-2 text-center text-xs font-semibold ${message.startsWith('Gagal') ? 'text-rose-600' : 'text-emerald-700'}`}>
                                    {message}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Mobile Cart Bottom Bar (Single Unified Bottom Bar on Mobile & Tablet POS) ── */}
            {itemCount > 0 ? (
                <div className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-3 shadow-2xl animate-in slide-in-from-bottom duration-200">
                    <div className="flex items-center justify-between max-w-md mx-auto">
                        <div
                            onClick={() => setMobileCheckoutOpen(true)}
                            className="flex items-center gap-2.5 cursor-pointer pl-1"
                        >
                            <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-black">
                                {itemCount}
                            </span>
                            <div>
                                <span className="text-[10px] text-slate-400 font-medium block leading-none">Total Tagihan</span>
                                <span className="text-sm font-extrabold text-emerald-800">
                                    Rp {total.toLocaleString('id-ID')}
                                </span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setMobileCheckoutOpen(true)}
                            className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-900 active:scale-95 transition cursor-pointer"
                        >
                            Bayar Sekarang &rarr;
                        </button>
                    </div>
                </div>
            ) : (
                <div className="fixed bottom-0 inset-x-0 z-30 lg:hidden bg-white/90 backdrop-blur-md border-t border-slate-200 px-4 py-2.5 flex items-center justify-between text-xs text-slate-500">
                    <span className="text-[11px] text-slate-400">Keranjang kasir kosong</span>
                    <a href="/dashboard/penjualan/riwayat" className="font-semibold text-emerald-800 hover:underline text-[11px]">
                        Riwayat Penjualan &rarr;
                    </a>
                </div>
            )}

            {/* Mobile Checkout Modal Drawer */}
            {mobileCheckoutOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs lg:hidden"
                    onClick={() => setMobileCheckoutOpen(false)}
                >
                    <div
                        className="w-full max-w-lg rounded-t-2xl bg-white shadow-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="font-bold text-sm text-slate-900">Rincian Pembayaran</h3>
                            <button
                                type="button"
                                onClick={() => setMobileCheckoutOpen(false)}
                                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 font-bold flex items-center justify-center cursor-pointer hover:bg-slate-200 transition"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                            <div className="py-1 space-y-2">
                                {Object.values(cart).map((item) => {
                                    const itemImageUrl =
                                        item.image_url ??
                                        products.find((p) => p.id === item.product_id)?.image_url ??
                                        null

                                    return (
                                        <div key={item.product_id} className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-b-0">
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <div className="w-12 h-12 shrink-0 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center">
                                                    {itemImageUrl ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={itemImageUrl}
                                                            alt={item.name}
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="h-full w-full bg-gradient-to-br from-slate-200 via-emerald-100/75 to-teal-200/70 flex items-center justify-center">
                                                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400/50 via-emerald-600/55 to-emerald-900/70 flex items-center justify-center">
                                                                <span className="text-emerald-950 font-extrabold text-[10px] tracking-tight">
                                                                    {getProductInitials(item.name)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="font-bold text-xs text-slate-800 truncate">{item.name}</div>
                                                    <div className="text-[11px] font-bold text-emerald-700 tabular-nums mt-0.5">
                                                        Rp {item.price.toLocaleString('id-ID')}
                                                    </div>
                                                    <div className="inline-flex items-center gap-1.5 mt-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => changeQty(item.product_id, -1)}
                                                            className="w-6 h-6 rounded-md border border-slate-200 bg-slate-50 font-bold text-slate-700 flex items-center justify-center active:scale-95 transition cursor-pointer"
                                                        >
                                                            -
                                                        </button>
                                                        <span className="w-5 text-center font-bold text-xs tabular-nums">{item.quantity}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => changeQty(item.product_id, 1)}
                                                            className="w-6 h-6 rounded-md bg-emerald-800 text-white font-bold flex items-center justify-center active:scale-95 transition cursor-pointer"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => removeFromCart(item.product_id)}
                                                className="w-6 h-6 rounded-md bg-rose-100 text-rose-600 hover:bg-rose-200 flex items-center justify-center text-[10px] font-bold shrink-0 transition cursor-pointer"
                                                title="Hapus dari Keranjang"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>

                        <div className="space-y-3 pt-3 border-t border-slate-100">
                            {/* Toggle Tipe Transaksi Mobile */}
                            <div className="flex rounded-lg bg-slate-100 p-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsCreditSale(false)
                                        setDpAmount(0)
                                    }}
                                    className={`flex-1 py-1.5 text-xs font-semibold rounded transition cursor-pointer ${
                                        !isCreditSale ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                                    }`}
                                >
                                    Tunai / Lunas
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsCreditSale(true)}
                                    className={`flex-1 py-1.5 text-xs font-semibold rounded transition cursor-pointer ${
                                        isCreditSale ? 'bg-rose-700 text-white shadow-xs' : 'text-slate-500'
                                    }`}
                                >
                                    Kredit / Tempo
                                </button>
                            </div>

                            {isCreditSale && (
                                <div className="space-y-2 rounded-xl bg-rose-50/60 border border-rose-200 p-3">
                                    <div>
                                        <label className="text-[11px] font-bold text-rose-900 block mb-1">
                                            Pelanggan (Wajib) *
                                        </label>
                                        {customers.length === 0 ? (
                                            <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-800">
                                                <p className="font-semibold">Belum ada pelanggan terdaftar.</p>
                                                <p className="text-[10px] text-slate-600 mt-0.5">
                                                    Tambahkan pelanggan di{' '}
                                                    <a href="/dashboard/pelanggan" target="_blank" className="font-bold underline text-amber-900">
                                                        Menu Pelanggan &rarr;
                                                    </a>
                                                </p>
                                            </div>
                                        ) : (
                                            <select
                                                value={selectedCustomerId}
                                                onChange={(e) => setSelectedCustomerId(e.target.value)}
                                                className="w-full rounded-xl border border-rose-200 bg-white p-2 text-xs font-medium text-slate-800"
                                            >
                                                <option value="">-- Pilih Pelanggan ({customers.length} terdaftar) --</option>
                                                {customers.map((c) => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.name} {c.phone ? `(${c.phone})` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                        {selectedCustomer && (
                                            <div className="mt-1 text-[10px] text-slate-600 flex justify-between">
                                                <span>Piutang: Rp {(selectedCustomer.current_receivable || 0).toLocaleString('id-ID')}</span>
                                                {selectedCustomer.receivable_limit ? (
                                                    <span className="font-semibold text-rose-700">Limit: Rp {selectedCustomer.receivable_limit.toLocaleString('id-ID')}</span>
                                                ) : null}
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-medium text-slate-700 block mb-1">
                                            DP / Pembayaran Awal (Rp)
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={total}
                                            value={dpAmount || ''}
                                            placeholder="0 (Belum ada pembayaran)"
                                            onChange={(e) => setDpAmount(Number(e.target.value))}
                                            className="w-full rounded-xl border border-rose-200 bg-white p-2 text-xs font-bold text-slate-800"
                                        />
                                        <div className="mt-1 text-[10px] font-semibold text-slate-600 flex justify-between">
                                            <span>Sisa Piutang:</span>
                                            <span className="text-rose-600 font-bold">Rp {Math.max(0, total - dpAmount).toLocaleString('id-ID')}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-medium text-slate-700 block mb-1">
                                            Jatuh Tempo (Opsional)
                                        </label>
                                        <input
                                            type="date"
                                            value={dueDate}
                                            onChange={(e) => setDueDate(e.target.value)}
                                            className="w-full rounded-xl border border-rose-200 bg-white p-2 text-xs text-slate-800"
                                        />
                                    </div>
                                </div>
                            )}

                            {(!isCreditSale || dpAmount > 0) && (
                                <div>
                                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                                        {isCreditSale ? 'Metode Pembayaran DP' : 'Metode Bayar'}
                                    </label>
                                    <select
                                        value={paymentMethod}
                                        onChange={(e) => handlePaymentMethodChange(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold"
                                    >
                                        {PAYMENT_METHODS.map((m) => (
                                            <option key={m} value={m}>
                                                {m.toUpperCase()}
                                            </option>
                                        ))}
                                    </select>
                                    {paymentMethod === 'qris' && businessQrisUrl && (
                                        <div className="mt-2 rounded-xl bg-emerald-50/70 border border-emerald-200 p-2.5 space-y-2">
                                            <div className="flex items-center gap-2.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowQrisModal(true)}
                                                    className="h-14 w-14 shrink-0 rounded-lg border border-emerald-200 bg-white p-1 overflow-hidden flex items-center justify-center cursor-pointer"
                                                >
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={businessQrisUrl}
                                                        alt="Preview QRIS Toko"
                                                        className="h-full w-full object-contain"
                                                    />
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[11px] font-bold text-emerald-950">
                                                        Kode QRIS Statis Toko
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowQrisModal(true)}
                                                        className="mt-1 inline-flex items-center gap-1 rounded-lg bg-emerald-800 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-900 transition cursor-pointer"
                                                    >
                                                        <span>Lihat / Tampilkan Kode QRIS Toko</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-emerald-900 leading-snug border-t border-emerald-200/70 pt-1.5">
                                                Pastikan bukti pembayaran QRIS pada HP pelanggan telah berhasil sebelum menekan tombol Proses Pembayaran.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {(!isCreditSale || dpAmount > 0) && accounts.length > 0 && (
                                <div>
                                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                                        Akun Penampung Kas / Bank
                                    </label>
                                    <select
                                        value={selectedAccountId}
                                        onChange={(e) => setSelectedAccountId(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold"
                                    >
                                        {accounts.map((acc) => (
                                            <option key={acc.id} value={acc.id}>
                                                {acc.name} ({acc.type.toUpperCase()})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">Channel Penjualan</label>
                                <select
                                    value={channel}
                                    onChange={(e) => setChannel(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold capitalize"
                                >
                                    {CHANNELS.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Bagian Pembayaran Tunai Mobile (Uang Diterima & Kembalian) */}
                            {paymentMethod === 'cash' && !isCreditSale && total > 0 && (
                                <div className="rounded-lg bg-emerald-50/70 border border-emerald-200/90 p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                                            <span>Uang Tunai Diterima</span>
                                        </label>
                                        {typeof cashReceived === 'number' && cashReceived > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setCashReceived('')}
                                                className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                                            >
                                                Reset
                                            </button>
                                        )}
                                    </div>

                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400">
                                            Rp
                                        </span>
                                        <input
                                            type="number"
                                            min={0}
                                            value={cashReceived}
                                            onChange={(e) => setCashReceived(e.target.value === '' ? '' : Number(e.target.value))}
                                            placeholder={total.toLocaleString('id-ID')}
                                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-emerald-200 bg-white text-xs font-extrabold text-slate-900 shadow-2xs focus:border-emerald-600 focus:outline-none tabular-nums"
                                        />
                                    </div>

                                    {/* Quick Amount Chips */}
                                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                                        {quickCashPresets.map((preset) => (
                                            <button
                                                key={preset}
                                                type="button"
                                                onClick={() => setCashReceived(preset)}
                                                className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer tabular-nums ${
                                                    cashReceived === preset
                                                        ? 'bg-emerald-800 text-white'
                                                        : 'bg-white border border-emerald-200 text-emerald-900'
                                                }`}
                                            >
                                                {preset === total ? 'Uang Pas' : `Rp ${preset.toLocaleString('id-ID')}`}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Kembalian / Kurang Banner */}
                                    {typeof cashReceived === 'number' && cashReceived > 0 && (
                                        <div className={`p-2 rounded-lg border text-xs font-bold flex items-center justify-between ${
                                            cashReceived >= total
                                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                                : 'bg-rose-50 border-rose-200 text-rose-700'
                                        }`}>
                                            <span>{cashReceived >= total ? 'Kembalian:' : 'Uang Kurang:'}</span>
                                            <span className="text-sm font-extrabold tabular-nums">
                                                {cashReceived >= total
                                                    ? `Rp ${cashChange.toLocaleString('id-ID')}`
                                                    : `Rp ${(total - cashReceived).toLocaleString('id-ID')}`}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Catatan / No. Meja Mobile */}
                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">Catatan / No. Meja (Opsional)</label>
                                <input
                                    type="text"
                                    value={orderNote}
                                    onChange={(e) => setOrderNote(e.target.value)}
                                    placeholder="Contoh: Meja 04 / Takeaway Budi"
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-medium focus:bg-white focus:border-emerald-600 focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer Checkout Pinned */}
                    <div className="shrink-0 p-4 border-t border-slate-200 bg-slate-50 space-y-2.5">
                            <div className="flex items-baseline justify-between">
                                <span className="text-xs text-slate-500 font-semibold">Total Tagihan</span>
                                <span className="text-xl font-bold tabular-nums text-emerald-900">
                                    Rp {total.toLocaleString('id-ID')}
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={async () => {
                                    await handleSubmit()
                                }}
                                disabled={saving || !isOnline || !isCashSufficient}
                                className="w-full rounded-xl bg-emerald-800 py-3 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 active:scale-[0.99] transition disabled:opacity-40 cursor-pointer"
                            >
                                {saving ? (
                                    'Menyimpan...'
                                ) : !isOnline ? (
                                    'Koneksi Offline (Tidak Dapat Checkout)'
                                ) : isCreditSale ? (
                                    dpAmount > 0 ? `Simpan Kredit (DP Rp ${dpAmount.toLocaleString('id-ID')})` : 'Simpan Bon / Piutang'
                                ) : paymentMethod === 'cash' && typeof cashReceived === 'number' && cashReceived > 0 && cashReceived < total ? (
                                    `Uang Kurang (Rp ${(total - cashReceived).toLocaleString('id-ID')})`
                                ) : paymentMethod === 'cash' && typeof cashReceived === 'number' && cashReceived >= total && cashChange > 0 ? (
                                    `Bayar & Kembalian Rp ${cashChange.toLocaleString('id-ID')}`
                                ) : (
                                    'Selesaikan Transaksi'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Pemilihan Satuan untuk Produk Multi-Varian */}
            {selectingGroup && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
                    onClick={() => setSelectingGroup(null)}
                >
                    <div
                        className="w-full max-w-md max-h-[85vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="shrink-0 flex items-start justify-between border-b border-slate-100 p-4 bg-slate-50/50">
                            <div>
                                <h3 className="text-sm sm:text-base font-bold text-slate-900">{selectingGroup.name}</h3>
                                <p className="text-[11px] text-slate-500">Pilih varian satuan yang diinginkan</p>
                            </div>
                            <button
                                onClick={() => setSelectingGroup(null)}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-0">
                            {selectingGroup.variants.map((v) => {
                                const itemInCart = cart[v.id]
                                const qtyInCart = itemInCart?.quantity ?? 0
                                const stock = v.stock !== undefined && v.stock !== null ? Number(v.stock) : null
                                const outOfStock = stock !== null && stock <= 0
                                const reachedLimit = stock !== null && qtyInCart >= stock
                                const lowStock = stock !== null && stock > 0 && stock <= 5

                                return (
                                    <div
                                        key={v.id}
                                        className={`flex items-center justify-between rounded-lg border p-3 transition ${
                                            outOfStock
                                                ? 'border-rose-100 bg-rose-50/40 opacity-70'
                                                : qtyInCart > 0
                                                ? 'border-emerald-700 bg-emerald-50/40'
                                                : 'border-slate-200 bg-white hover:border-emerald-600'
                                        }`}
                                    >
                                        <div className="space-y-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-semibold text-slate-600">Satuan:</span>
                                                <span className="text-xs font-bold uppercase text-slate-900">
                                                    {v.unit || 'pcs'}
                                                </span>
                                                {outOfStock && (
                                                    <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[9px] font-bold text-white">
                                                        HABIS
                                                    </span>
                                                )}
                                                {reachedLimit && !outOfStock && (
                                                    <span className="rounded-full bg-slate-700 px-1.5 py-0.2 text-[9px] font-bold text-white">
                                                        MAX
                                                    </span>
                                                )}
                                                {lowStock && !reachedLimit && (
                                                    <span className="rounded-full bg-amber-400 px-1.5 py-0.2 text-[9px] font-bold text-slate-900">
                                                        Sisa {stock}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs font-bold text-slate-900">
                                                Rp {v.selling_price.toLocaleString('id-ID')}
                                            </div>
                                            {stock !== null && !outOfStock && !lowStock && (
                                                <div className="text-[10px] text-slate-400">
                                                    Stok: {stock} {v.unit || 'pcs'}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            {qtyInCart > 0 ? (
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => changeQty(v.id, -1)}
                                                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-base font-bold text-slate-700 shadow-2xs hover:bg-slate-100 active:scale-95 transition"
                                                    >
                                                        -
                                                    </button>
                                                    <span className="w-5 text-center text-xs font-bold text-emerald-700">
                                                        {qtyInCart}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => changeQty(v.id, 1)}
                                                        disabled={reachedLimit}
                                                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-base font-bold text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40 active:scale-95 transition"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => addToCart(v)}
                                                    disabled={outOfStock}
                                                    className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-emerald-700 disabled:opacity-40 active:scale-95"
                                                >
                                                    + Tambah
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="shrink-0 p-3.5 border-t border-slate-200 bg-slate-50">
                            <button
                                type="button"
                                onClick={() => setSelectingGroup(null)}
                                className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800 cursor-pointer"
                            >
                                Selesai
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* QRIS Pop-up Modal untuk Scan Pelanggan */}
            {showQrisModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="relative w-full max-w-sm max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
                        {/* Header Pinned */}
                        <div className="shrink-0 flex items-center justify-between border-b border-slate-100 p-4 bg-slate-50/50">
                            <div className="flex items-center gap-2">
                                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs">
                                    QR
                                </span>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900">Pembayaran QRIS</h3>
                                    <p className="text-[10px] text-slate-500">Scan QRIS untuk pembayaran di toko</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => !saving && setShowQrisModal(false)}
                                disabled={saving}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Body Scrollable */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                            {/* Total Tagihan */}
                            <div className="rounded-xl bg-slate-50 p-3.5 text-center border border-slate-100">
                                <p className="text-[11px] text-slate-500 font-medium">Total Tagihan Pelanggan</p>
                                <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-0.5 tabular-nums">
                                    Rp {total.toLocaleString('id-ID')}
                                </p>
                                <p className="text-[10px] text-slate-500 mt-1">
                                    {businessName || 'Toko'} {branches.find(b => b.id === selectedBranch) ? `• ${branches.find(b => b.id === selectedBranch)?.name}` : ''}
                                </p>
                            </div>

                            {/* Gambar QRIS Toko */}
                            {businessQrisUrl ? (
                                <div className="flex flex-col items-center">
                                    <div className="relative rounded-2xl border-2 border-dashed border-emerald-300 bg-white p-3 shadow-inner">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={businessQrisUrl}
                                            alt="QRIS Toko"
                                            className="max-h-56 sm:max-h-64 w-auto max-w-full rounded-xl object-contain shadow-xs"
                                        />
                                    </div>
                                    <p className="mt-2.5 text-center text-xs font-medium text-slate-600 flex items-center justify-center gap-1.5">
                                        <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                        </svg>
                                        <span>Arahkan kamera / e-wallet pelanggan ke QRIS di atas</span>
                                    </p>
                                    <p className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-center text-[11px] font-medium text-amber-900 leading-snug">
                                        Pastikan bukti pembayaran QRIS pada HP pelanggan telah berhasil sebelum menekan tombol Proses Pembayaran.
                                    </p>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-center">
                                    <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    </div>
                                    <p className="text-xs font-bold text-amber-900">QRIS Toko Belum Diunggah</p>
                                    <p className="mt-0.5 text-[11px] text-amber-800 leading-relaxed">
                                        Owner belum mengunggah gambar QRIS di menu <span className="font-semibold">Profil Bisnis</span>.
                                    </p>
                                    <p className="mt-1.5 text-[10px] text-slate-600">
                                        Silakan minta pelanggan memindai kode QRIS fisik di meja kasir.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Actions Pinned */}
                        <div className="shrink-0 p-3.5 border-t border-slate-100 bg-slate-50 space-y-2">
                            <button
                                type="button"
                                onClick={executeCheckout}
                                disabled={saving}
                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50 transition cursor-pointer"
                            >
                                {saving ? (
                                    <>
                                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Memproses Pembayaran...
                                    </>
                                ) : (
                                    'Konfirmasi Pembayaran Selesai'
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => setShowQrisModal(false)}
                                disabled={saving}
                                className="w-full rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                            >
                                Kembali / Ganti Metode Bayar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Invoice Modal */}
            {showInvoice && invoiceData && (
                <InvoiceModal
                    isOpen={showInvoice}
                    onClose={() => setShowInvoice(false)}
                    data={invoiceData}
                />
            )}
        </div>
    )
}