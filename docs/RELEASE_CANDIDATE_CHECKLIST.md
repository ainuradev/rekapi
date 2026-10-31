# Rekapi Release Candidate (RC) Readiness & Deployment Checklist

> [!CAUTION]
> **ATURAN KESELAMATAN WAJIB PRODUCTION:**
> - Database production (`dnqzjrnyptwadojycxvm`) berisi data pelanggan nyata.
> - Jangan pernah menjalankan migrasi, deploy, seed, reset database, atau pengujian otomatis langsung ke production tanpa persetujuan eksplisit pemilik sistem dan backup terverifikasi.
> - Dokumen ini berfungsi sebagai panduan standar rilis (Standard Operating Procedure) dan verifikasi kelaikan rilis Release Candidate (RC).

---

## 1. Status & Audit Migrasi Database (`0001` s/d `0036`)

### 1.1 Fondasi Awal (`0001` s/d `0022`) — Terpasang di Staging
Seluruh migrasi fondasi `0001` hingga `0022` telah aktif dan terverifikasi di project Supabase Staging (`ucvgszazrjnjaglaiswq` / `rekapi-staging`):
- `0001_init_schema.sql` s/d `0020_add_business_branch_profile.sql`: Skema dasar multi-tenant, produk, kasir POS, proteksi kolom HPP (`owner_products_view`, `trg_enforce_cost_price`), pelestarian audit log, dan profil bisnis/cabang.
- `0021_harden_business_branch_rls.sql`: Mengunci kolom langganan `businesses` dari mutasi langsung JWT client, membatasi kuota cabang (`trg_enforce_branch_limit`), dan mencegah penghapusan cabang berhistori transaksi (`trg_protect_branch_deletion`).
- `0022_sync_trial_branch_limits.sql`: Sinkronisasi batas trial/non-aktif konservatif maksimal 1 cabang (`TRIAL_LIMITS.max_branches = 1`).

### 1.2 Daftar Verifikasi Migrasi Fase Lanjutan & Hardening (`0023` s/d `0036`)
Seluruh file migrasi `0023` hingga `0036` telah diaudit terhadap urutan dependensi tabel/kolom, idempotensi `DROP TRIGGER/POLICY IF EXISTS`, penghapusan overload fungsi lama, serta penguncian `SECURITY DEFINER` (`set search_path = public`):

