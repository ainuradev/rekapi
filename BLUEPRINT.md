# Blueprint SaaS Pendataan & Rekap UMKM — **Rekapin**

*Versi terbaru — termasuk semua keputusan sampai fase implementasi Module 05-07 (kasir, produk, pegawai).*

---

## 1. Konsep Produk

**Nama project:** `Rekapin`

Core value:

> **Membantu pemilik UMKM mencatat transaksi dan pengeluaran sekali, lalu sistem otomatis membuat rekap omzet, HPP, dan laba/rugi harian, mingguan, dan bulanan untuk setiap cabang.**

Customer pertama: **Dimsum Mentai — 2 cabang**

**Tech stack:** Next.js (App Router, Server Actions) + Supabase (Postgres, Auth, RLS) + Vercel + Midtrans.

---

## 2. User & Role (Update)

### OWNER
- Akses semua cabang, semua transaksi
- Insert & update produk (termasuk HPP)
- Kelola cabang
- **Bikin akun pegawai langsung dari dalam app** (lewat `/dashboard/pegawai`, pakai Supabase Admin API)
- Edit transaksi manapun
- Lihat laba/rugi, laporan, pengeluaran

### PEGAWAI
- **1 akun shared per cabang** — bukan per orang. Semua kasir di Cabang A pakai 1 login yang sama.
- **`branch_id` fixed di akun**, tidak ada switcher cabang. Kalau butuh akses cabang lain, harus akun beda.
- Catat penjualan di cabangnya
- **Boleh nambah produk baru** (misal lapor barang baru datang) — **tapi field HPP disembunyikan dari form dia**, otomatis 0, diisi owner belakangan
- **Edit transaksi miliknya sendiri** (salah ketik qty/channel/metode bayar) — dengan audit log otomatis
- Tidak bisa: lihat HPP, lihat laba, lihat pengeluaran, lihat laporan keuangan, akses cabang lain, tambah/hapus akun pegawai lain

> **Kenapa HPP dikunci dari pegawai:** awalnya didesain pegawai isi HPP juga pas nambah produk, tapi itu bocorin info margin/modal ke pegawai — bertentangan sama prinsip "pegawai nggak boleh lihat data finansial". Solusinya: pegawai boleh insert nama produk & harga jual, tapi `cost_price` dikunci di level **database trigger** (bukan cuma disembunyikan di UI) — dipaksa 0 kalau yang insert bukan role owner, jadi nggak bisa diakalin lewat devtools/API.

---

## 3. Fitur yang Sudah Diimplementasikan (Progress Nyata)

Beda dari sekadar rencana, ini yang sudah jadi kode jalan di project:

| Fitur | Status | Catatan teknis |
|---|---|---|
| Register owner baru | ✅ Jalan | Trigger `handle_new_user` auto-create `businesses` + `profiles` (role owner) |
| Login/logout | ✅ Jalan | Supabase Auth + middleware refresh session |
| Multi-tenant isolation (RLS) | ✅ Tervalidasi | Tested pakai 2 akun beda business, data nggak bocor |
| CRUD Cabang | ✅ Jalan | Owner-only, via Server Actions |
| CRUD Produk | ✅ Jalan (updated) | Owner & pegawai bisa insert; HPP dikunci trigger DB, cuma owner yang bisa isi/edit |
| Kasir (Module 05) | ✅ Jalan | Keranjang, hitung total, snapshot HPP ke `sale_items`, UI dioptimasi buat HP |
| Branch lock buat pegawai | ✅ Jalan | `branch_id` diambil dari server (`profiles.branch_id`), nggak bisa dimanipulasi client |
| Edit transaksi + audit log | ✅ Jalan | `sale_edit_logs` append-only, pegawai cuma bisa edit transaksinya sendiri |
| Bikin akun pegawai dari app | ✅ Jalan | Pakai Supabase Admin API (`service_role` key) + trigger auth yang dimodif buat bedain "signup owner baru" vs "invite pegawai ke business existing" |
| Nav responsif (mobile bottom nav + desktop sidebar) | ✅ Jalan | Menu beda buat owner vs pegawai |
| Import Excel | ⏳ Belum | Module 03, masih rencana |
| Dashboard laporan (Omzet/HPP/Laba-Rugi) | ⏳ Belum | Module 08-09, view SQL-nya sudah dibuat (`v_daily_recap`), UI belum |
| Pembelian & Pengeluaran | ⏳ Belum | Module 06-07, schema sudah ada, UI belum |
| Midtrans subscription | ⏳ Belum | Module billing, belum mulai |

---

## 4. Perubahan Desain Penting (Dibanding Blueprint Awal)

1. **Laba/rugi pakai HPP**, bukan Omzet − Pengeluaran sederhana. `cost_price` di-snapshot ke `sale_items` saat transaksi terjadi, bukan live-join, biar laporan lama tetap akurat walau HPP produk berubah belakangan.

2. **Edit transaksi masuk MVP** (bukan ditunda ke V1.1) — karena pegawai pasti salah input dari hari pertama. Setiap edit wajib nulis ke `sale_edit_logs` (data lama, data baru, siapa, kapan) — append-only, nggak bisa dihapus/diubah lewat aplikasi.

3. **Model akun pegawai: shared login per cabang, fixed 1 cabang.** Bukan 1 akun per orang. Ini menyederhanakan onboarding (owner cuma perlu bikin 1 akun per cabang, bukan per kepala), tapi konsekuensinya: `sale_edit_logs` mencatat "siapa" berdasarkan akun shared itu, bukan individu pegawai yang benar-benar meng-input. Kalau nanti butuh akuntabilitas per-individu, perlu redesign ke akun per-orang.

