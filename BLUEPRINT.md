# Blueprint SaaS POS & Akuntansi UMKM — **Rekapi**

*Versi Arsitektur & Spesifikasi Terkini — Mencakup Implementasi Lengkap Fase 1, Fase 2, dan Fase 3 (Migrasi 0001 s/d 0045).*

---

## 1. Konsep Produk & Visi Arsitektur

**Nama Produk:** `Rekapi`  
**Target Pasar:** Pemilik UMKM Multi-Cabang (F&B, Ritel, Jasa).  
**Core Value Proposition:**
> *"Membantu pemilik UMKM mencatat transaksi kasir (POS), pembelian stok, mutasi bahan baku, serta biaya operasional secara mudah dan cepat, lalu sistem otomatis menyusun laporan keuangan terpadu (Arus Kas, Laba-Rugi, dan Neraca) per cabang maupun konsolidasi seluruh bisnis."*

**Tech Stack Inti:**
* **Frontend:** Next.js 16 (App Router, React Server Components, Server Actions).
* **Styling & UI:** Tailwind CSS (Clean Sheet Emerald, Spreadsheet Table View, Responsive Mobile-First).
* **Backend & Database:** Supabase (PostgreSQL 15+, Database Triggers, PL/pgSQL Atomic Stored Procedures, Row Level Security).
* **Media Storage & Image CDN:** Cloudinary Unsigned Upload (`400x400 px` WebP untuk Foto Produk & `800x1000 px` WebP untuk QRIS Statis Toko).
* **Payment Gateway & Billing:** Midtrans Snap & Core API (QRIS, GoPay, Virtual Account, Credit Card) dengan Webhook Idempotency.

---

## 2. Model User, Role & Hak Akses

### A. Role: OWNER (Pemilik Bisnis)
* **Wewenang Penuh Multi-Cabang:** Mengakses seluruh data transaksi, stok, pegawai, dan keuangan di semua cabang miliknya.
* **Master Finansial & HPP:** Mengelola Harga Pokok Penjualan (HPP / `cost_price`), batas kredit piutang, modal disetor, penarikan prive, serta rekening kas & bank.
* **Akses Pembatalan (Void):** Satu-satunya role yang berhak membatalkan (void) transaksi penjualan dan mengembalikan stok cabang serta saldo kas secara otomatis.
* **Manajemen Pegawai:** Mengundang dan mengelola akun kasir per cabang langsung dari aplikasi melalui Supabase Admin API.
* **Akses Laporan:** Mengakses Laba-Rugi, Neraca Keuangan, Arus Kas, dan Analisis Kinerja Cabang.

### B. Role: PEGAWAI (Kasir Cabang)
* **Cabang Terkunci (`branch_id` fixed):** Akun terikat secara ketat pada 1 cabang spesifik yang ditentukan oleh Owner. Tidak dapat berpindah cabang atau melihat data cabang lain.
* **Kasir Cepat & Penjualan Kredit:** Mencatat transaksi kasir, input DP, cetak struk (Thermal 58/80mm & PDF), serta mencatat pelunasan cicilan piutang di cabangnya.
* **Proteksi HPP di Level Database:** Boleh mendaftarkan produk baru, namun kolom `cost_price` disembunyikan dan dipaksa `0` oleh trigger PostgreSQL jika pemanggil bukan Owner.
* **Edit Transaksi Terbatas & Audit Log:** Dapat mengedit transaksi di cabangnya sendiri dalam batas toleransi waktu operasional, dan setiap perubahan wajib terekam ke `sale_edit_logs`.
* **Dibatasi:** Tidak dapat melihat laba-rugi, neraca, mutasi modal/prive, rekening penampung owner, atau menghapus/void transaksi.

---

## 3. Daftar Modul & Status Implementasi (Fase 1 s/d Fase 3)