| No. | File Migrasi | Cakupan Perubahan Utama | Status Staging (`ucvgszazrjnjaglaiswq`) |
|---|---|---|---|
| `0023` | `0023_phase2_raw_materials_and_suppliers.sql` | Master `suppliers`, `raw_materials`, `raw_material_branch_stocks`, immutable ledger `inventory_mutations`, serta RPC `record_inventory_mutation_atomic`. | **TERPASANG** |
| `0024` | `0024_phase3_master_data_and_customers.sql` | Master `customers`, `supplier_items`, relasi `sales.customer_id`, hierarki `branches`, serta trigger `trg_validate_supplier_item_tenant` & `trg_validate_branch_hierarchy`. | **TERPASANG** |
| `0025` | `0025_add_qris_to_businesses.sql` | Kolom `businesses.qris_url` beserta grant update terisolasi RLS untuk Owner. | **TERPASANG** |
| `0026` | `0026_global_stock_and_auto_purchase_materials.sql` | Kolom `raw_materials.stock` dan pembuatan bahan baku baru otomatis saat pembelian. | **TERPASANG** |
| `0027` | `0027_update_plan_limits_and_one_employee_per_branch.sql` | Harga & kuota resmi paket (`Standard` Rp149rb 1/1, `Business` Rp299rb 3/3, `Pro` Rp499rb 5/5), unique index `uq_branch_single_employee` (1 cabang = 1 pegawai), & trigger `trg_enforce_employee_limit`. | **TERPASANG** |
| `0028` | `0028_financial_accounts_debts_receivables_equity.sql` | Modul keuangan (`financial_accounts`, `financial_transactions`, `debts_payables`, `receivables`, `equity_records`), seed akun kas/bank default, dan trigger sinkronisasi kas penjualan. | **TERPASANG** |
| `0029` | `0029_credit_sales_and_payment_flow.sql` | Kolom kredit/void pada `sales`, tabel `sale_payments`, pencegahan kas fiktif penjualan tempo, serta RPC `create_sale_atomic`, `record_sale_payment_atomic`, dan `void_sale_atomic`. | **TERPASANG** |
| `0030` | `0030_unify_payment_rpc_and_backfill.sql` | Unifikasi signature RPC `record_sale_payment_atomic` (toleran UUID idempotensi), unique index `uq_receivables_business_sale`, dan backfill historis piutang-penjualan. | **TERPASANG** |
| `0031` | `0031_integrate_purchases_finance.sql` | Integrasi `purchases` ke kas & `debts_payables` (`uq_debts_business_purchase`) dan pembaruan RPC 11-parameter `record_purchase_with_stock_atomic` (menghapus overload 7-arg lama). | **TERPASANG** |
| `0032` | `0032_void_guard_and_exact_stock_restoration.sql` | Kolom `sale_items.branch_stock_deducted` & `global_stock_deducted`, guard penolakan edit pada transaksi `voided` (RPC + trigger + RLS), serta pemulihan stok presisi anti *phantom stock*. | **TERPASANG** |
| `0033` | `0033_direct_branch_stock_and_employee_rls.sql` | Arsitektur *Direct Branch Stock*: `trg_sync_product_aggregate_stock` (`products.stock = SUM(stock)`), inisialisasi stok hanya ke 1 cabang utama, RPC `set_product_branch_stock_atomic`, dan RLS pegawai untuk stok cabangnya sendiri. | **TERPASANG** |
| `0034` | `0034_strict_stock_validation_no_oversell.sql` | Validasi stok ketat (*No Oversell*) pada `fn_deduct_stock_on_sale`, `update_sale_atomic` (`current_stock + old_qty` dengan `FOR UPDATE`), unifikasi `create_sale_atomic` (15-arg, harga resmi DB + kredit/DP), serta pembersihan overload & izin `PUBLIC`. | **TERPASANG** |
| `0035` | `0035_production_security_hardening.sql` | Penguncian status langganan server-side: cron `expire_trials()` mencakup paket aktif yang melewati masa aktif, revokasi izin eksekusi RPC publik, dan audit trail `edited_by` & `sale_edit_logs`. | **TERPASANG** |
| `0036` | `0036_hybrid_sale_edit_and_financial_integrity.sql` | Kolom `sales.account_id`, kebijakan edit hibrida (tolak edit transaksi multi-cicilan bertahap; rekonsiliasi kas, jurnal, dan piutang atomik untuk transaksi lunas tunggal), harga & HPP wajib DB di `update_sale_atomic`, dan pembalikan void dari akun sumber presisi. | **TERPASANG** |

---

## 2. Daftar RPC, Trigger, Index, & View Kritis Wajib Aktif

Setelah seluruh migrasi hingga `0036` diterapkan pada target environment (Staging maupun Production), komponen database berikut **WAJIB** aktif dan bebas duplikasi overload:

### 2.1 Stored Procedures / Atomic RPC Wajib Aktif
| Nama Fungsi / RPC | Signature Parameter Utama | Peran Kritis |
|---|---|---|
| `create_sale_atomic` | 15 parameter (`p_business_id` .. `p_account_id`) | Pembuatan transaksi POS atomik: validasi stok cabang ketat (*no oversell*), harga/HPP resmi dari DB, simpan `sales.account_id`, batas piutang pelanggan, pencatatan piutang & DP, serta idempotensi. |
| `update_sale_atomic` | 10 parameter (`p_sale_id` .. `p_reason`) | Edit riwayat transaksi atomik hibrida: tolak transaksi multi-cicilan (`count(sale_payments) > 1`), ambil harga & HPP resmi DB, sesuaikan saldo `financial_accounts` & jurnal, hitung stok efektif (`current_stock + old_qty`), rollback penuh jika stok kurang, & catat `sale_edit_logs`. |
| `void_sale_atomic` | 4 parameter (`p_business_id`, `p_sale_id`, `p_user_id`, `p_reason`) | Pembatalan transaksi khusus Owner tanpa hard-delete: memulihkan stok cabang aktual, membalik saldo kas/bank dari akun sumber `sale_payments.account_id`, menutup piutang, dan merekam jejak audit. |
| `record_sale_payment_atomic` | 10 parameter (`p_business_id` .. `p_user_id`) | Pencatatan cicilan/pelunasan piutang POS atomik ke `sale_payments`, `sales`, `receivables`, `financial_accounts`, dan `financial_transactions`. |
| `set_product_branch_stock_atomic` | 3 parameter (`p_product_id`, `p_branch_id`, `p_stock`) | Pengaturan stok fisik cabang langsung (Owner semua cabang; Pegawai terkunci hanya pada cabangnya sendiri). |
| `record_inventory_mutation_atomic` | 8 parameter (`p_business_id` .. `p_idempotency_key`) | Mutasi stok bahan baku cabang dengan kunci `FOR UPDATE`, proteksi saldo negatif (`P0003`), dan pencatatan ledger immutable `inventory_mutations`. |
| `record_purchase_with_stock_atomic` | 11 parameter (`p_business_id` .. `p_due_date`) | Pencatatan pembelian bahan baku atomik (auto-create bahan baru, tambah stok cabang, potong kas bila tunai, atau catat `debts_payables` bila tempo). |
| `fn_format_stock_qty` | 1 parameter (`p_val numeric`) | Helper format angka stok bersih untuk pesan penolakan stok tidak mencukupi (`P0001`). |
| `expire_trials` | 0 parameter | Maintenance otomatis masa aktif bisnis (menandai `trial` dan `active` yang telah kedaluwarsa menjadi `expired`). |

### 2.2 Trigger, View, & Unique Index Kritis Wajib Aktif
| Kategori | Nama Objek | Tabel Target | Peran Kritis |
|---|---|---|---|
| **Trigger Stok Produk** | `trg_deduct_stock_on_sale` (`fn_deduct_stock_on_sale`) | `sale_items` (`BEFORE INSERT`) | Menolak *oversell* (`P0001`), menolak transaksi `voided`, dan memotong stok cabang secara presisi. |
| **Trigger Stok Produk** | `trg_restore_stock_on_delete` (`fn_restore_stock_on_delete`) | `sale_items` (`AFTER DELETE`) | Memulihkan stok cabang sebesar `branch_stock_deducted` saat item transaksi aktif diedit/dihapus. |
| **Trigger Stok Produk** | `trg_sync_product_aggregate_stock` (`fn_sync_product_aggregate_stock`) | `product_branch_stocks` (`AFTER INSERT/UPDATE/DELETE`) | Menjaga `products.stock = SUM(product_branch_stocks.stock)` secara otomatis setiap saat. |
| **Trigger Stok Produk** | `trg_init_product_branch_stocks` (`fn_init_product_branch_stocks`) | `products` (`AFTER INSERT`) | Menginisialisasi stok awal `N` hanya ke 1 cabang utama dan `0` ke cabang lain (anti penggandaan stok). |
| **Trigger Stok Produk** | `trg_init_branch_product_stocks` (`fn_init_branch_product_stocks`) | `branches` (`AFTER INSERT`) | Menginisialisasi baris stok produk bernilai `0` pada cabang baru tanpa menggandakan stok. |
| **Trigger Bahan Baku** | `trg_init_raw_material_branch_stocks` & `trg_init_branch_raw_material_stocks` | `raw_materials` & `branches` | Inisialisasi otomatis baris `raw_material_branch_stocks` untuk bahan baku/cabang baru. |
| **Trigger Kuota & Cabang** | `trg_enforce_branch_limit` & `trg_protect_branch_deletion` | `branches` | Menegakkan kuota cabang sesuai paket langganan & mencegah penghapusan cabang bertransaksi. |
| **Trigger Kuota & Cabang** | `trg_enforce_employee_limit` & `trg_validate_branch_hierarchy` | `profiles` & `branches` | Menegakkan batas kuota akun pegawai kasir & mencegah siklus induk cabang. |
| **Trigger Keuangan & HPP** | `trg_on_business_created_seed_accounts`, `trg_sync_sale_to_financial_account`, `trg_revert_sale_from_financial_account` | `businesses` & `sales` | Otomatisasi akun kas/bank default dan sinkronisasi uang tunai riil (`paid_amount`) penjualan. |
| **Trigger & View HPP** | `trg_enforce_cost_price` & `owner_products_view` | `sale_items` & `products` | Menjamin HPP tersalin akurat di server dan menyembunyikan `products.cost_price` dari role `pegawai`. |
| **Unique Index Kritis** | `uq_branch_single_employee`, `uq_receivables_business_sale`, `uq_debts_business_purchase` | `profiles`, `receivables`, `debts_payables` | Menjamin 1 pegawai per cabang, 1 piutang per penjualan kredit, dan 1 utang per pembelian tempo. |

