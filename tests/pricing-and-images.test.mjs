import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

describe('Pricing Update (49k / 99k / 179k), Product Photo (image_url) & Store QRIS (qris_image_url)', () => {
    test('1. Migration 0045 memperbarui harga paket (49000, 99000, 179000) dan menambahkan kolom image_url & qris_image_url dengan proteksi RLS Owner', () => {
        const migPath = path.join(ROOT, 'supabase/migrations/0045_update_pricing_and_images.sql')
        assert.ok(fs.existsSync(migPath), 'File migrasi 0045_update_pricing_and_images.sql harus ada')
        const sql = fs.readFileSync(migPath, 'utf8')

        assert.match(sql, /price\s*=\s*49000[\s\S]*?where code = 'standard'/i)
        assert.match(sql, /price\s*=\s*99000[\s\S]*?where code = 'business'/i)
        assert.match(sql, /price\s*=\s*179000[\s\S]*?where code = 'pro'/i)

        assert.match(sql, /alter table public\.products\s+add column if not exists image_url text null/i)
        assert.match(sql, /alter table public\.businesses\s+add column if not exists qris_image_url text null/i)
        assert.match(sql, /alter table public\.branches\s+add column if not exists qris_image_url text null/i)
        assert.match(sql, /auth_is_owner\(\)/i)
    })

    test('2. Konstanta harga resmi & tampilan harga coret di Landing Page, Halaman Langganan, dan Midtrans Snap sinkron', () => {
        const limitsSrc = fs.readFileSync(path.join(ROOT, 'lib/subscription-limits.ts'), 'utf8')
        assert.match(limitsSrc, /price:\s*49_000/)
        assert.match(limitsSrc, /original_price:\s*149_000/)
        assert.match(limitsSrc, /price:\s*99_000/)
        assert.match(limitsSrc, /original_price:\s*299_000/)
        assert.match(limitsSrc, /price:\s*179_000/)
        assert.match(limitsSrc, /original_price:\s*499_000/)

        const landingSrc = fs.readFileSync(path.join(ROOT, 'app/page.tsx'), 'utf8')
        assert.ok(landingSrc.includes('Rp 49.000'), 'Landing page harus menampilkan Rp 49.000')
        assert.ok(landingSrc.includes('Rp 99.000'), 'Landing page harus menampilkan Rp 99.000')
        assert.ok(landingSrc.includes('Rp 179.000'), 'Landing page harus menampilkan Rp 179.000')
        assert.ok(landingSrc.includes('line-through'), 'Landing page harus menampilkan harga coret')

        const subClientSrc = fs.readFileSync(
            path.join(ROOT, 'app/dashboard/subscription/subscription-client.tsx'),
            'utf8'
        )
        assert.ok(subClientSrc.includes('OFFICIAL_PLAN_CATALOG'), 'SubscriptionClient harus merujuk katalog harga resmi')
        assert.ok(subClientSrc.includes('line-through'), 'SubscriptionClient harus menampilkan harga coret')

        const midtransRouteSrc = fs.readFileSync(
            path.join(ROOT, 'app/api/midtrans/create-transaction/route.ts'),
            'utf8'
        )
        assert.ok(midtransRouteSrc.includes('OFFICIAL_PLAN_CATALOG'), 'Midtrans checkout harus menagihkan harga resmi baru')
        assert.ok(midtransRouteSrc.includes('chargeAmount'), 'Midtrans checkout harus menggunakan chargeAmount')
    })

    test('3. Helper lib/cloudinary-upload.ts mendukung 2 mode (product 400x400 0.78 & qris 800x1000 0.92 tanpa crop kotak) beserta fallback WebP Data URL', () => {
        const uploadSrc = fs.readFileSync(path.join(ROOT, 'lib/cloudinary-upload.ts'), 'utf8')
        assert.match(uploadSrc, /maxWidth:\s*400/)
        assert.match(uploadSrc, /maxHeight:\s*400/)
        assert.match(uploadSrc, /quality:\s*0\.78/)
        assert.match(uploadSrc, /maxWidth:\s*800/)
        assert.match(uploadSrc, /maxHeight:\s*1000/)
        assert.match(uploadSrc, /quality:\s*0\.92/)
        assert.ok(uploadSrc.includes('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME'))
        assert.ok(uploadSrc.includes('NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET'))
        assert.ok(uploadSrc.includes("provider: 'inline-webp'"), 'Wajib memiliki fallback inline-webp jika env Cloudinary belum diatur')
    })

    test('4. Penyimpanan image_url produk dan proteksi qris_image_url khusus Owner serta tampilan QRIS di Kasir POS', () => {
        const produkActions = fs.readFileSync(path.join(ROOT, 'app/dashboard/produk/actions.ts'), 'utf8')
        assert.ok(produkActions.includes('image_url'), 'addProduct wajib menyimpan image_url')
        assert.ok(produkActions.includes('export async function updateProductImage'), 'updateProductImage wajib tersedia')

        const addProductForm = fs.readFileSync(path.join(ROOT, 'app/dashboard/produk/add-product-form.tsx'), 'utf8')
        assert.ok(addProductForm.includes("uploadImageWithCompression(file, 'product')"))

        const profilActions = fs.readFileSync(path.join(ROOT, 'app/dashboard/profil/actions.ts'), 'utf8')
        assert.ok(profilActions.includes("ctx.profile.role !== 'owner'"), 'updateBusinessProfile wajib memvalidasi role === owner')
        assert.ok(profilActions.includes('qris_image_url: qrisUrl'), 'updateBusinessProfile wajib menyimpan qris_image_url')

        const profilClient = fs.readFileSync(path.join(ROOT, 'app/dashboard/profil/profil-client.tsx'), 'utf8')
        assert.ok(profilClient.includes('Kode QRIS Statis Toko (Tampil di Kasir POS)'))
        assert.ok(profilClient.includes("uploadImageWithCompression(file, 'qris')"))

        const kasirClient = fs.readFileSync(path.join(ROOT, 'app/dashboard/penjualan/kasir-client.tsx'), 'utf8')
        assert.ok(kasirClient.includes('Lihat / Tampilkan Kode QRIS Toko'))
        assert.ok(
            kasirClient.includes(
                'Pastikan bukti pembayaran QRIS pada HP pelanggan telah berhasil sebelum menekan tombol Proses Pembayaran.'
            )
        )
    })
})

