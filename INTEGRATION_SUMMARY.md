# Integrasi Midtrans & Sistem Langganan Rekapi — Summary

## ✅ Arsitektur & Komponen yang Telah Terimplementasi

### 1. **Konfigurasi Fail-Closed Midtrans** (`lib/midtrans/config.ts`)
- Validasi ketat (`validateMidtransConfig`) dengan mekanisme **fail-closed**:
  - Menolak keras penggunaan `MIDTRANS_IS_PRODUCTION=true` pada environment non-production (`development`, `test`, `staging`, `preview`) maupun saat aplikasi mengarah ke database Supabase Staging (`ucvgszazrjnjaglaiswq`).
  - Memvalidasi format kredensial: saat `MIDTRANS_IS_PRODUCTION=false` (Sandbox), mendukung penuh kredensial Sandbox format terbaru (`Mid-server-*` / `Mid-client-*`) maupun format klasik (`SB-Mid-server-*` / `SB-Mid-client-*`); saat `MIDTRANS_IS_PRODUCTION=true` (Production), mewajibkan awalan `Mid-server-*` / `Mid-client-*` serta mencegah kebocoran placeholder atau mismatch URL `snap.js`.
- Helper diagnostik `getMidtransConfigStatus` memasking secret key sehingga nilai sensitif tidak pernah bocor ke log/response.
- Inisialisasi client `getMidtransSnap()` (Snap Popup) dan `getMidtransCoreApi()` (verifikasi status server-to-server).

### 2. **Sinkronisasi Status & Siklus Masa Aktif** (`lib/midtrans/sync.ts`)
- `syncPaymentStatus(orderId, rawNotification)`:
  - Memastikan **idempotensi penuh & bebas race condition** menggunakan klaim atomik *Compare-And-Swap* (`UPDATE payment_transactions ... WHERE midtrans_order_id = $1 AND status <> 'settlement'`): meskipun webhook Midtrans dan *manual sync* (`/dashboard/subscription/success`) berjalan secara paralel untuk `order_id` yang sama, masa aktif **hanya diperpanjang tepat 1 kali**.
  - Melakukan verifikasi status aktual secara server-to-server ke Midtrans Core API (`coreApi.transaction.status(orderId)`).
  - Memetakan `settlement` dan `capture` (`fraud_status = 'accept'`) ke status langganan `active`, serta `cancel` / `deny` / `expire` ke `canceled`.
  - Menghitung masa aktif melalui `calculateSubscriptionRenewalExpiry` berdasarkan kolom `subscription_plans.duration_days` (default **28 hari**) terhadap `businesses.subscription_expires_at`:
    - **Renewal Lebih Awal**: Jika bisnis masih `active` (`subscription_expires_at > now()`), sisa hari aktif diakumulasikan penuh (misal `sisa 10 hari + 28 hari = 38 hari`).
    - **Upgrade / Ganti Paket Saat Aktif**: Kolom `businesses.subscription_plan_id` langsung diperbarui ke paket baru saat `settlement` (sehingga kuota `max_branches` & `max_employees` langsung naik) sambil menandai baris `subscriptions` aktif lama sebagai `expired` dan tetap mengakumulasikan sisa hari aktif.
  - Memperbarui `payment_transactions`, `subscriptions`, dan kolom langganan pada `businesses` melalui Service Role client (karena kolom langganan `businesses` dikunci dari mutasi langsung client oleh RLS di migrasi `0021`).
- `cancelPendingTransaction(orderId, businessId)`:
  - Membatalkan transaksi berstatus `pending` secara aman apabila pengguna menutup popup Snap atau kembali sebelum menyelesaikan pembayaran (tidak pernah membatalkan transaksi yang sudah `settlement`).

### 3. **API Routes (`/api/midtrans/*`)**

#### `POST /api/midtrans/create-transaction`
- Memverifikasi autentikasi pengguna dan memastikan hanya role **`owner`** yang dapat membuat transaksi langganan.
- Mengambil harga resmi (`price`) dan durasi (`duration_days`, default **28 hari**) langsung dari tabel `subscription_plans` di server (anti manipulasi harga dari client).
- Membuat Order ID terstruktur dengan format `REKAPI-[businessId-8char]-[timestamp]`.
- Menyimpan record awal berstatus `pending` ke `subscriptions` dan `payment_transactions`, lalu mengembalikan `token`, `redirectUrl`, `orderId`, `snapUrl`, dan `clientKey` yang sudah tervalidasi.