### 2.3 Query SQL Verifikasi Kesehatan Pasca-Migrasi
Jalankan query baca-saja (read-only) berikut di Supabase SQL Editor setelah migrasi selesai untuk memastikan seluruh RPC (tepat 1 overload per fungsi), trigger, dan index aktif:

```sql
-- 1. Verifikasi seluruh RPC kritis ada & bebas duplikasi overload (jumlah argumen tepat 1 baris per fungsi)
SELECT p.proname AS rpc_name, p.pronargs AS arg_count, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_sale_atomic',
    'update_sale_atomic',
    'void_sale_atomic',
    'record_sale_payment_atomic',
    'set_product_branch_stock_atomic',
    'record_inventory_mutation_atomic',
    'record_purchase_with_stock_atomic',
    'fn_format_stock_qty',
    'fn_sync_product_aggregate_stock'
  )
ORDER BY p.proname;

-- 2. Verifikasi seluruh trigger kritis berstatus enabled ('O' = origin enabled)
SELECT c.relname AS table_name, t.tgname AS trigger_name, t.tgenabled AS enabled_flag
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND t.tgname IN (
    'trg_deduct_stock_on_sale',
    'trg_restore_stock_on_delete',
    'trg_sync_product_aggregate_stock',
    'trg_init_product_branch_stocks',
    'trg_init_branch_product_stocks',
    'trg_init_raw_material_branch_stocks',
    'trg_init_branch_raw_material_stocks',
    'trg_enforce_branch_limit',
    'trg_enforce_employee_limit',
    'trg_protect_branch_deletion',
    'trg_validate_branch_hierarchy',
    'trg_validate_supplier_item_tenant',
    'trg_on_business_created_seed_accounts',
    'trg_sync_sale_to_financial_account',
    'trg_revert_sale_from_financial_account',
    'trg_enforce_cost_price'
  )
ORDER BY c.relname, t.tgname;

-- 3. Verifikasi harga & kuota paket langganan resmi (Standard 149rb 1/1, Business 299rb 3/3, Pro 499rb 5/5, 28 hari)
SELECT code, name, price, duration_days, max_branches, max_employees, can_advanced_reports, can_api_access
FROM public.subscription_plans
ORDER BY price ASC;
```

---

## 3. Panduan Penerapan Migrasi ke Supabase Staging & Pre-Flight Production

### 3.1 Status Penerapan Migrasi ke Supabase Staging (`ucvgszazrjnjaglaiswq`)
Seluruh migrasi dari `0001` hingga `0036` telah **100% TERPASANG & SINKRON** di database Supabase Staging (`local == remote`).

Untuk memverifikasi atau menerapkan migrasi baru di masa mendatang menggunakan Supabase CLI:
```powershell
# 1. Verifikasi target project ref (WAJIB menampilkan ucvgszazrjnjaglaiswq)
Get-Content supabase/.temp/project-ref

# 2. Periksa status migrasi lokal vs remote
npx supabase migration list

# 3. Preview perubahan tanpa mengeksekusi (dry-run)
npx supabase db push --dry-run

# 4. Terapkan migrasi ke Supabase Staging
npx supabase db push
```

