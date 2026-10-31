'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
    RawMaterialWithStocks,
    Supplier,
    PurchaseDetail,
    InventoryMutation,
    MutationType,
} from '@/types/inventory'
import {
    createRawMaterial,
    updateRawMaterial,
    deleteRawMaterial,
    recordStockAdjustment,
    recordStockTransfer,
    updateRawMaterialGlobalStock,
} from './raw-material-actions'
import {
    createSupplier,
    updateSupplier,
    deleteSupplier,
    getSupplierDetailWithPurchases,
} from './supplier-actions'
import { addPurchase, deletePurchase, PurchaseItemInput } from './actions'
import SubTabNav from '@/components/sub-tab-nav'

interface Branch {
    id: string
    name: string
}

export interface FinancialAccountOption {
    id: string
    name: string
    type: string
    is_default_cash?: boolean
    is_default_bank?: boolean
}

interface BahanBakuClientProps {
    isOwner: boolean
    currentBranchId: string | null
    defaultBranchId?: string | null
    branches: Branch[]
    accounts?: FinancialAccountOption[]
    initialRawMaterials: RawMaterialWithStocks[]
    initialSuppliers: Supplier[]
    initialPurchases: PurchaseDetail[]
    initialMutations: InventoryMutation[]
}

const fmt = (n: number) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(n)

const fmtQty = (n: number) =>
    new Intl.NumberFormat('id-ID', {
        maximumFractionDigits: 2,
    }).format(n)

