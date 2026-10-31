# Supabase Staging Setup — Rekapi Phase 1

> [!CAUTION]
> Project `dnqzjrnyptwadojycxvm` (yang ter-link di repo ini) berisi **data pelanggan nyata**
> dan Midtrans **production**. Jangan pernah menjalankan seed, `db reset`, `db push`
> percobaan, atau integration test ke project tersebut.

## 1. Buat project staging (manual, butuh persetujuan pemilik akun)
1. Supabase Dashboard → New project → nama `rekapi-staging`, region sama dengan production,
   Postgres major version **17** (sesuai `supabase/config.toml`).
2. Free tier cukup. Pembuatan project bisa menimbulkan biaya bila org memakai paket berbayar — konfirmasi dulu.
3. Catat **project ref staging**. Jangan menyalin key production.

## 2. Terapkan migrasi ke staging dengan aman
CLI saat ini ter-link ke production. Jangan `supabase link` ulang di working copy utama.
Gunakan `--db-url` eksplisit agar target tidak mungkin tertukar:

```powershell
# Connection string dari Dashboard STAGING → Connect → Session pooler
$env:STAGING_DB_URL = "<isi manual, jangan di-commit>"
npx supabase db push --db-url $env:STAGING_DB_URL --dry-run   # cek daftar 0001–0020
npx supabase db push --db-url $env:STAGING_DB_URL
npx supabase migration list --db-url $env:STAGING_DB_URL       # semua harus sinkron
```

## 3. Akun & data dummy
1. Authentication → Add user (Auto confirm) untuk:
   `owner-a@rekapi-staging.test`, `pegawai-a@rekapi-staging.test`, `owner-b@rekapi-staging.test`
   dengan password acak khusus staging.
2. Jalankan [`supabase/staging/seed_phase1_staging.sql`](../supabase/staging/seed_phase1_staging.sql)
   di SQL Editor staging. Skrip memiliki safety guard data otomatis (menolak berjalan bila mendeteksi nama bisnis pelanggan production).
3. Tidak ada data pelanggan yang disalin; semua nama berawalan `IT `.

## 4. Payment gateway
Staging wajib Midtrans **Sandbox**: `MIDTRANS_IS_PRODUCTION=false`,
`NEXT_PUBLIC_MIDTRANS_SNAP_URL=https://app.sandbox.midtrans.com/snap/snap.js`, key `SB-Mid-*`.

## 5. Menjalankan integration test
Set env di sesi shell saja (jangan tulis ke `.env*` yang dipakai aplikasi):
```powershell
$env:RUN_STAGING_INTEGRATION="1"
$env:STAGING_PROJECT_REF="<ref staging>"
$env:STAGING_SUPABASE_URL="https://<ref staging>.supabase.co"
$env:STAGING_SUPABASE_ANON_KEY="<anon/publishable key STAGING>"   # BUKAN service role
$env:STAGING_OWNER_A_EMAIL="owner-a@rekapi-staging.test";   $env:STAGING_OWNER_A_PASSWORD="..."
$env:STAGING_EMPLOYEE_A_EMAIL="pegawai-a@rekapi-staging.test"; $env:STAGING_EMPLOYEE_A_PASSWORD="..."
$env:STAGING_OWNER_B_EMAIL="owner-b@rekapi-staging.test";   $env:STAGING_OWNER_B_PASSWORD="..."
node --test tests/integration/phase1-staging.integration.mjs
```
Guard di test menolak: ref production, ref yang ter-link CLI, URL≠ref, dan key `service_role`/`sb_secret_`.

## 6. Urutan yang disarankan
1. Jalankan suite **sebelum** draft 0021 → test `1b` dan `6` diharapkan **FAIL** (membuktikan celah nyata).
2. Terapkan `supabase/proposed/0021_harden_business_branch_rls.sql` ke staging saja, ulangi → harus PASS.
3. Test `7b` (manipulasi harga via RPC) membutuhkan perbaikan terpisah pada `create_sale_atomic`.
4. Baru setelah semua PASS, pindahkan 0021 ke `supabase/migrations/` dan rencanakan rilis production.