#### `POST /api/midtrans/notification`
- Endpoint webhook resmi untuk menerima notifikasi pembayaran dari Midtrans.
- Memverifikasi tanda tangan kriptografi **SHA-512** (`SHA512(order_id + status_code + gross_amount + server_key)`). Payload tidak lengkap ditolak `400`, signature palsu ditolak `403`, dan order tidak dikenal ditolak `404`.
- Memanggil `syncPaymentStatus` untuk mengaktifkan paket dan kuota bisnis secara otomatis.

#### `POST /api/midtrans/cancel-transaction`
- Endpoint khusus **`owner`** untuk membatalkan pesanan `pending` milik bisnisnya sendiri saat popup pembayaran ditutup (`onClose`).

### 4. **Penegakan Kuota Paket & Akses Fitur** (`lib/subscription-limits.ts` & `lib/subscription-access.ts`)
- Semua batas kuota ditarik secara dinamis dari tabel `subscription_plans` di database dan ditegakkan berlapis (UI + Server Action + Database Trigger):
  - **Kuota Cabang (`canAddBranch`)**: Ditegakkan di `app/dashboard/cabang/actions.ts` serta trigger database `trg_enforce_branch_limit` (`0021` & `0022`).
  - **Kuota Pegawai Kasir (`canAddEmployee` & `canAssignEmployeeToBranch`)**: Ditegakkan di `app/dashboard/pegawai/actions.ts`, unique index `uq_branch_single_employee`, dan trigger `trg_enforce_employee_limit` (`0027`).
  - **Aturan 1 Cabang = 1 Akun Pegawai**: Setiap cabang maksimal memiliki 1 akun login berperan `pegawai` (kasir tidak dibagi lintas cabang).
  - **Akses Fitur (`hasActiveAccess`, `canAccessAdvancedReports`, `canAccessAPI`)**: Mengatur akses laporan lanjutan dan API sesuai flag paket aktif.

### 5. **Halaman Subscription (`/dashboard/subscription`)**
- `/dashboard/subscription` — Halaman pemilihan & perpanjangan paket (khusus **owner**), terintegrasi dengan Snap popup dan fallback `redirectUrl`.
- Halaman Callback:
  - `/dashboard/subscription/success` — Verifikasi langsung ke `syncPaymentStatus(orderId)` sebelum menampilkan konfirmasi aktif.
  - `/dashboard/subscription/pending` — Instruksi penyelesaian pembayaran tertunda (VA / QRIS / convenience store).
  - `/dashboard/subscription/unfinish` — Membatalkan transaksi `pending` saat pengguna kembali sebelum membayar.
  - `/dashboard/subscription/error` — Informasi kegagalan pembayaran dan opsi coba ulang.

---

## 💳 Spesifikasi Resmi Paket Langganan (Siklus 28 Hari)

Sesuai migrasi database `0010_update_subscription_plans.sql`, `0011_subscription_plan_config.sql`, `0022_sync_trial_branch_limits.sql`, dan `0027_update_plan_limits_and_one_employee_per_branch.sql`:

| Paket (`code`) | Harga | Durasi | Maks. Cabang (`max_branches`) | Maks. Akun Kasir (`max_employees`) | Laporan Advanced & HPP | Akses API |
|---|---:|---:|---:|---:|:---:|:---:|
| **Trial** (`trial`) | Gratis | 7 hari | 1 cabang | 1 pegawai (1/cabang) | ❌ | ❌ |
| **Standard** (`standard`) | **Rp 149.000** | **28 hari** | **1 cabang** | **1 pegawai** (1/cabang) | ❌ | ❌ |
| **Business** (`business`) | **Rp 299.000** | **28 hari** | **3 cabang** | **3 pegawai** (1/cabang) | ✅ | ❌ |
| **Pro** (`pro`) | **Rp 499.000** | **28 hari** | **5 cabang** | **5 pegawai** (1/cabang) | ✅ | ✅ |

