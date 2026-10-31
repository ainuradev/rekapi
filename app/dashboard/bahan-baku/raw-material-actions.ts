'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { RawMaterial } from '@/types/inventory'
import { checkActiveSubscription } from '@/lib/subscription-access'

export interface CreateRawMaterialInput {
    sku?: string
    name: string
    category?: string
    unit: string
    cost_per_unit: number
    min_stock: number
    initial_stocks?: {
        branch_id: string
        quantity: number
    }[]
}

export interface UpdateRawMaterialInput {
    sku?: string
    name: string
    category?: string
    unit: string
    cost_per_unit: number
    min_stock: number
    status?: 'active' | 'inactive'
}

export async function createRawMaterial(payload: CreateRawMaterialInput) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil pengguna tidak ditemukan.' }
    if (profile.role !== 'owner') return { error: 'Hanya Owner yang dapat menambahkan master bahan baku.' }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const name = payload.name?.trim()
    if (!name) return { error: 'Nama bahan baku wajib diisi.' }

    const unit = payload.unit?.trim() || 'pcs'
    const costPerUnit = Number(payload.cost_per_unit) || 0
    const minStock = Number(payload.min_stock) || 0
    const sku = payload.sku?.trim() || null

    if (costPerUnit < 0) return { error: 'Biaya per satuan (HPP) tidak boleh negatif.' }
    if (minStock < 0) return { error: 'Batas stok minimum tidak boleh negatif.' }

    // Cek duplikasi SKU dalam bisnis yang sama jika SKU diisi
    if (sku) {
        const { data: existingSku } = await supabase
            .from('raw_materials')
            .select('id')
            .eq('business_id', profile.business_id)
            .ilike('sku', sku)
            .maybeSingle()

        if (existingSku) {
            return { error: `SKU '${sku}' sudah digunakan oleh bahan baku lain dalam bisnis ini.` }
        }
    }

    // 1. Simpan master bahan baku
    const { data: material, error: insertError } = await supabase
        .from('raw_materials')
        .insert({
            business_id: profile.business_id,
            sku,
            name,
            category: payload.category?.trim() || null,
            unit,
            cost_per_unit: costPerUnit,
            min_stock: minStock,
            status: 'active',
        })
        .select()
        .single()

    if (insertError || !material) {
        return { error: insertError?.message || 'Gagal menyimpan bahan baku.' }
    }

    // 2. Jika ada saldo awal (initial_stocks) untuk cabang, catat mutasi opening_balance secara atomik
    if (payload.initial_stocks && payload.initial_stocks.length > 0) {
        for (const item of payload.initial_stocks) {
            const qty = Number(item.quantity) || 0
            if (qty > 0) {
                const { error: rpcError } = await supabase.rpc('record_inventory_mutation_atomic', {
                    p_business_id: profile.business_id,
                    p_branch_id: item.branch_id,
                    p_raw_material_id: material.id,
                    p_mutation_type: 'opening_balance',
                    p_quantity_change: qty,
                    p_notes: 'Saldo awal bahan baku saat pembuatan master',
                    p_reference_id: `opening_${material.id}_${item.branch_id}`,
                    p_idempotency_key: `opening_${material.id}_${item.branch_id}`,
                })

                if (rpcError) {
                    console.error('Initial stock RPC error:', rpcError)
                    // Fallback jika RPC belum ter-apply: update langsung via service role / owner
                    await supabase
                        .from('raw_material_branch_stocks')
                        .upsert(
                            {
                                business_id: profile.business_id,
                                raw_material_id: material.id,
                                branch_id: item.branch_id,
                                quantity: qty,
                            },
                            { onConflict: 'raw_material_id,branch_id' }
                        )

                    await supabase.from('inventory_mutations').insert({
                        business_id: profile.business_id,
                        branch_id: item.branch_id,
                        raw_material_id: material.id,
                        mutation_type: 'opening_balance',
                        quantity_change: qty,
                        balance_after: qty,
                        notes: 'Saldo awal bahan baku saat pembuatan master',
                        reference_id: `opening_${material.id}_${item.branch_id}`,
                        user_id: user.id,
                    })
                }
            }
        }
    }

    revalidatePath('/dashboard/bahan-baku')
    return { success: true, data: material as RawMaterial }
}