### 3.2 Pre-Flight Check Data Sebelum Migrasi Production (`dnqzjrnyptwadojycxvm`)
Sebelum menerapkan migrasi `0023`–`0036` ke Production (setelah backup terverifikasi), jalankan pengecekan baca-saja berikut agar pembuatan *unique index* baru tidak gagal di tengah jalan:

```sql
-- Pre-flight Check 1 (untuk 0027 uq_branch_single_employee):
-- Pastikan hasilnya 0 baris (tidak ada 1 cabang yang ditempati > 1 akun role 'pegawai')
SELECT branch_id, count(*) AS total_pegawai
FROM public.profiles
WHERE role = 'pegawai' AND branch_id IS NOT NULL
GROUP BY branch_id
HAVING count(*) > 1;
```

---

## 4. Prosedur Backup & Restore Database Production

Sebelum migrasi baru diterapkan ke database production (`dnqzjrnyptwadojycxvm`):

### 4.1 Prosedur Backup (Pre-deployment)
1. **Supabase Dashboard Automated Backup**:
   - Buka Supabase Dashboard Production (`dnqzjrnyptwadojycxvm`) → Database → Backups.
   - Pastikan terdapat Daily Backup terbaru yang berstatus `Healthy`.
2. **Manual Logical Dump (Recommended)**:
   Jalankan logical dump skema dan data menggunakan PostgreSQL CLI tools:
   ```bash
   pg_dump "postgresql://postgres.[REF]:[DB_PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require" \
     --format=custom \
     --file="rekapi_backup_pre_rc_$(date +%Y%m%d_%H%M%S).dump"
   ```
3. Simpan file dump di storage terenkripsi dan terpisah dari server aplikasi.

### 4.2 Prosedur Restore (Disaster Recovery Plan)
Jika terjadi anomali kritis pada saat migrasi production:
1. Jika migrasi gagal di tengah eksekusi: skrip migrasi kritis dibungkus dalam transaksi atomik (`BEGIN ... COMMIT`) sehingga rollback skema terjadi otomatis tanpa data korup.
2. Jika terjadi kerusakan struktural data:
   - Gunakan fitur Supabase Dashboard → Point-in-Time Recovery (PITR) ke timestamp sesaat sebelum migrasi dijalankan.
   - Atau restore dump:
     ```bash
     pg_restore --clean --if-exists -d "postgresql://..." "rekapi_backup_pre_rc_TIMESTAMP.dump"
     ```

---

## 5. Pemisahan Environment Vercel (Production vs. Staging)

Pastikan pemisahan mutlak konfigurasi environment di dashboard Vercel:

| Konfigurasi / Env Var | Vercel Staging (Preview / `staging` branch) | Vercel Production (`main` branch) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ucvgszazrjnjaglaiswq.supabase.co` | `https://dnqzjrnyptwadojycxvm.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon Key Staging | Anon Key Production |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key Staging | Service Role Key Production |
| `MIDTRANS_SERVER_KEY` | `Mid-server-XXXXX` atau `SB-Mid-server-XXXXX` (Sandbox) | `Mid-server-XXXXX` (Production) |
| `MIDTRANS_CLIENT_KEY` | `Mid-client-XXXXX` atau `SB-Mid-client-XXXXX` (Sandbox) | `Mid-client-XXXXX` (Production) |
| `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` | `Mid-client-XXXXX` atau `SB-Mid-client-XXXXX` (Sandbox) | `Mid-client-XXXXX` (Production) |
| `MIDTRANS_IS_PRODUCTION` | `false` | `true` |
| `NEXT_PUBLIC_MIDTRANS_SNAP_URL` | `https://app.sandbox.midtrans.com/snap/snap.js` | `https://app.midtrans.com/snap/snap.js` |
| `SUPER_ADMIN_EMAILS` | Admin tester staging | Admin resmi Rekapi |

> [!IMPORTANT]
> `lib/midtrans/config.ts` menerapkan pengamanan **fail-closed**: jika `MIDTRANS_IS_PRODUCTION=true` terdeteksi pada `NODE_ENV`/`APP_ENV`/`VERCEL_ENV` non-production atau saat `NEXT_PUBLIC_SUPABASE_URL` mengarah ke Staging (`ucvgszazrjnjaglaiswq`), sistem langsung menolak pembuatan maupun pemrosesan transaksi.