4. **Pegawai boleh insert produk, tapi HPP dikunci di trigger database.** Ini keputusan yang direvisi di tengah jalan (awalnya semua field boleh diisi pegawai) — dan pengamanan-nya sengaja ditaruh di level Postgres trigger, bukan cuma validasi form, biar nggak bisa dilewatin.

5. **Owner bisa bikin akun pegawai dari dalam app**, bukan lewat form register publik. Ini butuh:
   - `SUPABASE_SERVICE_ROLE_KEY` (admin privilege, dipakai server-side saja)
   - Trigger `handle_new_user` yang dimodif: baca metadata `invited_business_id` untuk bedain user yang diundang owner (skip bikin business baru) vs signup normal (bikin business + profile owner baru)

6. **RLS diperketat bertahap** seiring ketemu celah:
   - `sale_edit_logs` insert awalnya cuma cek `business_id`, sekarang juga cek apakah pengedit berhak update sale itu (samain dengan rule update `sales`)
   - `products` insert dibuka buat semua role dalam tenant, tapi update/delete tetap owner-only

7. **UI/UX dibikin mobile-first** karena mayoritas pegawai akses dari HP: bottom nav (bukan sidebar) di layar kecil, tombol produk di kasir dibikin besar & touch-friendly, form pakai padding lebih besar (`py-2.5`/`py-3` bukan `py-1`/`py-2`).

---

## 5. Struktur Halaman Terkini

```text
app/
├── (auth)/
│   ├── login/page.tsx
│   └── register/page.tsx
│
├── api/
│   └── auth/signout/route.ts
│
└── dashboard/
    ├── layout.tsx                  # nav responsif, guard login
    ├── dashboard-nav.tsx           # bottom nav (mobile) / sidebar (desktop)
    ├── page.tsx                    # dashboard sederhana (belum laporan lengkap)
    │
    ├── cabang/
    │   ├── page.tsx
    │   └── actions.ts
    │
    ├── produk/
    │   ├── page.tsx                # form adaptif: HPP cuma muncul buat owner
    │   ├── actions.ts
    │   └── cost-price-editor.tsx   # inline edit HPP, owner-only
    │
    ├── pegawai/                    # owner-only
    │   ├── page.tsx
    │   └── actions.ts              # pakai Supabase Admin API
    │
    └── penjualan/
        ├── page.tsx                # server component, fetch produk & profile
        ├── kasir-client.tsx        # UI kasir, mobile-optimized
        ├── actions.ts              # createSale, branch_id dikunci server-side
        │
        └── riwayat/
            ├── page.tsx            # client component: list + inline edit
            └── actions.ts          # updateSale + getSalesHistory, nulis audit log
```

---

## 6. Database — Tabel & Migration Terkini

```text
0001_init_schema.sql              — skema dasar semua tabel
0002_rls_policies.sql             — RLS multi-tenant awal
0003_reports_and_trial_cron.sql   — view laporan (v_daily_recap) + auto-expire trial
0004_auth_trigger.sql             — trigger handle_new_user (versi awal, cuma signup biasa)
0005_products_and_editlog_fix.sql — pegawai boleh insert produk, HPP dikunci trigger,
                                     sale_edit_logs insert diperketat
0006_invite_employee_trigger.sql  — handle_new_user versi baru, support invite pegawai
```

**Environment variables yang dibutuhkan sekarang:**
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # buat admin.ts — bikin akun pegawai
```

---

## 7. Pricing (Tetap)

| Paket | Harga/bulan | Cabang |
|---|---|---|
| Free Trial | Rp0 | 7 hari |
| Basic | Rp100.000 | 1 cabang |
| Bisnis | Rp250.000 | 3 cabang |
| Profesional | Rp300.000 | Unlimited cabang + fitur lanjutan |

Payment gateway: **Midtrans** (belum diimplementasi, masih di roadmap).

---

## 8. Yang Belum Digarap (Prioritas Berikutnya)

Urutan yang masuk akal berdasarkan apa yang sudah jalan:

1. **Module 06-07 — Pembelian & Pengeluaran** (owner-only). Ini pelengkap data buat laporan laba/rugi yang akurat — tanpa ini, dashboard cuma bisa hitung laba kotor dari HPP doang, belum termasuk biaya operasional.
2. **Module 08-09 — Dashboard & Laporan.** View SQL `v_daily_recap` sudah ada dari migration 0003, tinggal dibikin UI-nya (filter periode + cabang, tampilan Omzet/HPP/Pengeluaran/Laba-Rugi).
3. **Module 03 — Import Excel.** Penting buat onboarding Dimsum Mentai supaya data historis mereka nggak perlu diketik ulang manual.
4. **Guard role di level halaman**, bukan cuma di RLS. Sekarang kalau pegawai buka `/dashboard/cabang` misalnya, dia bakal kena error dari RLS pas nyoba nambah data, tapi UI-nya sendiri belum otomatis nyembunyiin/redirect. Worth dirapihin sebelum onboarding customer beneran.
5. **Midtrans integration** — baru relevan setelah fitur inti (Module 01-10) beres semua dan siap dipakai customer pertama secara nyata.

---

## 9. Lampiran — File Teknis yang Sudah Dibuat

- `0001` – `0006` — migration SQL (skema, RLS, views, trigger auth)
- `ERD.md` — diagram relasi entitas
- `lib/supabase/client.ts`, `server.ts`, `admin.ts` — Supabase client helpers
- `middleware.ts` — session refresh + guard `/dashboard`
- Semua file di bawah `app/(auth)/`, `app/dashboard/` sesuai struktur di Bagian 5