export async function updateRawMaterial(id: string, payload: UpdateRawMaterialInput) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil tidak ditemukan.' }
    if (profile.role !== 'owner') return { error: 'Hanya Owner yang dapat mengubah master bahan baku.' }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const name = payload.name?.trim()
    if (!name) return { error: 'Nama bahan baku wajib diisi.' }

    const unit = payload.unit?.trim() || 'pcs'
    const costPerUnit = Number(payload.cost_per_unit) || 0
    const minStock = Number(payload.min_stock) || 0
    const sku = payload.sku?.trim() || null

    if (costPerUnit < 0) return { error: 'Biaya per satuan (HPP) tidak boleh negatif.' }
    if (minStock < 0) return { error: 'Batas stok minimum tidak boleh negatif.' }

    // Cek duplikasi SKU jika berubah
    if (sku) {
        const { data: existingSku } = await supabase
            .from('raw_materials')
            .select('id')
            .eq('business_id', profile.business_id)
            .ilike('sku', sku)
            .neq('id', id)
            .maybeSingle()

        if (existingSku) {
            return { error: `SKU '${sku}' sudah digunakan oleh bahan baku lain.` }
        }
    }

    const { error: updateError } = await supabase
        .from('raw_materials')
        .update({
            sku,
            name,
            category: payload.category?.trim() || null,
            unit,
            cost_per_unit: costPerUnit,
            min_stock: minStock,
            status: payload.status || 'active',
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('business_id', profile.business_id)

    if (updateError) return { error: updateError.message }

    revalidatePath('/dashboard/bahan-baku')
    return { success: true }
}

export async function deleteRawMaterial(id: string) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil tidak ditemukan.' }
    if (profile.role !== 'owner') return { error: 'Hanya Owner yang dapat menghapus bahan baku.' }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    // Cek apakah bahan baku sudah memiliki riwayat mutasi atau pembelian
    const { count: mutationCount } = await supabase
        .from('inventory_mutations')
        .select('id', { count: 'exact', head: true })
        .eq('raw_material_id', id)

    if (mutationCount && mutationCount > 0) {
        return {
            error: `Bahan baku tidak dapat dihapus karena memiliki ${mutationCount} riwayat mutasi/pembelian. Ubah status menjadi non-aktif jika tidak digunakan lagi.`,
        }
    }

    const { error } = await supabase
        .from('raw_materials')
        .delete()
        .eq('id', id)
        .eq('business_id', profile.business_id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/bahan-baku')
    return { success: true }
}

export interface RecordStockAdjustmentPayload {
    raw_material_id: string
    branch_id: string
    mutation_type: 'adjustment' | 'waste' | 'opening_balance'
    quantity_change: number // bertanda positif (tambah) atau negatif (kurang)
    notes?: string
}

export async function updateRawMaterialGlobalStock(id: string, newStock: number) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'owner') {
        return { error: 'Hanya owner yang dapat mengubah stok global (induk) bahan baku.' }
    }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    const cleanStock = Math.max(0, Number(newStock) || 0)

    const { error } = await supabase
        .from('raw_materials')
        .update({ stock: cleanStock, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('business_id', profile.business_id)

    if (error) {
        if (error.code === '42703') {
            return { error: 'Kolom stok induk belum tersedia di database. Jalankan migrasi 0026.' }
        }
        return { error: error.message }
    }

    revalidatePath('/dashboard/bahan-baku')
    return { success: true }
}

export async function recordStockAdjustment(payload: RecordStockAdjustmentPayload) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role, branch_id')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil pengguna tidak ditemukan.' }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    // Pegawai hanya boleh di cabangnya sendiri
    if (profile.role !== 'owner' && profile.branch_id !== payload.branch_id) {
        return { error: 'Anda hanya memiliki akses untuk mencatat mutasi stok di cabang Anda sendiri.' }
    }

    if (!payload.raw_material_id) return { error: 'Pilih bahan baku terlebih dahulu.' }
    if (!payload.branch_id) return { error: 'Pilih cabang terlebih dahulu.' }

    const qtyChange = Number(payload.quantity_change)
    if (isNaN(qtyChange) || qtyChange === 0) {
        return { error: 'Jumlah perubahan stok tidak boleh 0.' }
    }

    // Untuk waste, jika user memasukkan angka positif, ubah menjadi negatif
    const finalChange = payload.mutation_type === 'waste' && qtyChange > 0 ? -qtyChange : qtyChange

    // 1. Ambil data master bahan baku untuk cek ketersediaan stok global (induk)
    const { data: material } = await supabase
        .from('raw_materials')
        .select('name, unit, stock')
        .eq('id', payload.raw_material_id)
        .eq('business_id', profile.business_id)
        .maybeSingle()

    const currentGlobalStock = Number(material?.stock ?? 0)

    // 2. Jika menambah stok cabang (adjustment positif), potong dari stok global (induk)
    if (payload.mutation_type === 'adjustment' && finalChange > 0 && material && material.stock !== undefined) {
        if (currentGlobalStock < finalChange) {
            return {
                error: `Stok global (induk) untuk '${material.name}' tidak mencukupi. Tersedia di induk: ${currentGlobalStock} ${material.unit}, penambahan cabang: ${finalChange} ${material.unit}. Tambahkan stok global terlebih dahulu.`,
            }
        }

        const newGlobal = currentGlobalStock - finalChange
        await supabase
            .from('raw_materials')
            .update({ stock: newGlobal, updated_at: new Date().toISOString() })
            .eq('id', payload.raw_material_id)
    } else if (payload.mutation_type === 'adjustment' && finalChange < 0 && material && material.stock !== undefined) {
        // Jika mengurangi stok cabang (dikembalikan ke induk)
        const returned = Math.abs(finalChange)
        const newGlobal = currentGlobalStock + returned
        await supabase
            .from('raw_materials')
            .update({ stock: newGlobal, updated_at: new Date().toISOString() })
            .eq('id', payload.raw_material_id)
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc('record_inventory_mutation_atomic', {
        p_business_id: profile.business_id,
        p_branch_id: payload.branch_id,
        p_raw_material_id: payload.raw_material_id,
        p_mutation_type: payload.mutation_type,
        p_quantity_change: finalChange,
        p_notes: payload.notes?.trim() || null,
        p_reference_id: `manual_${Date.now()}`,
    })

    if (rpcError) {
        // Rollback stok global jika eksekusi mutasi gagal
        if (payload.mutation_type === 'adjustment' && material && material.stock !== undefined) {
            await supabase
                .from('raw_materials')
                .update({ stock: currentGlobalStock, updated_at: new Date().toISOString() })
                .eq('id', payload.raw_material_id)
        }

        if (rpcError.code === 'P0003') {
            return { error: 'Stok tidak mencukupi untuk melakukan pengurangan ini.' }
        }
        return { error: rpcError.message }
    }

    revalidatePath('/dashboard/bahan-baku')
    return { success: true, data: rpcResult }
}