---

## 6. Midtrans Sandbox & Spesifikasi Paket Langganan

### 6.1 Spesifikasi Paket Terverifikasi (`0027` & `lib/subscription-limits.ts`)
- **Trial (7 Hari)**: Gratis, maks **1 cabang**, maks **1 pegawai** (1/cabang), tanpa laporan lanjutan & API.
- **Standard (`standard`)**: **Rp149.000 / 28 hari**, maks **1 cabang**, maks **1 pegawai** (1/cabang).
- **Business (`business`)**: **Rp299.000 / 28 hari**, maks **3 cabang**, maks **3 pegawai** (1/cabang), laporan lanjutan & HPP.
- **Pro (`pro`)**: **Rp499.000 / 28 hari**, maks **5 cabang**, maks **5 pegawai** (1/cabang), laporan lanjutan & HPP + akses API.

### 6.2 Audit Matrix Integrasi Midtrans
| Skenario Pengujian | Status Verifikasi | Keterangan Pembuktian |
|---|---|---|
| 1. Pembuatan Order & Format Order ID | **AUTOMATED TEST VERIFIED** | Format `REKAPI-[businessId-8]-[timestamp]`, tersimpan di `payment_transactions`. |
| 2. Validasi Nominal, Siklus 28 Hari & Kuota | **AUTOMATED TEST VERIFIED** | Nominal & `duration_days` (28 hari) ditarik dari `subscription_plans` di server; kuota cabang & kasir sinkron di `tests/subscription-limits-and-plans.test.mjs`. |
| 3. Checkout Snap Popup & Fallback Redirect | **MANUAL TEST REQUIRED** | Memerlukan interaksi UI browser dengan `snap.js` Sandbox. |
| 4. Verifikasi Signature SHA-512 Valid & Invalid | **AUTOMATED TEST VERIFIED** | Lulus di `tests/p5-midtrans-subscription-hardening.test.mjs` & `tests/midtrans-payment-lifecycle.test.mjs`. Invalid signature ditolak 403. |
| 5. Pemanggilan Status ke Midtrans Core API | **AUTOMATED TEST VERIFIED** | `lib/midtrans/sync.ts` memanggil `coreApi.transaction.status(orderId)` server-to-server. |
| 6. Penanganan Settlement, Pending, Expire, Cancel | **AUTOMATED TEST VERIFIED** | Termasuk pembatalan aman saat popup ditutup via `/api/midtrans/cancel-transaction` & `/dashboard/subscription/unfinish`. |
| 7. Idempotensi Webhook & Sync Paralel (CAS) | **AUTOMATED TEST VERIFIED** | Klaim atomik `.neq('status', 'settlement')` menjamin webhook + manual sync paralel hanya memperpanjang masa aktif tepat 1 kali. |
| 8. Perpanjangan Dini & Upgrade Paket Instan | **AUTOMATED TEST VERIFIED** | Sisa hari dari `businesses.subscription_expires_at` terakumulasi (`sisa + 28 hari`) dan `subscription_plan_id` / kuota langsung diperbarui saat `settlement`. |
| 9. Penolakan Aktivasi Tanpa Order Cocok | **AUTOMATED TEST VERIFIED** | Order ID yang tidak ada di `payment_transactions` ditolak 404 (tidak mengaktifkan bisnis). |
| 10. Fail-Closed Environment Safety | **AUTOMATED TEST VERIFIED** | Lulus 13/13 skenario di `tests/midtrans-config-safety.test.mjs` (mendukung key Sandbox `Mid-*` & `SB-Mid-*` saat `MIDTRANS_IS_PRODUCTION=false`, menolak mode production di staging/dev). |
| 11. Verifikasi Live Gateway Midtrans Sandbox | **LIVE SANDBOX VERIFIED** | Lulus autentikasi langsung ke `api.sandbox.midtrans.com` dengan `--env-file=.env.local` (`9/9 PASS` di `tests/midtrans-payment-lifecycle.test.mjs`). |

---

## 7. Smoke Test Pasca-Deployment & Prosedur Rollback