export default function BahanBakuClient({
    isOwner,
    currentBranchId,
    defaultBranchId,
    branches,
    accounts = [],
    initialRawMaterials,
    initialSuppliers,
    initialPurchases,
    initialMutations,
}: BahanBakuClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const tabParam = searchParams.get('tab')
    const today = new Date().toISOString().split('T')[0]

    // Active sub-section tab derived from URL query param
    const activeSection: 'stok' | 'belanja' | 'mutasi' | 'supplier' = useMemo(() => {
        if (tabParam === 'supplier') return 'supplier'
        if (tabParam === 'purchases' || tabParam === 'belanja' || tabParam === 'pembelian') return 'belanja'
        if (tabParam === 'ledger' || tabParam === 'mutasi') return 'mutasi'
        return 'stok'
    }, [tabParam])

    // Global notifications
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)

    // Data states
    const [rawMaterials, setRawMaterials] = useState<RawMaterialWithStocks[]>(initialRawMaterials)
    const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers)
    const [purchases, setPurchases] = useState<PurchaseDetail[]>(initialPurchases)
    const [mutations] = useState<InventoryMutation[]>(initialMutations)

    // Filters
    const effectiveDefault = defaultBranchId && defaultBranchId !== 'all' ? defaultBranchId : null
    const [filterBranch] = useState<string>(
        effectiveDefault || (isOwner ? 'all' : currentBranchId || branches[0]?.id || 'all')
    )
    const [searchTerm, setSearchTerm] = useState('')
    const [mutationTypeFilter, setMutationTypeFilter] = useState<string>('all')

    // ── MODAL STATES ─────────────────────────────────────────────────────────────
    // Raw Material Modal
    const [materialModalOpen, setMaterialModalOpen] = useState(false)
    const [editingMaterial, setEditingMaterial] = useState<RawMaterialWithStocks | null>(null)
    const [matName, setMatName] = useState('')
    const [matSku, setMatSku] = useState('')
    const [matCategory, setMatCategory] = useState('')
    const [matUnit, setMatUnit] = useState('pcs')
    const [matCost, setMatCost] = useState<number>(0)
    const [matMinStock, setMatMinStock] = useState<number>(0)
    const [matInitialStocks, setMatInitialStocks] = useState<{ [branchId: string]: number }>({})
    const [materialSaving, setMaterialSaving] = useState(false)

    // Modal Stok Induk (Global)
    const [globalStockModalOpen, setGlobalStockModalOpen] = useState(false)
    const [globalStockMaterial, setGlobalStockMaterial] = useState<RawMaterialWithStocks | null>(null)
    const [globalStockInput, setGlobalStockInput] = useState<number>(0)
    const [globalStockSaving, setGlobalStockSaving] = useState(false)

    // Stock Adjustment Modal
    const [adjustModalOpen, setAdjustModalOpen] = useState(false)
    const [adjustMaterial, setAdjustMaterial] = useState<RawMaterialWithStocks | null>(null)
    const [adjustBranchId, setAdjustBranchId] = useState<string>(branches[0]?.id || '')
    const [adjustType, setAdjustType] = useState<'adjustment' | 'waste' | 'transfer'>('adjustment')
    const [adjustQuantity, setAdjustQuantity] = useState<number>(0)
    const [transferTargetBranch, setTransferTargetBranch] = useState<string>('')
    const [adjustNotes, setAdjustNotes] = useState('')
    const [adjustSaving, setAdjustSaving] = useState(false)

    // Supplier Modal
    const [supplierModalOpen, setSupplierModalOpen] = useState(false)
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
    const [supName, setSupName] = useState('')
    const [supPhone, setSupPhone] = useState('')
    const [supEmail, setSupEmail] = useState('')
    const [supAddress, setSupAddress] = useState('')
    const [supBank, setSupBank] = useState('')
    const [supNotes, setSupNotes] = useState('')
    const [supplierSaving, setSupplierSaving] = useState(false)

    // Supplier History Modal
    const [supplierDetailModalOpen, setSupplierDetailModalOpen] = useState(false)
    const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null)
    const [supplierPurchases, setSupplierPurchases] = useState<PurchaseDetail[]>([])
    const [loadingSupplierDetail, setLoadingSupplierDetail] = useState(false)

    // Purchase Form State
    const defaultAccount = accounts.find((a) => a.is_default_cash) || accounts[0]
    const [selectedBranch, setSelectedBranch] = useState(
        effectiveDefault || (isOwner ? 'all' : currentBranchId || branches[0]?.id || '')
    )
    const [distributionMode, setDistributionMode] = useState<'split' | 'each'>('split')
    const [purchaseSupplierId, setPurchaseSupplierId] = useState<string>('')
    const [customSupplierName, setCustomSupplierName] = useState('')
    const [purchaseDate, setPurchaseDate] = useState(today)
    const [purchasePaymentStatus, setPurchasePaymentStatus] = useState<'paid' | 'unpaid'>('paid')
    const [purchaseAccountId, setPurchaseAccountId] = useState<string>(defaultAccount?.id || '')
    const [purchaseDueDate, setPurchaseDueDate] = useState<string>('')
    const [purchaseItems, setPurchaseItems] = useState<PurchaseItemInput[]>([
        { raw_material_id: null, item_name: '', quantity: 1, price: 0, unit: 'pcs' },
    ])
    const [purchaseModalOpen, setPurchaseModalOpen] = useState(false)
    const [purchaseSaving, setPurchaseSaving] = useState(false)
    const [deletingPurchaseId, setDeletingPurchaseId] = useState<string | null>(null)

    // ── SUMMARY METRICS ──────────────────────────────────────────────────────────
    const totalMaterialsCount = rawMaterials.length
    const lowStockMaterials = rawMaterials.filter((m) => m.is_low_stock && m.status === 'active')
    const totalInventoryValue = rawMaterials.reduce((sum, m) => sum + m.total_stock * m.cost_per_unit, 0)

    // ── HANDLERS: RAW MATERIALS ──────────────────────────────────────────────────
    function openCreateMaterialModal() {
        setEditingMaterial(null)
        setMatName('')
        setMatSku('')
        setMatCategory('')
        setMatUnit('pcs')
        setMatCost(0)
        setMatMinStock(0)
        setMatInitialStocks({})
        setMaterialModalOpen(true)
        setErrorMsg(null)
    }

    function openEditMaterialModal(material: RawMaterialWithStocks) {
        setEditingMaterial(material)
        setMatName(material.name)
        setMatSku(material.sku || '')
        setMatCategory(material.category || '')
        setMatUnit(material.unit)
        setMatCost(material.cost_per_unit)
        setMatMinStock(material.min_stock)
        setMatInitialStocks({})
        setMaterialModalOpen(true)
        setErrorMsg(null)
    }

    async function handleSaveMaterial(e: React.FormEvent) {
        e.preventDefault()
        setErrorMsg(null)
        setSuccessMsg(null)
        setMaterialSaving(true)

        if (editingMaterial) {
            const res = await updateRawMaterial(editingMaterial.id, {
                name: matName,
                sku: matSku || undefined,
                category: matCategory || undefined,
                unit: matUnit,
                cost_per_unit: matCost,
                min_stock: matMinStock,
            })
            setMaterialSaving(false)
            if (res.error) {
                setErrorMsg(res.error)
                return
            }
            setRawMaterials((prev) =>
                prev.map((m) =>
                    m.id === editingMaterial.id
                        ? {
                              ...m,
                              name: matName,
                              sku: matSku || null,
                              category: matCategory || null,
                              unit: matUnit,
                              cost_per_unit: matCost,
                              min_stock: matMinStock,
                              is_low_stock: m.total_stock <= matMinStock,
                          }
                        : m
                )
            )
            setSuccessMsg(`Bahan baku '${matName}' berhasil diperbarui.`)
        } else {
            const initialStocksList = Object.entries(matInitialStocks)
                .filter(([, qty]) => qty > 0)
                .map(([branch_id, quantity]) => ({ branch_id, quantity }))

            const res = await createRawMaterial({
                name: matName,
                sku: matSku || undefined,
                category: matCategory || undefined,
                unit: matUnit,
                cost_per_unit: matCost,
                min_stock: matMinStock,
                initial_stocks: initialStocksList,
            })
            setMaterialSaving(false)
            if (res.error) {
                setErrorMsg(res.error)
                return
            }
            if (res.data) {
                const newTotal = initialStocksList.reduce((acc, curr) => acc + curr.quantity, 0)
                const newMatWithStock: RawMaterialWithStocks = {
                    ...res.data,
                    branch_stocks: branches.map((b) => ({
                        branch_id: b.id,
                        branch_name: b.name,
                        quantity: matInitialStocks[b.id] || 0,
                    })),
                    total_stock: newTotal,
                    is_low_stock: newTotal <= matMinStock,
                }
                setRawMaterials((prev) => [newMatWithStock, ...prev])
            }
            setSuccessMsg(`Bahan baku baru '${matName}' berhasil ditambahkan.`)
        }

        setMaterialModalOpen(false)
    }

    async function handleDeleteMaterial(material: RawMaterialWithStocks) {
        if (!confirm(`Hapus bahan baku '${material.name}'?`)) return
        setErrorMsg(null)
        setSuccessMsg(null)

        const res = await deleteRawMaterial(material.id)
        if (res.error) {
            setErrorMsg(res.error)
            return
        }
        setRawMaterials((prev) => prev.filter((m) => m.id !== material.id))
        setSuccessMsg(`Bahan baku '${material.name}' berhasil dihapus.`)
    }

    // ── HANDLERS: STOK INDUK (GLOBAL) ────────────────────────────────────────────
    function openGlobalStockModal(material: RawMaterialWithStocks) {
        setGlobalStockMaterial(material)
        setGlobalStockInput(material.stock ?? 0)
        setGlobalStockModalOpen(true)
        setErrorMsg(null)
    }

    async function handleSaveGlobalStock(e: React.FormEvent) {
        e.preventDefault()
        if (!globalStockMaterial) return
        setGlobalStockSaving(true)
        setErrorMsg(null)

        const res = await updateRawMaterialGlobalStock(globalStockMaterial.id, globalStockInput)
        setGlobalStockSaving(false)
        if (res.error) {
            setErrorMsg(res.error)
            return
        }

        setRawMaterials((prev) =>
            prev.map((m) =>
                m.id === globalStockMaterial.id ? { ...m, stock: globalStockInput } : m
            )
        )
        setSuccessMsg(
            `Stok gudang induk untuk '${globalStockMaterial.name}' berhasil diubah menjadi ${globalStockInput} ${globalStockMaterial.unit}.`
        )
        setGlobalStockModalOpen(false)
    }

    // ── HANDLERS: STOCK ADJUSTMENT & TRANSFER ────────────────────────────────────
    function openAdjustModal(material: RawMaterialWithStocks, defaultType: 'adjustment' | 'waste' | 'transfer' = 'adjustment') {
        setAdjustMaterial(material)
        setAdjustBranchId(isOwner ? branches[0]?.id || '' : currentBranchId || branches[0]?.id || '')
        setAdjustType(defaultType)
        setAdjustQuantity(0)
        setTransferTargetBranch(branches.find((b) => b.id !== (isOwner ? branches[0]?.id : currentBranchId))?.id || '')
        setAdjustNotes('')
        setAdjustModalOpen(true)
        setErrorMsg(null)
    }

    async function handleSaveStockAdjustment(e: React.FormEvent) {
        e.preventDefault()
        if (!adjustMaterial) return
        setErrorMsg(null)
        setSuccessMsg(null)
        setAdjustSaving(true)

        if (adjustType === 'transfer') {
            if (!transferTargetBranch) {
                setAdjustSaving(false)
                setErrorMsg('Pilih cabang tujuan transfer.')
                return
            }
            const res = await recordStockTransfer({
                raw_material_id: adjustMaterial.id,
                source_branch_id: adjustBranchId,
                target_branch_id: transferTargetBranch,
                quantity: adjustQuantity,
                notes: adjustNotes || undefined,
            })
            setAdjustSaving(false)
            if (res.error) {
                setErrorMsg(res.error)
                return
            }
            setSuccessMsg(`Transfer stok ${adjustQuantity} ${adjustMaterial.unit} berhasil dicatat.`)
            // Update local stock state
            setRawMaterials((prev) =>
                prev.map((m) => {
                    if (m.id !== adjustMaterial.id) return m
                    const updatedStocks = m.branch_stocks.map((s) => {
                        if (s.branch_id === adjustBranchId) return { ...s, quantity: Math.max(0, s.quantity - adjustQuantity) }
                        if (s.branch_id === transferTargetBranch) return { ...s, quantity: s.quantity + adjustQuantity }
                        return s
                    })
                    return { ...m, branch_stocks: updatedStocks }
                })
            )
        } else {
            const res = await recordStockAdjustment({
                raw_material_id: adjustMaterial.id,
                branch_id: adjustBranchId,
                mutation_type: adjustType,
                quantity_change: adjustQuantity,
                notes: adjustNotes || undefined,
            })
            setAdjustSaving(false)
            if (res.error) {
                setErrorMsg(res.error)
                return
            }
            const label = adjustType === 'waste' ? 'Pembuangan bahan (waste)' : 'Penyesuaian stok opname'
            setSuccessMsg(`${label} berhasil disimpan ke kartu mutasi.`)

            // Update local state
            setRawMaterials((prev) =>
                prev.map((m) => {
                    if (m.id !== adjustMaterial.id) return m
                    const diff = adjustType === 'waste' ? -Math.abs(adjustQuantity) : adjustQuantity
                    const updatedStocks = m.branch_stocks.map((s) => {
                        if (s.branch_id === adjustBranchId) return { ...s, quantity: Math.max(0, s.quantity + diff) }
                        return s
                    })
                    const newTotal = updatedStocks.reduce((a, b) => a + b.quantity, 0)
                    return { ...m, branch_stocks: updatedStocks, total_stock: newTotal, is_low_stock: newTotal <= m.min_stock }
                })
            )
        }

        setAdjustModalOpen(false)
    }

    // ── HANDLERS: SUPPLIERS ──────────────────────────────────────────────────────
    function openCreateSupplierModal() {
        setEditingSupplier(null)
        setSupName('')
        setSupPhone('')
        setSupEmail('')
        setSupAddress('')
        setSupBank('')
        setSupNotes('')
        setSupplierModalOpen(true)
        setErrorMsg(null)
    }

    function openEditSupplierModal(s: Supplier) {
        setEditingSupplier(s)
        setSupName(s.name)
        setSupPhone(s.phone || '')
        setSupEmail(s.email || '')
        setSupAddress(s.address || '')
        setSupBank(s.bank_details || '')
        setSupNotes(s.notes || '')
        setSupplierModalOpen(true)
        setErrorMsg(null)
    }

    async function handleSaveSupplier(e: React.FormEvent) {
        e.preventDefault()
        setErrorMsg(null)
        setSuccessMsg(null)
        setSupplierSaving(true)

        if (editingSupplier) {
            const res = await updateSupplier(editingSupplier.id, {
                name: supName,
                phone: supPhone || undefined,
                email: supEmail || undefined,
                address: supAddress || undefined,
                bank_details: supBank || undefined,
                notes: supNotes || undefined,
            })
            setSupplierSaving(false)
            if (res.error) {
                setErrorMsg(res.error)
                return
            }
            setSuppliers((prev) =>
                prev.map((s) =>
                    s.id === editingSupplier.id
                        ? {
                              ...s,
                              name: supName,
                              phone: supPhone || null,
                              email: supEmail || null,
                              address: supAddress || null,
                              bank_details: supBank || null,
                              notes: supNotes || null,
                          }
                        : s
                )
            )
            setSuccessMsg(`Supplier '${supName}' berhasil diperbarui.`)
        } else {
            const res = await createSupplier({
                name: supName,
                phone: supPhone || undefined,
                email: supEmail || undefined,
                address: supAddress || undefined,
                bank_details: supBank || undefined,
                notes: supNotes || undefined,
            })
            setSupplierSaving(false)
            if (res.error) {
                setErrorMsg(res.error)
                return
            }
            if (res.data) {
                setSuppliers((prev) => [res.data, ...prev])
            }
            setSuccessMsg(`Supplier baru '${supName}' berhasil didaftarkan.`)
        }

        setSupplierModalOpen(false)
    }

    async function handleDeleteSupplier(s: Supplier) {
        if (!confirm(`Hapus supplier '${s.name}'?`)) return
        setErrorMsg(null)
        setSuccessMsg(null)

        const res = await deleteSupplier(s.id)
        if (res.error) {
            setErrorMsg(res.error)
            return
        }
        setSuppliers((prev) => prev.filter((item) => item.id !== s.id))
        setSuccessMsg(`Supplier '${s.name}' berhasil dihapus.`)
    }

    async function handleViewSupplierDetail(s: Supplier) {
        setViewingSupplier(s)
        setSupplierDetailModalOpen(true)
        setLoadingSupplierDetail(true)
        const res = await getSupplierDetailWithPurchases(s.id)
        setLoadingSupplierDetail(false)
        if (res.data) {
            setSupplierPurchases((res.data.purchases as unknown as PurchaseDetail[]) || [])
        }
    }

    // ── HANDLERS: PURCHASES FORM ─────────────────────────────────────────────────
    function handlePurchaseItemChange(index: number, field: keyof PurchaseItemInput, value: string | number) {
        setPurchaseItems((prev) => {
            const copy = [...prev]
            if (field === 'raw_material_id') {
                const selectedMat = rawMaterials.find((m) => m.id === value)
                if (selectedMat) {
                    copy[index] = {
                        ...copy[index],
                        raw_material_id: selectedMat.id,
                        item_name: selectedMat.name,
                        unit: selectedMat.unit,
                        price: copy[index].price || selectedMat.cost_per_unit || 0,
                    }
                } else {
                    copy[index] = {
                        ...copy[index],
                        raw_material_id: null,
                    }
                }
            } else {
                copy[index] = { ...copy[index], [field]: value }
            }
            return copy
        })
    }

    function addPurchaseRow() {
        setPurchaseItems((prev) => [
            ...prev,
            { raw_material_id: null, item_name: '', quantity: 1, price: 0, unit: 'pcs' },
        ])
    }

    function removePurchaseRow(index: number) {
        if (purchaseItems.length <= 1) return
        setPurchaseItems((prev) => prev.filter((_, i) => i !== index))
    }

    const currentPurchaseTotal = purchaseItems.reduce(
        (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.price) || 0),
        0
    )

    async function handleSubmitPurchase(e: React.FormEvent) {
        e.preventDefault()
        setErrorMsg(null)
        setSuccessMsg(null)
        setPurchaseSaving(true)

        const chosenSupplier = suppliers.find((s) => s.id === purchaseSupplierId)
        const effectiveSupplierName = chosenSupplier ? chosenSupplier.name : customSupplierName

        const selectedAccount = accounts.find((a) => a.id === purchaseAccountId)
        const paymentMethod = purchasePaymentStatus === 'paid'
            ? (selectedAccount?.type === 'bank' ? 'transfer' : 'cash')
            : 'tempo'

        const res = await addPurchase({
            branch_id: selectedBranch,
            supplier_id: purchaseSupplierId || null,
            supplier: effectiveSupplierName,
            purchase_date: purchaseDate,
            items: purchaseItems,
            distribution_mode: distributionMode,
            payment_status: purchasePaymentStatus,
            payment_method: paymentMethod,
            account_id: purchasePaymentStatus === 'paid' ? (purchaseAccountId || null) : null,
            due_date: purchasePaymentStatus === 'unpaid' ? (purchaseDueDate || null) : null,
        })

        setPurchaseSaving(false)

        if (res.error) {
            setErrorMsg(res.error)
            return
        }

        const isAllBranches = selectedBranch === 'all' && branches.length > 1
        setSuccessMsg(
            isAllBranches
                ? `Catatan belanja bahan baku berhasil disimpan & didistribusikan ke seluruh cabang (${branches.length} cabang)!`
                : 'Catatan belanja bahan baku berhasil disimpan & stok bahan otomatis bertambah!'
        )
        setPurchaseModalOpen(false)
        setPurchaseSupplierId('')
        setCustomSupplierName('')
        setPurchasePaymentStatus('paid')
        setPurchaseAccountId(defaultAccount?.id || '')
        setPurchaseDueDate('')
        setPurchaseItems([{ raw_material_id: null, item_name: '', quantity: 1, price: 0, unit: 'pcs' }])
        router.refresh()

        // Refetch / update local stock quantities if linked to master
        setRawMaterials((prev) =>
            prev.map((m) => {
                const boughtItem = purchaseItems.find((p) => p.raw_material_id === m.id)
                if (!boughtItem) return m
                const rawQty = Number(boughtItem.quantity) || 0

                let updatedBranchStocks = m.branch_stocks
                if (selectedBranch === 'all') {
                    const count = branches.length
                    updatedBranchStocks = m.branch_stocks.map((bs, bIdx) => {
                        let addQty = rawQty
                        if (distributionMode === 'split' && count > 1) {
                            const baseQty = Math.floor((rawQty / count) * 100) / 100
                            addQty = bIdx === count - 1 ? Number((rawQty - baseQty * (count - 1)).toFixed(2)) : baseQty
                        }
                        return {
                            ...bs,
                            quantity: bs.quantity + addQty,
                        }
                    })
                } else {
                    updatedBranchStocks = m.branch_stocks.map((bs) =>
                        bs.branch_id === selectedBranch ? { ...bs, quantity: bs.quantity + rawQty } : bs
                    )
                }

                const newTotal = updatedBranchStocks.reduce((a, b) => a + b.quantity, 0)
                return {
                    ...m,
                    cost_per_unit: Number(boughtItem.price) || m.cost_per_unit,
                    branch_stocks: updatedBranchStocks,
                    total_stock: newTotal,
                    is_low_stock: newTotal <= m.min_stock,
                }
            })
        )
    }

    async function handleDeletePurchase(id: string) {
        if (!confirm('Hapus transaksi pembelian ini? Jika bahan telah tercatat di stok cabang, saldo akan dikurangkan kembali.')) return
        setDeletingPurchaseId(id)
        setErrorMsg(null)
        setSuccessMsg(null)

        const res = await deletePurchase(id)
        setDeletingPurchaseId(null)

        if (res.error) {
            setErrorMsg(res.error)
            return
        }

        setPurchases((prev) => prev.filter((p) => p.id !== id))
        setSuccessMsg('Catatan pembelian bahan baku berhasil dihapus.')
    }

    // ── FILTERED DATA LISTS ──────────────────────────────────────────────────────
    const filteredMaterials = rawMaterials.filter((m) => {
        const matchesSearch =
            m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (m.sku && m.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (m.category && m.category.toLowerCase().includes(searchTerm.toLowerCase()))
        return matchesSearch
    })

    const filteredPurchases = purchases.filter((p) => {
        const matchesBranch = filterBranch === 'all' || p.branch_id === filterBranch
        const matchesSearch =
            (p.supplier && p.supplier.toLowerCase().includes(searchTerm.toLowerCase())) ||
            p.purchase_items.some((it) => it.item_name.toLowerCase().includes(searchTerm.toLowerCase()))
        return matchesBranch && matchesSearch
    })

    const filteredMutations = mutations.filter((m) => {
        const matchesBranch = filterBranch === 'all' || m.branch_id === filterBranch
        const matchesType = mutationTypeFilter === 'all' || m.mutation_type === mutationTypeFilter
        const matchesSearch =
            (m.raw_materials?.name && m.raw_materials.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (m.notes && m.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (m.reference_id && m.reference_id.toLowerCase().includes(searchTerm.toLowerCase()))
        return matchesBranch && matchesType && matchesSearch
    })

    const filteredSuppliers = suppliers.filter((s) => {
        return (
            s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.phone && s.phone.includes(searchTerm)) ||
            (s.address && s.address.toLowerCase().includes(searchTerm.toLowerCase()))
        )
    })

    const mutationBadgeClass: Record<MutationType, string> = {
        purchase_in: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        opening_balance: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        adjustment: 'bg-amber-50 text-amber-700 border-amber-200',
        waste: 'bg-rose-50 text-rose-700 border-rose-200',
        transfer_in: 'bg-purple-50 text-purple-700 border-purple-200',
        transfer_out: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    }

    const mutationLabel: Record<MutationType, string> = {
        purchase_in: 'Belanja Masuk',
        opening_balance: 'Saldo Awal',
        adjustment: 'Penyesuaian Opname',
        waste: 'Rusak / Waste',
        transfer_in: 'Transfer Masuk',
        transfer_out: 'Transfer Keluar',
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        Manajemen Bahan Baku & Inventaris
                    </h1>
                    <p className="mt-1 text-xs font-semibold text-emerald-800">
                        {filterBranch === 'all'
                            ? `Konsolidasi Semua Cabang (${branches.length} cabang)`
                            : `Cabang: ${branches.find((b) => b.id === filterBranch)?.name || 'Terpilih'}`}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {activeSection === 'stok' && isOwner && (
                        <button
                            type="button"
                            onClick={openCreateMaterialModal}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-900 active:bg-emerald-950 transition cursor-pointer"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span>Tambah Bahan Baku</span>
                        </button>
                    )}

                    {activeSection === 'belanja' && isOwner && (
                        <button
                            type="button"
                            onClick={() => setPurchaseModalOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-900 active:bg-emerald-950 transition cursor-pointer"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span>Catat Belanja</span>
                        </button>
                    )}

                    {activeSection === 'mutasi' && isOwner && (
                        <button
                            type="button"
                            onClick={() => {
                                setAdjustMaterial(rawMaterials[0] || null)
                                setAdjustType('adjustment')
                                setAdjustModalOpen(true)
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-900 active:bg-emerald-950 transition cursor-pointer"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span>Catat Mutasi</span>
                        </button>
                    )}

                    {activeSection === 'supplier' && isOwner && (
                        <button
                            type="button"
                            onClick={openCreateSupplierModal}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-900 active:bg-emerald-950 transition cursor-pointer"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                            </svg>
                            <span>Tambah Supplier</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Navigasi Sub-Tab Bersih Tanpa Emoji & Tanpa Duplikasi */}
            <SubTabNav
                items={[
                    {
                        href: '/dashboard/bahan-baku?tab=materials',
                        label: 'Master Bahan Baku',
                        active: activeSection === 'stok',
                        badge: rawMaterials.length,
                    },
                    {
                        href: '/dashboard/bahan-baku?tab=purchases',
                        label: 'Belanja & Pembelian',
                        active: activeSection === 'belanja',
                        badge: purchases.length,
                    },
                    {
                        href: '/dashboard/bahan-baku?tab=ledger',
                        label: 'Kartu Mutasi',
                        active: activeSection === 'mutasi',
                        badge: mutations.length,
                    },
                    {
                        href: '/dashboard/bahan-baku?tab=supplier',
                        label: 'Data Supplier',
                        active: activeSection === 'supplier',
                        badge: suppliers.length,
                    },
                ]}
            />

            {/* Alert Messages */}
            {errorMsg && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800 flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{errorMsg}</span>
                </div>
            )}

            {successMsg && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{successMsg}</span>
                </div>
            )}

            {/* Stat Strip Horizontal (Clean & Compact) */}
            <div className="rounded-lg border border-slate-200 bg-white shadow-2xs overflow-hidden">
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-200">
                    <div className="p-3 sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Total Bahan Baku
                        </span>
                        <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                            {totalMaterialsCount} <span className="text-xs font-normal text-slate-500">jenis</span>
                        </div>
                    </div>

                    <div className="p-3 sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Peringatan Stok Menipis
                        </span>
                        <div className="mt-1 text-base sm:text-lg font-bold tabular-nums">
                            <span className={lowStockMaterials.length > 0 ? 'text-rose-600 font-bold' : 'text-slate-900'}>
                                {lowStockMaterials.length}
                            </span>{' '}
                            <span className="text-xs font-normal text-slate-500">bahan</span>
                        </div>
                    </div>

                    <div className="p-3 sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Estimasi Nilai HPP Stok
                        </span>
                        <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 tabular-nums truncate">
                            {fmt(totalInventoryValue)}
                        </div>
                    </div>

                    <div className="p-3 sm:p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Total Supplier
                        </span>
                        <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                            {suppliers.length} <span className="text-xs font-normal text-slate-500">mitra</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <div className="relative flex-1 max-w-md">
                    <input
                        type="text"
                        placeholder="Cari nama, SKU, atau kategori..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <svg className="w-4 h-4 text-slate-400 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Filter Tipe Mutasi */}
                    {activeSection === 'mutasi' && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Tipe:</span>
                            <select
                                value={mutationTypeFilter}
                                onChange={(e) => setMutationTypeFilter(e.target.value)}
                                className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                                <option value="all">Semua Mutasi</option>
                                <option value="purchase_in">Belanja Masuk</option>
                                <option value="opening_balance">Saldo Awal</option>
                                <option value="adjustment">Penyesuaian Opname</option>
                                <option value="waste">Rusak / Waste</option>
                                <option value="transfer_in">Transfer Masuk</option>
                                <option value="transfer_out">Transfer Keluar</option>
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {/* TAB 1: MASTER STOK BAHAN BAKU                                           */}
            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {activeSection === 'stok' && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="py-3 px-4">Nama Bahan & SKU</th>
                                    <th className="py-3 px-4">Kategori</th>
                                    <th className="py-3 px-4">Satuan Dasar</th>
                                    <th className="py-3 px-4">HPP Acuan</th>
                                    <th className="py-3 px-4">Batas Min</th>
                                    <th className="py-3 px-4">
                                        {filterBranch === 'all' ? 'Stok Induk & Cabang' : 'Stok Cabang'}
                                    </th>
                                    <th className="py-3 px-4">Status Stok</th>
                                    <th className="py-3 px-4 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredMaterials.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-400">
                                            Belum ada data bahan baku yang cocok.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredMaterials.map((m) => {
                                        const branchStock =
                                            filterBranch === 'all'
                                                ? null
                                                : m.branch_stocks.find((bs) => bs.branch_id === filterBranch)?.quantity || 0

                                        return (
                                            <tr key={m.id} className="hover:bg-slate-50/75 transition">
                                                <td className="py-3.5 px-4">
                                                    <div className="font-semibold text-slate-900">{m.name}</div>
                                                    {m.sku && <div className="text-xs font-mono text-slate-400">SKU: {m.sku}</div>}
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                                        {m.category || 'Umum'}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4 font-mono font-medium text-slate-700">
                                                    {m.unit}
                                                </td>
                                                <td className="py-3.5 px-4 font-mono text-slate-700">
                                                    {fmt(m.cost_per_unit)}
                                                </td>
                                                <td className="py-3.5 px-4 font-mono text-slate-500">
                                                    {fmtQty(m.min_stock)} {m.unit}
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    {filterBranch === 'all' ? (
                                                        <div className="space-y-1.5">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                                                    Induk (Global)
                                                                </span>
                                                                <span className="font-bold text-slate-900">{fmtQty(m.stock ?? 0)} {m.unit}</span>
                                                                {isOwner && (
                                                                    <button
                                                                        onClick={() => openGlobalStockModal(m)}
                                                                        className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-900 underline ml-1"
                                                                        title="Atur Stok Induk / Global"
                                                                    >
                                                                        Edit
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-slate-500 flex flex-wrap gap-1.5">
                                                                <span className="text-[10px] text-slate-400">Alokasi:</span>
                                                                {m.branch_stocks.map((bs) => (
                                                                    <span key={bs.branch_id} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">
                                                                        {bs.branch_name}: <strong>{fmtQty(bs.quantity)}</strong>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-0.5">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                                                    Cabang
                                                                </span>
                                                                <span className="font-bold text-slate-900">{fmtQty(branchStock ?? 0)} {m.unit}</span>
                                                            </div>
                                                            <div className="text-[11px] text-slate-400">
                                                                Tersedia di Induk: {fmtQty(m.stock ?? 0)} {m.unit}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    {m.total_stock <= 0 ? (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                                                            Habis
                                                        </span>
                                                    ) : m.is_low_stock ? (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-xs font-medium text-rose-700">
                                                            ⚠️ Menipis
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                                            ✓ Aman
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-4 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => openAdjustModal(m, 'adjustment')}
                                                            title="Penyesuaian Stok / Opname / Waste"
                                                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                                                        >
                                                            Koreksi
                                                        </button>
                                                        {isOwner && (
                                                            <>
                                                                <button
                                                                    onClick={() => openEditMaterialModal(m)}
                                                                    title="Edit Master Bahan"
                                                                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteMaterial(m)}
                                                                    title="Hapus Bahan"
                                                                    className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition"
                                                                >
                                                                    Hapus
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {/* TAB 2: CATAT BELANJA BAHAN BAKU & RIWAYAT PEMBELIAN                      */}
            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {activeSection === 'belanja' && (
                <div className="space-y-6">
                    {/* Form Catat Pembelian di Modal On-Demand */}
                    {isOwner && purchaseModalOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={() => setPurchaseModalOpen(false)} />
                            <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150">
                                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                                    <div>
                                        <h3 className="text-base font-bold text-slate-900">Catat Belanja Bahan Baku</h3>
                                        <p className="text-xs text-slate-500">
                                            Input pembelian pasokan bahan baku dari supplier. Stok cabang akan bertambah secara atomik.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setPurchaseModalOpen(false)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                <form onSubmit={handleSubmitPurchase} className="mt-2 space-y-4">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Cabang Penerima <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            value={selectedBranch}
                                            onChange={(e) => setSelectedBranch(e.target.value)}
                                            required
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                        >
                                            {isOwner && branches.length > 0 && (
                                                <option value="all">
                                                    🌐 Semua Cabang ({branches.length} Cabang)
                                                </option>
                                            )}
                                            {branches.map((b) => (
                                                <option key={b.id} value={b.id}>
                                                    {b.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Supplier Terdaftar
                                        </label>
                                        <select
                                            value={purchaseSupplierId}
                                            onChange={(e) => {
                                                setPurchaseSupplierId(e.target.value)
                                                if (e.target.value) setCustomSupplierName('')
                                            }}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                        >
                                            <option value="">-- Pilih Supplier / Manual --</option>
                                            {suppliers.map((s) => (
                                                <option key={s.id} value={s.id}>
                                                    {s.name} {s.phone ? `(${s.phone})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Nama Supplier Bebas (Opsional)
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Nama toko / pasar / warung..."
                                            value={customSupplierName}
                                            onChange={(e) => setCustomSupplierName(e.target.value)}
                                            disabled={Boolean(purchaseSupplierId)}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                        />
                                    </div>
                                </div>

                                {selectedBranch === 'all' && branches.length > 1 && (
                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <div>
                                                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                                                    Distribusi Belanja ke Seluruh Cabang ({branches.length} Cabang)
                                                </span>
                                                <p className="text-[11px] text-emerald-800 mt-0.5">
                                                    Pilih bagaimana kuantitas & nominal belanja dialokasikan ke masing-masing cabang.
                                                </p>
                                            </div>
                                            <div className="inline-flex rounded-lg bg-white p-0.5 border border-emerald-200 shadow-xs">
                                                <button
                                                    type="button"
                                                    onClick={() => setDistributionMode('split')}
                                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                                                        distributionMode === 'split'
                                                            ? 'bg-emerald-800 text-white shadow-xs'
                                                            : 'text-slate-600 hover:text-slate-900'
                                                    }`}
                                                >
                                                    Bagi Rata
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDistributionMode('each')}
                                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                                                        distributionMode === 'each'
                                                            ? 'bg-emerald-800 text-white shadow-xs'
                                                            : 'text-slate-600 hover:text-slate-900'
                                                    }`}
                                                >
                                                    Masing-masing Cabang
                                                </button>
                                            </div>
                                        </div>

                                        <div className="text-xs bg-white/90 rounded-lg p-2.5 border border-emerald-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                            <div className="text-slate-700">
                                                {distributionMode === 'split' ? (
                                                    <span>
                                                        <strong>Mode Bagi Rata:</strong> Kuantitas item dibagi rata ke {branches.length} cabang. Total belanja bisnis tetap <strong>{fmt(currentPurchaseTotal)}</strong>.
                                                    </span>
                                                ) : (
                                                    <span>
                                                        <strong>Mode Masing-masing Cabang:</strong> Setiap cabang menerima kuantitas penuh yang diinput. Total belanja bisnis menjadi <strong>{fmt(currentPurchaseTotal * branches.length)}</strong> ({branches.length} cabang × {fmt(currentPurchaseTotal)}).
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[11px] font-medium text-emerald-900 bg-emerald-100/70 px-2.5 py-1 rounded-full shrink-0">
                                                Target: {branches.map((b) => b.name).join(', ')}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Tanggal Pembelian <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="date"
                                            value={purchaseDate}
                                            onChange={(e) => setPurchaseDate(e.target.value)}
                                            required
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Status Pembayaran <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            value={purchasePaymentStatus}
                                            onChange={(e) => setPurchasePaymentStatus(e.target.value as 'paid' | 'unpaid')}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 font-medium"
                                        >
                                            <option value="paid">🟢 Lunas Langsung (Kas / Bank)</option>
                                            <option value="unpaid">🔴 Tempo / Utang Supplier</option>
                                        </select>
                                    </div>

                                    {purchasePaymentStatus === 'paid' ? (
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                Sumber Kas / Bank Pembayaran
                                            </label>
                                            <select
                                                value={purchaseAccountId}
                                                onChange={(e) => setPurchaseAccountId(e.target.value)}
                                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                            >
                                                {accounts.length === 0 ? (
                                                    <option value="">Kas Utama (Otomatis)</option>
                                                ) : (
                                                    accounts.map((acc) => (
                                                        <option key={acc.id} value={acc.id}>
                                                            {acc.name} ({acc.type === 'bank' ? 'Bank' : 'Kas/Tunai'})
                                                        </option>
                                                    ))
                                                )}
                                            </select>
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                Jatuh Tempo Pembayaran
                                            </label>
                                            <input
                                                type="date"
                                                value={purchaseDueDate}
                                                onChange={(e) => setPurchaseDueDate(e.target.value)}
                                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Dynamic Rows */}
                                <div className="mt-4 border-t border-slate-100 pt-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                                            Rincian Bahan Baku Belanja
                                        </label>
                                        <button
                                            type="button"
                                            onClick={addPurchaseRow}
                                            className="text-xs font-semibold text-emerald-800 hover:text-emerald-800 transition"
                                        >
                                            + Tambah Baris Bahan
                                        </button>
                                    </div>

                                    <div className="space-y-3">
                                        {purchaseItems.map((item, idx) => (
                                            <div
                                                key={idx}
                                                className="grid grid-cols-12 gap-2 items-center rounded-xl bg-slate-50 p-2.5 border border-slate-100"
                                            >
                                                <div className="col-span-12 sm:col-span-4">
                                                    <select
                                                        value={item.raw_material_id || ''}
                                                        onChange={(e) => handlePurchaseItemChange(idx, 'raw_material_id', e.target.value)}
                                                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                                                    >
                                                        <option value="">-- Pilih Master Bahan Baku --</option>
                                                        {rawMaterials.map((m) => (
                                                            <option key={m.id} value={m.id}>
                                                                {m.name} ({m.unit})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="col-span-12 sm:col-span-3">
                                                    <input
                                                        type="text"
                                                        placeholder="Nama item belanja..."
                                                        value={item.item_name}
                                                        onChange={(e) => handlePurchaseItemChange(idx, 'item_name', e.target.value)}
                                                        required
                                                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                                                    />
                                                </div>

                                                <div className="col-span-4 sm:col-span-1">
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        min="0.01"
                                                        placeholder="Qty"
                                                        value={item.quantity}
                                                        onChange={(e) => handlePurchaseItemChange(idx, 'quantity', e.target.value)}
                                                        required
                                                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                                                    />
                                                </div>

                                                <div className="col-span-3 sm:col-span-1 text-xs font-mono">
                                                    {item.raw_material_id ? (
                                                        <span className="text-slate-500">{item.unit || 'pcs'}</span>
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            placeholder="Satuan (kg/pcs)"
                                                            value={item.unit || 'pcs'}
                                                            onChange={(e) => handlePurchaseItemChange(idx, 'unit', e.target.value)}
                                                            className="w-full rounded-lg border border-slate-200 px-1.5 py-1 text-xs font-mono bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                                                        />
                                                    )}
                                                </div>

                                                <div className="col-span-4 sm:col-span-2">
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        min="0"
                                                        placeholder="Harga satuan"
                                                        value={item.price}
                                                        onChange={(e) => handlePurchaseItemChange(idx, 'price', e.target.value)}
                                                        required
                                                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                                                    />
                                                </div>

                                                <div className="col-span-1 text-right">
                                                    {purchaseItems.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removePurchaseRow(idx)}
                                                            className="text-red-500 hover:text-red-700 p-1"
                                                            title="Hapus baris"
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
                                    <div className="text-sm font-semibold text-slate-700">
                                        Total Belanja:{' '}
                                        <span className="text-lg font-bold text-slate-900 font-mono">
                                            {fmt(
                                                selectedBranch === 'all' && distributionMode === 'each' && branches.length > 1
                                                    ? currentPurchaseTotal * branches.length
                                                    : currentPurchaseTotal
                                            )}
                                        </span>
                                        {selectedBranch === 'all' && branches.length > 1 && (
                                            <span className="ml-2 text-xs font-normal text-slate-500">
                                                ({distributionMode === 'split'
                                                    ? `dibagi rata ke ${branches.length} cabang`
                                                    : `total untuk ${branches.length} cabang`})
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setPurchaseModalOpen(false)}
                                            className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                                        >
                                            Batal
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={purchaseSaving}
                                            className="rounded-lg bg-emerald-800 px-5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-900 active:bg-emerald-950 disabled:opacity-50 transition cursor-pointer"
                                        >
                                            {purchaseSaving
                                                ? 'Menyimpan...'
                                                : selectedBranch === 'all' && branches.length > 1
                                                ? `Simpan Belanja & Bagi ke ${branches.length} Cabang`
                                                : 'Simpan Pembelian Bahan'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                            </div>
                        </div>
                    )}

                    {/* Tabel Riwayat Belanja (Langsung Tampil di Halaman) */}
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100">
                            <h3 className="font-bold text-slate-900">Riwayat Belanja Bahan Baku</h3>
                            <p className="text-xs text-slate-500">Daftar transaksi belanja pasokan yang telah tercatat</p>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-slate-600">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                    <tr>
                                        <th className="py-3 px-4">Tanggal & No. Nota</th>
                                        <th className="py-3 px-4">Cabang</th>
                                        <th className="py-3 px-4">Supplier</th>
                                        <th className="py-3 px-4">Status Bayar</th>
                                        <th className="py-3 px-4">Rincian Bahan</th>
                                        <th className="py-3 px-4 text-right">Total Biaya</th>
                                        {isOwner && <th className="py-3 px-4 text-right">Aksi</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredPurchases.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="py-12 text-center text-slate-400">
                                                Belum ada riwayat belanja yang sesuai filter.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredPurchases.map((p) => (
                                            <tr key={p.id} className="hover:bg-slate-50/75 transition">
                                                <td className="py-3 px-4">
                                                    <div className="font-semibold text-slate-900">{p.purchase_date}</div>
                                                    <div className="text-xs font-mono text-slate-400">#{p.id.slice(0, 8)}</div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className="font-medium text-slate-800">{p.branches?.name || 'Cabang'}</span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className="font-medium text-slate-800">
                                                        {p.suppliers?.name || p.supplier || 'Supplier Umum'}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    {p.payment_status === 'unpaid' ? (
                                                        <div className="space-y-0.5">
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                                                Utang / Tempo
                                                            </span>
                                                            {p.due_date && (
                                                                <div className="text-[11px] text-slate-500">
                                                                    Jatuh tempo: {p.due_date}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                                                Lunas
                                                            </span>
                                                            <div className="text-[11px] text-slate-500 mt-0.5">
                                                                {p.payment_method === 'transfer' ? 'Transfer Bank' : 'Kas Tunai'}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="text-xs space-y-0.5">
                                                        {p.purchase_items.map((it) => (
                                                            <div key={it.id} className="text-slate-700">
                                                                • {it.item_name} ({fmtQty(it.quantity)} {it.unit || it.raw_materials?.unit || 'pcs'}) @ {fmt(it.price)}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                                                    {fmt(p.total)}
                                                </td>
                                                {isOwner && (
                                                    <td className="py-3 px-4 text-right">
                                                        <button
                                                            onClick={() => handleDeletePurchase(p.id)}
                                                            disabled={deletingPurchaseId === p.id}
                                                            className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50 transition"
                                                        >
                                                            {deletingPurchaseId === p.id ? 'Menghapus...' : 'Hapus'}
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {/* TAB 3: KARTU MUTASI LEDGER (INVENTORY MUTATIONS)                         */}
            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {activeSection === 'mutasi' && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-slate-900">Kartu Mutasi Inventaris (Stock Ledger)</h3>
                            <p className="text-xs text-slate-500">
                                Catatan perubahan saldo stok immutable (opening balance, belanja, opname, waste, transfer).
                            </p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="py-3 px-4">Waktu</th>
                                    <th className="py-3 px-4">Bahan Baku</th>
                                    <th className="py-3 px-4">Cabang</th>
                                    <th className="py-3 px-4">Tipe Mutasi</th>
                                    <th className="py-3 px-4 text-right">Perubahan</th>
                                    <th className="py-3 px-4 text-right">Saldo Akhir</th>
                                    <th className="py-3 px-4">Catatan / Ref</th>
                                    <th className="py-3 px-4">Operator</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono text-xs">
                                {filteredMutations.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-400 font-sans">
                                            Belum ada catatan mutasi stok pada periode / filter ini.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredMutations.map((m) => {
                                        const isPositive = Number(m.quantity_change) > 0
                                        const badgeClass = mutationBadgeClass[m.mutation_type] || 'bg-slate-100 text-slate-700'
                                        const label = mutationLabel[m.mutation_type] || m.mutation_type

                                        return (
                                            <tr key={m.id} className="hover:bg-slate-50/75 transition">
                                                <td className="py-3 px-4 text-slate-500 font-sans">
                                                    {new Date(m.created_at).toLocaleString('id-ID', {
                                                        dateStyle: 'short',
                                                        timeStyle: 'short',
                                                    })}
                                                </td>
                                                <td className="py-3 px-4 font-sans font-semibold text-slate-900">
                                                    {m.raw_materials?.name || 'Bahan'}
                                                </td>
                                                <td className="py-3 px-4 font-sans text-slate-700">
                                                    {m.branches?.name || 'Cabang'}
                                                </td>
                                                <td className="py-3 px-4 font-sans">
                                                    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
                                                        {label}
                                                    </span>
                                                </td>
                                                <td className={`py-3 px-4 text-right font-bold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {isPositive ? `+${fmtQty(m.quantity_change)}` : fmtQty(m.quantity_change)} {m.raw_materials?.unit}
                                                </td>
                                                <td className="py-3 px-4 text-right font-bold text-slate-900">
                                                    {fmtQty(m.balance_after)} {m.raw_materials?.unit}
                                                </td>
                                                <td className="py-3 px-4 font-sans text-slate-500 max-w-xs truncate">
                                                    {m.notes || m.reference_id || '-'}
                                                </td>
                                                <td className="py-3 px-4 font-sans text-slate-500">
                                                    {m.profiles?.full_name || 'System'}
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {/* TAB 4: MASTER SUPPLIER                                                  */}
            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {activeSection === 'supplier' && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="py-3 px-4">Nama Supplier</th>
                                    <th className="py-3 px-4">Kontak (Telp / Email)</th>
                                    <th className="py-3 px-4">Alamat</th>
                                    <th className="py-3 px-4">Rekening / Pembayaran</th>
                                    <th className="py-3 px-4">Catatan</th>
                                    <th className="py-3 px-4">Status</th>
                                    <th className="py-3 px-4 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredSuppliers.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-slate-400">
                                            Belum ada data supplier yang terdaftar.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSuppliers.map((s) => (
                                        <tr key={s.id} className="hover:bg-slate-50/75 transition">
                                            <td className="py-3.5 px-4 font-semibold text-slate-900">
                                                {s.name}
                                            </td>
                                            <td className="py-3.5 px-4 text-xs">
                                                {s.phone && <div className="text-slate-800 font-mono">📞 {s.phone}</div>}
                                                {s.email && <div className="text-slate-500">✉️ {s.email}</div>}
                                                {!s.phone && !s.email && <span className="text-slate-400">-</span>}
                                            </td>
                                            <td className="py-3.5 px-4 text-xs text-slate-600 max-w-xs truncate">
                                                {s.address || '-'}
                                            </td>
                                            <td className="py-3.5 px-4 text-xs font-mono text-slate-700">
                                                {s.bank_details || '-'}
                                            </td>
                                            <td className="py-3.5 px-4 text-xs text-slate-500 max-w-xs truncate">
                                                {s.notes || '-'}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    s.status === 'active'
                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                        : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                    {s.status === 'active' ? 'Aktif' : 'Non-aktif'}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => handleViewSupplierDetail(s)}
                                                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                                                    >
                                                        Riwayat Belanja
                                                    </button>
                                                    {isOwner && (
                                                        <>
                                                            <button
                                                                onClick={() => openEditSupplierModal(s)}
                                                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteSupplier(s)}
                                                                className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition"
                                                            >
                                                                Hapus
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {/* MODAL: TAMBAH / EDIT MASTER BAHAN BAKU                                   */}
            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {materialModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <h3 className="font-bold text-slate-900">
                                {editingMaterial ? 'Edit Bahan Baku' : 'Tambah Bahan Baku Baru'}
                            </h3>
                            <button
                                onClick={() => setMaterialModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 text-lg"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveMaterial} className="mt-4 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Nama Bahan Baku <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Contoh: Kopi Robusta Grade A, Susu UHT 1L, Cup 16oz"
                                    value={matName}
                                    onChange={(e) => setMatName(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Kode SKU (Opsional)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="BB-001"
                                        value={matSku}
                                        onChange={(e) => setMatSku(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Kategori (Opsional)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Minuman, Packaging, Bumbu..."
                                        value={matCategory}
                                        onChange={(e) => setMatCategory(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Satuan Dasar <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={matUnit}
                                        onChange={(e) => setMatUnit(e.target.value)}
                                        required
                                        className="w-full rounded-xl border border-slate-200 px-2 py-2 text-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                    >
                                        <option value="pcs">pcs</option>
                                        <option value="kg">kg</option>
                                        <option value="gr">gram (gr)</option>
                                        <option value="liter">liter (l)</option>
                                        <option value="ml">mili (ml)</option>
                                        <option value="dus">dus / karton</option>
                                        <option value="lembar">lembar</option>
                                        <option value="pack">pack / bungkus</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        HPP Acuan (Rp)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={matCost}
                                        onChange={(e) => setMatCost(Number(e.target.value))}
                                        className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Batas Min. Stok
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={matMinStock}
                                        onChange={(e) => setMatMinStock(Number(e.target.value))}
                                        className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                    />
                                </div>
                            </div>

                            {/* Saldo awal per cabang jika menambah bahan baru */}
                            {!editingMaterial && (
                                <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                                    <div className="text-xs font-bold text-slate-700 mb-2">
                                        Saldo Awal Stok Per Cabang (Opsional)
                                    </div>
                                    <div className="space-y-2">
                                        {branches.map((b) => (
                                            <div key={b.id} className="flex items-center justify-between text-xs">
                                                <span className="text-slate-600 font-medium">{b.name}</span>
                                                <div className="flex items-center gap-1.5 w-32">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        placeholder="0"
                                                        value={matInitialStocks[b.id] ?? ''}
                                                        onChange={(e) =>
                                                            setMatInitialStocks((prev) => ({
                                                                ...prev,
                                                                [b.id]: Number(e.target.value) || 0,
                                                            }))
                                                        }
                                                        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-right font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                                                    />
                                                    <span className="text-slate-400">{matUnit}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setMaterialModalOpen(false)}
                                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={materialSaving}
                                    className="rounded-xl bg-emerald-800 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-900 disabled:opacity-50 transition"
                                >
                                    {materialSaving ? 'Menyimpan...' : 'Simpan Bahan Baku'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {/* MODAL: KOREKSI STOK / OPNAME / WASTE / TRANSFER                          */}
            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {adjustModalOpen && adjustMaterial && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="font-bold text-slate-900">Koreksi & Mutasi Stok</h3>
                                <p className="text-xs text-slate-500">{adjustMaterial.name} ({adjustMaterial.unit})</p>
                            </div>
                            <button
                                onClick={() => setAdjustModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 text-lg"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveStockAdjustment} className="mt-4 space-y-4">
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 text-xs text-emerald-950">
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-emerald-900">🏢 Stok Gudang Induk (Global):</span>
                                    <span className="font-bold text-emerald-950 font-mono text-sm">
                                        {fmtQty(adjustMaterial.stock ?? 0)} {adjustMaterial.unit}
                                    </span>
                                </div>
                                <p className="mt-1 text-[11px] text-emerald-800">
                                    Menambahkan stok cabang secara manual akan otomatis mengurangi stok gudang induk di atas.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Jenis Mutasi Stok <span className="text-red-500">*</span>
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setAdjustType('adjustment')}
                                        className={`rounded-xl border p-2 text-center text-xs font-medium transition ${
                                            adjustType === 'adjustment'
                                                ? 'border-emerald-800 bg-emerald-50 text-emerald-800 font-bold'
                                                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        Opname / Koreksi
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAdjustType('waste')}
                                        className={`rounded-xl border p-2 text-center text-xs font-medium transition ${
                                            adjustType === 'waste'
                                                ? 'border-rose-600 bg-rose-50 text-rose-700 font-bold'
                                                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        🗑️ Rusak / Waste
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAdjustType('transfer')}
                                        className={`rounded-xl border p-2 text-center text-xs font-medium transition ${
                                            adjustType === 'transfer'
                                                ? 'border-purple-600 bg-purple-50 text-purple-700 font-bold'
                                                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        🔄 Antar Cabang
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    {adjustType === 'transfer' ? 'Cabang Asal' : 'Cabang'}
                                </label>
                                <select
                                    value={adjustBranchId}
                                    onChange={(e) => setAdjustBranchId(e.target.value)}
                                    disabled={!isOwner}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                >
                                    {branches.map((b) => {
                                        const currentStock = adjustMaterial.branch_stocks.find((bs) => bs.branch_id === b.id)?.quantity || 0
                                        return (
                                            <option key={b.id} value={b.id}>
                                                {b.name} (Stok: {fmtQty(currentStock)} {adjustMaterial.unit})
                                            </option>
                                        )
                                    })}
                                </select>
                            </div>

                            {adjustType === 'transfer' && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Cabang Tujuan <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={transferTargetBranch}
                                        onChange={(e) => setTransferTargetBranch(e.target.value)}
                                        required
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                    >
                                        <option value="">-- Pilih Cabang Penerima --</option>
                                        {branches
                                            .filter((b) => b.id !== adjustBranchId)
                                            .map((b) => (
                                                <option key={b.id} value={b.id}>
                                                    {b.name}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    {adjustType === 'waste'
                                        ? `Jumlah Dibuang / Rusak (${adjustMaterial.unit})`
                                        : adjustType === 'transfer'
                                        ? `Jumlah Ditransfer (${adjustMaterial.unit})`
                                        : `Selisih Kuantitas (${adjustMaterial.unit}) - Masukkan negatif untuk berkurang`}
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    value={adjustQuantity}
                                    onChange={(e) => setAdjustQuantity(Number(e.target.value))}
                                    required
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Alasan / Keterangan Mutasi
                                </label>
                                <input
                                    type="text"
                                    placeholder="Contoh: Stok opname berkala, Bahan basi/pecah..."
                                    value={adjustNotes}
                                    onChange={(e) => setAdjustNotes(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setAdjustModalOpen(false)}
                                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={adjustSaving || adjustQuantity === 0}
                                    className="rounded-xl bg-emerald-800 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-900 disabled:opacity-50 transition"
                                >
                                    {adjustSaving ? 'Menyimpan...' : 'Simpan Mutasi'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {/* MODAL: TAMBAH / EDIT SUPPLIER                                           */}
            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {supplierModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <h3 className="font-bold text-slate-900">
                                {editingSupplier ? 'Edit Data Supplier' : 'Tambah Supplier Baru'}
                            </h3>
                            <button
                                onClick={() => setSupplierModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 text-lg"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveSupplier} className="mt-4 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Nama Supplier / Perusahaan <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="PT Sumber Pangan Makmur"
                                    value={supName}
                                    onChange={(e) => setSupName(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        No. Telepon / WA
                                    </label>
                                    <input
                                        type="tel"
                                        placeholder="081234567890"
                                        value={supPhone}
                                        onChange={(e) => setSupPhone(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        placeholder="sales@supplier.com"
                                        value={supEmail}
                                        onChange={(e) => setSupEmail(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Alamat Supplier
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Alamat kantor / gudang supplier..."
                                    value={supAddress}
                                    onChange={(e) => setSupAddress(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Rekening Pembayaran Bank
                                </label>
                                <input
                                    type="text"
                                    placeholder="BCA 12345678 a/n PT Sumber Pangan"
                                    value={supBank}
                                    onChange={(e) => setSupBank(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Catatan Tambahan
                                </label>
                                <input
                                    type="text"
                                    placeholder="Jadwal kirim, kontak PIC..."
                                    value={supNotes}
                                    onChange={(e) => setSupNotes(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setSupplierModalOpen(false)}
                                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={supplierSaving}
                                    className="rounded-xl bg-emerald-800 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-900 disabled:opacity-50 transition"
                                >
                                    {supplierSaving ? 'Menyimpan...' : 'Simpan Supplier'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {/* MODAL: DETAIL & RIWAYAT BELANJA PER SUPPLIER                             */}
            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {supplierDetailModalOpen && viewingSupplier && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="font-bold text-slate-900">{viewingSupplier.name}</h3>
                                <p className="text-xs text-slate-500">
                                    {viewingSupplier.phone ? `Telp: ${viewingSupplier.phone}` : ''}
                                    {viewingSupplier.bank_details ? ` • Bank: ${viewingSupplier.bank_details}` : ''}
                                </p>
                            </div>
                            <button
                                onClick={() => setSupplierDetailModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 text-lg"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="mt-4 space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                Riwayat Belanja Dari Supplier Ini ({supplierPurchases.length})
                            </h4>

                            {loadingSupplierDetail ? (
                                <div className="py-8 text-center text-sm text-slate-400">Memuat riwayat transaksi...</div>
                            ) : supplierPurchases.length === 0 ? (
                                <div className="py-8 text-center text-sm text-slate-400">
                                    Belum ada transaksi belanja yang tercatat untuk supplier ini.
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                                    {supplierPurchases.map((p) => (
                                        <div key={p.id} className="p-3 text-xs flex justify-between items-start">
                                            <div>
                                                <div className="font-semibold text-slate-900">
                                                    {p.purchase_date} • {p.branches?.name || 'Cabang'}
                                                </div>
                                                <div className="text-slate-500 mt-0.5 space-y-0.5">
                                                    {p.purchase_items.map((it) => (
                                                        <div key={it.id}>
                                                            • {it.item_name} ({fmtQty(it.quantity)} {it.unit || 'pcs'}) @ {fmt(it.price)} = {fmt(it.subtotal)}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="font-mono font-bold text-slate-900">{fmt(p.total)}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex justify-end pt-3 border-t border-slate-100">
                                <button
                                    onClick={() => setSupplierDetailModalOpen(false)}
                                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                                >
                                    Tutup
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {/* MODAL: ATUR STOK INDUK (GLOBAL) BAHAN BAKU                              */}
            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {globalStockModalOpen && globalStockMaterial && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="font-bold text-slate-900">Atur Stok Induk (Global)</h3>
                                <p className="text-xs text-slate-500">
                                    {globalStockMaterial.name} ({globalStockMaterial.unit})
                                </p>
                            </div>
                            <button
                                onClick={() => setGlobalStockModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 text-lg"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveGlobalStock} className="mt-4 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Jumlah Stok di Gudang Induk / Pusat ({globalStockMaterial.unit})
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    value={globalStockInput}
                                    onChange={(e) => setGlobalStockInput(Math.max(0, Number(e.target.value)))}
                                    required
                                    autoFocus
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                                />
                                <p className="text-[11px] text-slate-500 mt-1">
                                    Stok induk adalah total cadangan pusat. Ketika cabang menambah stok, stok induk ini akan berkurang secara otomatis.
                                </p>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setGlobalStockModalOpen(false)}
                                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={globalStockSaving}
                                    className="rounded-xl bg-emerald-800 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-900 disabled:opacity-50 transition"
                                >
                                    {globalStockSaving ? 'Menyimpan...' : 'Simpan Stok Induk'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