| Kode Modul | Nama Modul | Status | Ringkasan Arsitektur & Migrasi DB |
|---|---|---|---|
| **MOD-01** | **Multi-Tenant & Autentikasi** | ✅ Selesai | Registrasi Owner otomatis membuat tenant `businesses` + `profiles`. RLS terisolasi via fungsi database `auth_business_id()`. *(0001, 0002, 0004, 0021)* |
| **MOD-02** | **Multi-Cabang (Branches)** | ✅ Selesai | CRUD cabang, validasi batas kuota cabang sesuai tier paket langganan. *(0001, 0020, 0022, 0027)* |
| **MOD-03** | **Katalog Produk & Kategori** | ✅ Selesai | Master produk, barcode/SKU, kategori enum, unit kemasan, proteksi trigger HPP Owner-only. *(0001, 0005, 0009, 0013, 0019)* |
| **MOD-04** | **Stok Produk Cabang** | ✅ Selesai | Saldo stok per cabang (`product_branch_stocks`), auto-deduct saat penjualan, auto-restock saat void. *(0008, 0014, 0026)* |
| **MOD-05** | **POS Kasir Atomik** | ✅ Selesai | Keranjang cepat, channel penjualan, metode bayar (Tunai, Transfer, QRIS, Tempo/Kredit), uang muka (DP), integrasi pelanggan, limit piutang, dan pencatatan atomik via RPC `create_sale_atomic`. *(0016, 0021, 0029)* |
| **MOD-06** | **Riwayat Transaksi Spreadsheet** | ✅ Selesai | Tampilan grid spreadsheet ala Excel dengan formula bar `=SUM`, pencarian ribbon, filter status, audit trail modal, cetak struk instant, dan soft-void via RPC `void_sale_atomic`. *(0017, 0018, 0029, 0030)* |
| **MOD-07** | **Master Bahan Baku & Supplier** | ✅ Selesai | Master bahan baku (`raw_materials`), satuan konversi, ambang batas minimum, direktori supplier, riwayat pembelian, dan integrasi stok bahan baku cabang terhubung ke kas/utang. *(0023, 0026, 0031)* |
| **MOD-08** | **Kartu Mutasi Bahan Baku** | ✅ Selesai | Ledger mutasi persediaan immutable (`inventory_mutations`), saldo awal, saldo berjalan (`balance_after`), dan pencatatan via RPC `record_inventory_mutation_atomic`. *(0023)* |
| **MOD-09** | **Master Pelanggan & Piutang** | ✅ Selesai | Direktori pelanggan (`customers`), limit plafon piutang, dan integrasi validasi kredit saat penjualan kasir. *(0024, 0029)* |
| **MOD-10** | **Kas & Rekening Bank** | ✅ Selesai | Master rekening (`financial_accounts`), tipe Cash/Bank/E-Wallet, penanda default, transfer antar-rekening, proteksi penghapusan akun terakhir. *(0028)* |
| **MOD-11** | **Utang Usaha (Payables)** | ✅ Selesai | Pencatatan utang operasional & supplier, otomatis tercatat saat pembelian tempo (`purchases.purchase_id`), tanggal jatuh tempo, status cicilan, dan pembayaran bertahap memotong kas riil. *(0028, 0031)* |
| **MOD-12** | **Piutang Usaha (Receivables)** | ✅ Selesai | Pencatatan piutang terpadu, partial unique index `uq_receivables_business_sale`, sinkronisasi pelunasan atomik ke penjualan kasir. *(0028, 0029, 0030)* |
| **MOD-13** | **Ekuitas & Modal Usaha** | ✅ Selesai | Setoran modal awal, tambahan modal pemilik, dan penarikan prive yang langsung berdampak ke saldo kas/bank dan neraca. *(0028)* |
| **MOD-14** | **Biaya & Beban Operasional** | ✅ Selesai | Kategori beban (gaji, listrik, sewa, dll.), pemotongan akun kas/rekening penampung riil, dan pemulihan saldo saat beban dihapus. *(0028)* |
| **MOD-15** | **Laporan Laba-Rugi (P&L)** | ✅ Selesai | Perhitungan Omzet Penjualan (non-void), HPP Modal Snapshot, Laba Kotor, Total Beban, dan Laba Bersih Operasional. *(0003, 0028, 0029)* |
| **MOD-16** | **Laporan Neraca (Balance Sheet)** | ✅ Selesai | Posisi Aset Lancar (Kas & Bank + Piutang Usaha + Persediaan Produk & Bahan Baku `quantity * cost_per_unit`) = Kewajiban (Utang Usaha) + Ekuitas Bersih. *(0028, 0031)* |
| **MOD-17** | **Laporan Arus Kas (Cash Flow)** | ✅ Selesai | Arus kas masuk (penjualan tunai, DP, pelunasan piutang, modal) vs arus kas keluar (beban operasional kas, pembelian bahan baku riil `paid_amount`, pembayaran utang, prive; beban non-kas dikecualikan). *(0028, 0029, 0031, 0042)* |
| **MOD-18** | **Cetak Struk, Nota POS & QRIS Toko** | ✅ Selesai | Komponen `InvoiceModal` mendukung format Thermal 58mm, Thermal 80mm, dan standar A4, disertai penampilan gambar QRIS statis toko (`qris_image_url`, `800x1000 px`) saat kasir memilih metode bayar `QRIS`. *(0020, 0025, 0045)* |
| **MOD-19** | **Langganan Midtrans & Tier Gating** | ✅ Selesai | Paket langganan 28 hari: **Standard (`Rp 49.000`, coret `Rp 149.000`, 1 Cabang Utama & 1 Kasir)**, **Business (`Rp 99.000`, coret `Rp 299.000`, Maks 3 Cabang & 3 Kasir)**, dan **Pro (`Rp 179.000`, coret `Rp 499.000`, Maks 5 Cabang & 5 Kasir)** + Trial 7 Hari. Dilengkapi auto-deactivate cabang/kasir saat downgrade (`auto_deactivate_on_downgrade`). *(0010, 0011, 0015, 0027, 0039, 0040, 0045)* |
| **MOD-20** | **Cabang Utama (`PUSAT`) & Penyatuan Stok Induk** | ✅ Selesai | Setiap bisnis wajib memiliki 1 Cabang Utama (`code = 'PUSAT'`). Mode Konsolidasi (`all`) otomatis meresolusi mutasi ke Cabang Utama. Penyesuaian stok rusak/kedaluwarsa (`waste_expired`) otomatis mencatat Beban Kerugian Non-Kas (`expenses.is_non_cash = true`) tanpa memotong saldo Kas/Bank. *(0039, 0042)* |
| **MOD-21** | **Pusat Notifikasi & Interactive Product Tour** | ✅ Selesai | Pengumuman broadcast & notifikasi tenant dari Super Admin (`system_notifications` & `notification_reads`) terhubung ke lonceng navbar, dilengkapi panduan interaktif `ProductTour` untuk pengguna baru. *(0043, 0044)* |

