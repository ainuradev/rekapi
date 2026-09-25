# Rekapin — SaaS Pendataan & Rekap UMKM

> **Membantu pemilik UMKM mencatat transaksi dan pengeluaran sekali, lalu sistem otomatis membuat rekap omzet, HPP, dan laba/rugi harian, mingguan, dan bulanan untuk setiap cabang.**

Customer pertama: **Dimsum Mentai** (2 cabang).

---

## 🛠 Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, Server Actions, Turbopack)
- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security, Supabase Auth, GoTrue Admin API)
- **Styling**: Tailwind CSS (Mobile-first UI untuk kasir & staf)
- **Deployment**: Vercel
- **Payment Gateway**: Midtrans (Subscription & Billing - on roadmap)

---

## 👥 Role & Hak Akses

| Fitur / Hak Akses | OWNER | PEGAWAI |
|---|---|---|
| **Akses Cabang** | Semua cabang | Terkunci di 1 cabang (`profiles.branch_id`) |
| **Model Akun** | 1 akun per owner | **1 akun shared per cabang** |
| **Kasir & Penjualan** | ✅ Semua cabang | ✅ Cabangnya sendiri |
| **Edit Transaksi** | ✅ Semua cabang (tercatat di audit log) | ✅ Transaksi miliknya sendiri (tercatat di audit log) |
| **Katalog Produk** | ✅ Full CRUD (bisa lihat & atur HPP) | ✅ Tambah produk (HPP otomatis 0 via trigger DB) |
| **HPP (Harga Pokok)** | ✅ Lihat, input, edit | ❌ Disembunyikan total (UI & level DB) |
| **Kelola Cabang** | ✅ Tambah / Hapus cabang | ❌ No Access (halaman & RLS diproteksi) |
| **Kelola Pegawai** | ✅ Buat akun via Supabase Admin API | ❌ No Access |
| **Laporan & Finansial** | ✅ Omzet, HPP, Laba Kotor/Bersih | ❌ No Access |

> **Keamanan Finansial (HPP)**: Pegawai diizinkan mendaftarkan produk baru ketika barang datang di cabang, namun nilai modal/HPP (`cost_price`) dikunci di level **Postgres Trigger** (`trg_enforce_cost_price`). Walaupun diakalin via form injection / API, nilai HPP otomatis dipaksa `0` jika user bukan role `owner`.

---

## 📂 Struktur Proyek

```text
app/
├── (auth)/
│   ├── login/page.tsx               # Login multi-role (Owner & Pegawai)
│   └── register/page.tsx            # Registrasi Owner baru (auto create business & profile)
├── api/
│   └── auth/signout/route.ts        # Endpoint signout session
└── dashboard/
    ├── layout.tsx                   # Layout responsif (desktop sidebar & mobile bottom nav)
    ├── dashboard-nav.tsx            # Komponen navigasi adaptif per role
    ├── page.tsx                     # Beranda dashboard & quick action menu
    ├── cabang/                      # Kelola cabang (Owner-only)
    │   ├── page.tsx
    │   └── actions.ts
    ├── produk/                      # Master katalog produk
    │   ├── page.tsx                 # Form adaptif (field HPP owner-only)
    │   ├── actions.ts
    │   └── cost-price-editor.tsx    # Inline editor HPP (Owner-only)
    ├── pegawai/                     # Kelola akun staf cabang (Owner-only)
    │   ├── page.tsx
    │   └── actions.ts               # Membuat akun via Supabase Admin API
    └── penjualan/
        ├── page.tsx                 # Entrypoint kasir (server component)
        ├── kasir-client.tsx         # UI POS kasir mobile-first (keranjang, HPP snapshot)
        ├── actions.ts               # Server Action createSale (branch lock server-side)
        └── riwayat/                 # Riwayat transaksi & audit edit
            ├── page.tsx
            ├── actions.ts           # updateSale & append-only sale_edit_logs
            ├── riwayat-client.tsx
            └── edit-sale-modal.tsx
```

---

## 🗄️ Database & Migrations

Database dikelola menggunakan Supabase PostgreSQL dengan total 6 migration script:

1. `0001_init_schema.sql`: Skema dasar 13 tabel, enums, foreign keys, dan index performa.
2. `0002_rls_policies.sql`: Aturan Row Level Security (RLS) multi-tenant isolation.
3. `0003_reports_and_trial_cron.sql`: Reporting Views (`v_sale_profit`, `v_daily_recap`) & cron auto-expire trial.
4. `0004_auth_trigger.sql`: Trigger `handle_new_user` saat signup registrasi owner.
5. `0005_products_and_editlog_fix.sql`: Pegawai boleh insert produk, trigger proteksi HPP, pengamanan audit log edit sale.
6. `0006_invite_employee_trigger.sql`: Pembaruan `handle_new_user` untuk membedakan registrasi owner baru vs pembuatan akun pegawai oleh owner.

Dokumentasi lengkap skema, relasi, dan tabel dapat dilihat di [ERD.md](file:///d:/rekapin/ERD.md).
Blueprint lengkap produk tersedia di [BLUEPRINT.md](file:///d:/rekapin/BLUEPRINT.md).

---

## 🚀 Memulai Pengembangan

### 1. Prasyarat
- Node.js 18+ atau 20+
- Akun Supabase (project baru)

### 2. Environment Variables
Buat file `.env.local` di root direktori:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # Digunakan server-side untuk membuat akun pegawai
```

### 3. Setup Database
Jalankan file migration SQL berurutan di SQL Editor Supabase Dashboard:
`0001` ➔ `0002` ➔ `0003` ➔ `0004` ➔ `0005` ➔ `0006`.

### 4. Jalankan Aplikasi
```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) pada browser Anda.