export interface RecordStockTransferPayload {
    raw_material_id: string
    source_branch_id: string
    target_branch_id: string
    quantity: number
    notes?: string
}

export async function recordStockTransfer(payload: RecordStockTransferPayload) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('business_id, role, branch_id')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil tidak ditemukan.' }

    const subCheck = await checkActiveSubscription(profile.business_id, supabase)
    if (!subCheck.allowed) {
        return { error: subCheck.error || 'Masa aktif langganan telah berakhir.' }
    }

    if (payload.source_branch_id === payload.target_branch_id) {
        return { error: 'Cabang asal dan cabang tujuan transfer tidak boleh sama.' }
    }

    const qty = Number(payload.quantity)
    if (!qty || qty <= 0) return { error: 'Jumlah transfer harus lebih dari 0.' }

    // Pegawai hanya bisa transfer keluar dari cabangnya sendiri
    if (profile.role !== 'owner' && profile.branch_id !== payload.source_branch_id) {
        return { error: 'Anda hanya dapat melakukan transfer keluar dari cabang Anda sendiri.' }
    }

    const transferRef = `transfer_${Date.now()}`

    // 1. Mutasi keluar dari cabang asal
    const { error: outError } = await supabase.rpc('record_inventory_mutation_atomic', {
        p_business_id: profile.business_id,
        p_branch_id: payload.source_branch_id,
        p_raw_material_id: payload.raw_material_id,
        p_mutation_type: 'transfer_out',
        p_quantity_change: -qty,
        p_notes: payload.notes ? `Transfer keluar: ${payload.notes}` : 'Transfer antar cabang keluar',
        p_reference_id: transferRef,
    })

    if (outError) {
        if (outError.code === 'P0003') {
            return { error: 'Stok di cabang asal tidak mencukupi untuk ditransfer.' }
        }
        return { error: `Gagal transfer keluar: ${outError.message}` }
    }

    // 2. Mutasi masuk ke cabang tujuan
    const { error: inError } = await supabase.rpc('record_inventory_mutation_atomic', {
        p_business_id: profile.business_id,
        p_branch_id: payload.target_branch_id,
        p_raw_material_id: payload.raw_material_id,
        p_mutation_type: 'transfer_in',
        p_quantity_change: qty,
        p_notes: payload.notes ? `Transfer masuk: ${payload.notes}` : 'Transfer antar cabang masuk',
        p_reference_id: transferRef,
    })

    if (inError) {
        // Kompensasi rollback cabang asal jika cabang tujuan gagal
        await supabase.rpc('record_inventory_mutation_atomic', {
            p_business_id: profile.business_id,
            p_branch_id: payload.source_branch_id,
            p_raw_material_id: payload.raw_material_id,
            p_mutation_type: 'adjustment',
            p_quantity_change: qty,
            p_notes: `Rollback kegagalan transfer ${transferRef}`,
            p_reference_id: `rollback_${transferRef}`,
        })
        return { error: `Gagal transfer masuk: ${inError.message}` }
    }

    revalidatePath('/dashboard/bahan-baku')
    return { success: true }
}