---

## 4. Arsitektur Single Source of Truth (SSOT) & Sinkronisasi Keuangan

Arsitektur Rekapi menerapkan prinsip ketat akuntansi dan transaksi berintegritas tinggi untuk mengeliminasi dualisme data:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ALUR TRANSAKSI PENJUALAN                        │
└────────────────────────────────────────────────────────────────────────┘
                                    │
               Penjualan Kredit     ▼     Penjualan Tunai
         ┌─────────────────────────────────────────────────┐
         │                                                 │
         ▼                                                 ▼
┌──────────────────┐                             ┌──────────────────┐
│   receivables    │◄─── Relasi 1:1 Terkunci ───►│      sales       │
│  (Kartu Piutang) │      (sale_id, biz_id)      │  (Header Bon)    │
└──────────────────┘                             └──────────────────┘
         │                                                 ▲
         │                                                 │
         │ Pelunasan Kasir atau Keuangan                   │ Sinkron Status
         ▼ (RPC record_sale_payment_atomic)                │ & Paid Amount
┌──────────────────────────────────────────────────────────┴────────┐
│              sale_payments (SSOT Riwayat Pembayaran)              │
│    • Immutable Ledger     • Idempotency Key (UUID)                │
└──────────────────────────────────┬────────────────────────────────┘
                                   │
                                   ▼ Menghasilkan Jurnal Kas Masuk