> **Catatan Aturan Bisnis:**
> - Apabila status bisnis bukan `active` (`trial`, `expired`, `pending`, atau `canceled`), sistem secara otomatis menerapkan batas konservatif `TRIAL_LIMITS` (**1 cabang** dan **1 akun pegawai**).
> - Setiap cabang hanya dapat ditempati maksimal **1 akun `pegawai`** (`uq_branch_single_employee`).

---

## 🔧 Konfigurasi Environment Variables

Pastikan pemisahan ketat antara environment **Staging/Development (Sandbox)** dan **Production**:

```bash
# Midtrans Sandbox (Development / Staging)
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_SERVER_KEY=SB-Mid-server-YOUR_SANDBOX_SERVER_KEY
MIDTRANS_CLIENT_KEY=SB-Mid-client-YOUR_SANDBOX_CLIENT_KEY
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=SB-Mid-client-YOUR_SANDBOX_CLIENT_KEY
NEXT_PUBLIC_MIDTRANS_SNAP_URL=https://app.sandbox.midtrans.com/snap/snap.js
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Di Midtrans Dashboard (**Settings → Configuration**), arahkan URL berikut:
- **Payment Notification URL**: `https://<DOMAIN_ANDA>/api/midtrans/notification`
- **Finish Redirect URL**: `https://<DOMAIN_ANDA>/dashboard/subscription/success`
- **Unfinish Redirect URL**: `https://<DOMAIN_ANDA>/dashboard/subscription/unfinish`
- **Error Redirect URL**: `https://<DOMAIN_ANDA>/dashboard/subscription/error`

---

## 🧪 Pengujian & Verifikasi

### 1. Menjalankan Unit Test Midtrans & Kuota Langganan
```bash
node --test tests/midtrans-config-safety.test.mjs tests/midtrans-payment-lifecycle.test.mjs tests/p5-midtrans-subscription-hardening.test.mjs tests/subscription-limits-and-plans.test.mjs
```

### 2. Uji Pembayaran Manual di Midtrans Sandbox
1. Pastikan `.env.local` menggunakan kredensial Sandbox (`SB-Mid-*`) dan `MIDTRANS_IS_PRODUCTION=false`.
2. Login sebagai **Owner** → buka menu **Langganan** (`/dashboard/subscription`).
3. Pilih paket (**Standard Rp149.000**, **Business Rp299.000**, atau **Pro Rp499.000**).
4. Gunakan kartu uji Midtrans Sandbox (mis. Visa `4811 1111 1111 1114`, CVV `123`, Exp `01/30`, OTP `112233`) atau simulator Virtual Account/QRIS Midtrans.
5. Verifikasi hasil di database:
   - `payment_transactions.status` berubah menjadi `settlement`.
   - `subscriptions.status` menjadi `active` dengan `expires_at` bertambah **28 hari**.
   - `businesses.subscription_status` menjadi `active` dan kuota cabang/pegawai mengikuti paket terpilih.

---

## 📚 Daftar File Terkait

```text
lib/midtrans/config.ts
lib/midtrans/sync.ts
lib/subscription-limits.ts
lib/subscription-access.ts
app/api/midtrans/create-transaction/route.ts
app/api/midtrans/notification/route.ts
app/api/midtrans/cancel-transaction/route.ts
app/dashboard/subscription/page.tsx
app/dashboard/subscription/subscription-client.tsx
app/dashboard/subscription/success/page.tsx
app/dashboard/subscription/pending/page.tsx
app/dashboard/subscription/unfinish/page.tsx
app/dashboard/subscription/error/page.tsx
supabase/migrations/0010_update_subscription_plans.sql
supabase/migrations/0011_subscription_plan_config.sql
supabase/migrations/0012_add_pending_status.sql
supabase/migrations/0015_rls_subscription_plans.sql
supabase/migrations/0021_harden_business_branch_rls.sql
supabase/migrations/0022_sync_trial_branch_limits.sql
supabase/migrations/0027_update_plan_limits_and_one_employee_per_branch.sql
MIDTRANS_SETUP.md
INTEGRATION_SUMMARY.md
```