### 7.1 Smoke Test Pasca-Deployment
Lakukan pengujian manual menggunakan akun uji (bukan akun pelanggan):
1. **Autentikasi & Onboarding**: Register akun owner baru, login, logout, dan perbarui profil + QRIS bisnis.
2. **Stok Produk & Kasir POS (*Strict No Oversell*)**:
   - Buat produk dengan stok awal `10`, pastikan total stok tidak berlipat ganda antar cabang (`SUM = 10`).
   - Buat transaksi kasir (Tunai, QRIS, Kredit/DP) dan pastikan kuantitas melebihi stok cabang ditolak tegas.
   - Uji **Edit Riwayat Transaksi** (`updateSale`): pastikan kuantitas `> stok saat ini + old_qty` ditolak, dan transaksi berstatus `voided` tidak bisa diedit lagi.
3. **Laporan Keuangan & Isolasi Cabang**:
   - Verifikasi Neraca, Laba Rugi, Arus Kas, Kinerja, Beban, dan Utang-Piutang pada filter cabang valid dan cabang lintas-bisnis (otomatis kembali ke Konsolidasi).
   - Login sebagai akun `pegawai` dan pastikan kolom `cost_price` (HPP) tidak bocor serta pegawai hanya bisa mengatur stok cabangnya sendiri.
4. **Manajemen Cabang, Pegawai, & Subscription**:
   - Uji batas kuota cabang & pegawai pada akun trial (maks 1 cabang, 1 pegawai per cabang).
   - Buka `/dashboard/subscription`, pastikan tampil **Rp149.000 / 28 hari**, **Rp299.000 / 28 hari**, dan **Rp499.000 / 28 hari**, lalu uji pembayaran Snap Sandbox.

### 7.2 Rollback Aplikasi (Vercel)
1. Buka Vercel Dashboard → Rekapi → Deployments.
2. Pilih deployment stabil sebelumnya → klik menu `...` → **Instant Rollback** (< 30 detik).

---

## 8. Status Akhir Kelaikan Release Candidate (RC)

| Pemeriksaan Kualitas | Status Terakhir | Catatan |
|---|---|---|
| Unit Test Suite | **173/174 PASS (+ 9/9 Live Sandbox PASS)** | `node --test tests/*.test.mjs` (40 file test, 0 fail, 1 skipped) & `node --env-file=.env.local --test tests/midtrans-payment-lifecycle.test.mjs` (`9/9 PASS`) |
| Staging Live Integration Test | **31/31 PASS (4/4 Suites)** | `node --test tests/integration/*.integration.mjs` (`phase1` 15/15, `phase2` 5/5, `phase3` 6/6, `phase4` 5/5) di Supabase Staging (`ucvgszazrjnjaglaiswq`) |
| TypeScript & ESLint | **PASS (0 Errors)** | `npx tsc --noEmit` & `npm run lint` lulus dengan 0 error |
| Production Build (Next.js 16.4.3) | **PASS (38/38 Routes)** | `npm run build` (Turbopack) sukses 100% tanpa error dalam 23.5 detik |
| Migrasi Staging (`0001`–`0036`) | **100% SYNCED & VERIFIED** | `npx supabase db push` & `npx supabase migration list` mengonfirmasi `0001`–`0036` sinkron penuh (`local == remote`) di Staging |
| Subscription Guard & Expired Lock | **VERIFIED (Hard Lock + Server Action Guard)** | Rute dibatasi ke `/dashboard/expired`, mutasi dilindungi `requireActiveSubscription()`, dan `expire_trials()` aktif |
| Sinkronisasi Midtrans & Kuota | **VERIFIED (Rp149rb–Rp499rb / 28 Hari)** | Renewal akumulatif, upgrade kuota instan, CAS idempoten, & key Sandbox `Mid-*` terverifikasi |
| Integritas Keuangan & Edit Penjualan | **VERIFIED (Hybrid Edit + Symmetric Cash)** | Server-side pricing & HPP, rekonsiliasi kas/piutang atomik, penolakan multi-cicilan, kas flow tanpa double-count, neraca seimbang |