┌───────────────────────────────────────────────────────────────────┐
│        financial_transactions (SSOT Buku Besar Arus Kas)          │
│    • Type: income          • Category: receivable_payment / sale  │
│    • Akun Kas / Bank       • Mengubah financial_accounts balance  │
└───────────────────────────────────────────────────────────────────┘
```

### A. `sale_payments` Sebagai SSOT Mutasi Kasir
Setiap rupiah yang dibayarkan oleh pelanggan — baik pembayaran lunas di awal, uang muka (DP), maupun cicilan pelunasan bertahap — dicatat sebagai baris mutasi permanen (*immutable*) pada tabel `sale_payments`.
* Dilengkapi nomor pembayaran unik (`PAY/YYYYMMDD/XXXX`).
* Dilengkapi `idempotency_key` bertipe UUID untuk menangkal klik ganda (*double-payment*).

### B. `financial_transactions` Sebagai SSOT Arus Kas
Tabel `financial_transactions` adalah buku besar kas tunggal untuk memantau aliran dana keluar-masuk.
* Penjualan kredit tanpa DP (**unpaid**) **TIDAK** mencatat mutasi kas fiktif.
* Pembayaran uang muka (DP) dan pelunasan piutang mencatat transaksi kas masuk riil pada akun kas/bank penampung yang dipilih.

### C. Sinkronisasi 1:1 Penjualan & Piutang
* Transaksi tempo/kredit otomatis membuat kartu piutang pada `receivables` dengan menautkan `sale_id`.
* Partial unique index `uq_receivables_business_sale` memastikan tidak ada lebih dari satu kartu piutang untuk satu transaksi penjualan.
* Pelunasan piutang yang dilakukan melalui menu Keuangan (`payReceivable`) secara otomatis didelegasikan ke RPC `record_sale_payment_atomic`, sehingga status pembayaran pada `sales`, kartu piutang pada `receivables`, saldo akun pada `financial_accounts`, dan riwayat pembayaran pada `sale_payments` selalu sinkron 100%.

### D. Proteksi Audit Jejak Transaksi
* Kartu piutang yang bersumber dari kasir (`sale_id IS NOT NULL`) **dilarang dihapus secara manual** melalui menu Keuangan. Penghapusan akan memicu pesan peringatan yang mengarahkan pengguna untuk membatalkan (void) penjualan terkait di menu Riwayat Penjualan.
* Pembatalan transaksi (Void) melalui `void_sale_atomic` akan mengembalikan saldo stok produk ke cabang, membatalkan piutang terkait, dan membalikkan seluruh uang kas yang pernah dicatat di `sale_payments`.

---

## 5. Stored Procedures / RPC Database Utama

1. **`create_sale_atomic`**:
   * Memvalidasi otorisasi pemanggil, batas cabang pegawai, dan limit kredit piutang pelanggan.
   * Menyimpan header `sales` dan detail `sale_items`.
   * Memotong stok cabang secara atomik.
   * Mencatat `receivables` jika transaksi kredit/unpaid.
   * Mencatat DP ke `sale_payments` dan `financial_transactions` jika ada pembayaran di muka.
2. **`record_sale_payment_atomic`**:
   * Menerima parameter `p_recorded_by` dan `p_user_id` dengan fallback aman.
   * Memvalidasi toleransi idempotency key UUID via regex.
   * Mengunci baris `sales` dan `receivables` via `FOR UPDATE` untuk mencegah race-condition.
   * Memvalidasi batas pembayaran agar tidak melebihi sisa tagihan piutang (*overpayment prevention*).
   * Memperbarui `sales`, `receivables`, `financial_accounts`, serta meng-insert ke `sale_payments` dan `financial_transactions`.
3. **`void_sale_atomic`**:
   * Soft-void: Menandai transaksi `status = 'voided'` demi jejak audit.
   * Mengembalikan seluruh stok item ke `product_branch_stocks`.
   * Menandai piutang terkait sebagai void/batal.
   * Membalikkan saldo kas/bank sejumlah total penerimaan yang pernah tercatat di `sale_payments`.
4. **`record_inventory_mutation_atomic`**:
   * Mencatat mutasi keluar/masuk bahan baku pada cabang.
   * Menjaga integritas saldo kumulatif (`balance_after`) pada kartu stok persediaan.
5. **`auto_deactivate_on_downgrade`**:
   * Saat bisnis turun paket (misal dari `Pro`/`Business` ke `Standard` atau berakhirnya masa aktif), secara atomik mempertahankan **Cabang Utama (`code = 'PUSAT'`)** tetap `active`, menonaktifkan cabang tambahan (`branches.status = 'inactive'`), serta menonaktifkan akun kasir di cabang tambahan (`profiles.is_active = false`).
6. **`record_purchase_with_stock_atomic`**:
   * Mencatat pembelian bahan baku beserta detail item secara atomik, memperbarui stok cabang dan harga beli acuan (`cost_per_unit`), serta memotong saldo kas/bank (untuk pembelian lunas) atau menerbitkan utang usaha di `debts_payables` (untuk pembelian tempo/kredit tanpa mendouble-count ke beban operasional).

---

## 5B. Tabel Resmi Paket Langganan, Kuota & Value-Based Feature Gating

Seluruh paket berbayar berlaku selama **28 hari** (ditambah masa **Trial 7 Hari** untuk bisnis baru dengan akses fitur setara Pro, kuota 1 Cabang Utama & 1 Kasir):

| Kode Paket | Nama Paket | Harga Aktif (28 Hari) | Harga Coret | Kuota Cabang (`max_branches`) | Kuota Kasir (`max_employees`) | Modul yang Terbuka |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`standard`** | **Standard** | **Rp 49.000** /bln | ~~Rp 149.000~~ | **1 Cabang Utama** | **1 Akun Kasir** | Kasir POS 7 Channel, Katalog Produk & Foto (`image_url`) + HPP, QRIS Statis Toko (`qris_image_url`), CRM Pelanggan, Beban Operasional, Laba Rugi, Kinerja Produk |
| **`business`** | **Business** *(Populer)* | **Rp 99.000** /bln | ~~Rp 299.000~~ | **Maks 3 Cabang** | **Maks 3 Akun Kasir** | Semua fitur Standard + **Stok Bahan Baku & Pembelian Supplier**, **Buku Kas & Rekening Bank + Setoran Cabang**, **Buku Utang Supplier & Piutang Pelanggan**, Ekspor Excel/CSV |
| **`pro`** | **Pro** | **Rp 179.000** /bln | ~~Rp 499.000~~ | **Maks 5 Cabang** | **Maks 5 Akun Kasir** | Semua fitur Business + **Laporan Neraca SAK EMKM**, **Laporan Arus Kas (3 Aktivitas)**, **Manajemen Modal Disetor & Prive**, Konsolidasi Keuangan Lintas Cabang & Akses API |

---

## 6. Peta Struktur Aplikasi (Next.js App Router)

```text
app/
├── (auth)/
│   ├── login/
│   └── register/
├── api/
│   ├── auth/signout/
│   └── midtrans/
│       ├── create-transaction/
│       ├── cancel-transaction/
│       └── notification/           # Webhook handler dengan verifikasi signature & idempotency
└── dashboard/
    ├── page.tsx                    # Dashboard ringkasan eksekutif (KPI omzet, laba kotor, stok menipis)
    ├── cabang/                     # Master cabang & kuota paket langganan
    ├── pegawai/                    # Manajemen akun kasir cabang
    ├── pelanggan/                  # Master customer & manajemen limit kredit piutang
    ├── produk/                     # Katalog produk, barcode/SKU, kategori, dan proteksi HPP
    ├── bahan-baku/                 # Master bahan baku, kartu stok mutasi, dan direktori supplier
    ├── penjualan/
    │   ├── page.tsx                # Terminal Kasir POS (Touch-friendly, Tunai, Transfer, QRIS, Tempo)
    │   └── riwayat/                # Riwayat Penjualan Spreadsheet (Excel Mode, Filter Ribbon, Struk, Void)
    ├── keuangan/
    │   ├── page.tsx                # Ikhtisar Laporan Keuangan
    │   ├── arus-kas/               # Laporan Arus Kas Riil (Inflow vs Outflow)
    │   ├── laba-rugi/              # Laporan Laba-Rugi (Omzet - HPP - Beban = Laba Bersih)
    │   ├── neraca/                 # Laporan Neraca (Aset = Kewajiban + Ekuitas)
    │   ├── kas-rekening/           # Manajemen Akun Kas & Rekening Bank
    │   ├── utang-piutang/          # Manajemen Utang Usaha & Piutang Pelanggan
    │   ├── beban/                  # Buku Kas Beban & Biaya Operasional
    │   ├── modal/                  # Catatan Setoran Modal & Prive Pemilik
    │   └── kinerja/                # Grafik Analitik & Performa Antar-Cabang
    ├── subscription/               # Pilih paket, pembayaran Midtrans Snap, riwayat invoice
    └── profil/                     # Profil usaha, logo bisnis, dan QRIS statis
```
