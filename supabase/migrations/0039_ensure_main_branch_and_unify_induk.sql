-- ================================================================
-- Migration 0039: Ensure Main Branch & Unify Induk Architecture
-- 1. Update handle_new_user() trigger to automatically create "Cabang Utama" (code: PUSAT)
--    and assign owner's profile.branch_id to this 1st branch.
-- 2. Backfill existing businesses that lack branches with "Cabang Utama".
-- 3. Set code = 'PUSAT' on the 1st/primary branch of each business.
-- 4. Backfill profiles.branch_id to the business's primary branch if NULL.
-- 5. Unify orphaned records (branch_id IS NULL) in sales, expenses, purchases,
--    debts_payables, and receivables to Cabang Utama.
-- 6. Initialize product_branch_stocks and raw_material_branch_stocks for Cabang Utama.
-- ================================================================

-- ─── 1. UPDATE TRIGGER handle_new_user() ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
  v_invited_business_id uuid;
  v_invited_branch_id uuid;
  v_main_branch_id uuid;
BEGIN
  -- 1. Ekstrak data undangan dari app_metadata (terproteksi server)
  v_invited_business_id := (new.raw_app_meta_data->>'invited_business_id')::uuid;
  v_invited_branch_id := (new.raw_app_meta_data->>'invited_branch_id')::uuid;

  IF v_invited_business_id IS NOT NULL THEN
    -- Kasus: Akun pegawai yang diundang oleh owner via Admin API ke bisnis yang sudah ada.
    -- Jika branch_id tidak disertakan, otomatis arahkan ke Cabang Utama (cabang tertua)
    IF v_invited_branch_id IS NULL THEN
      SELECT id INTO v_invited_branch_id
      FROM public.branches
      WHERE business_id = v_invited_business_id
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

    INSERT INTO public.profiles (id, business_id, branch_id, role, full_name)
    VALUES (
      new.id,
      v_invited_business_id,
      v_invited_branch_id,
      'pegawai'::user_role,
      COALESCE(new.raw_user_meta_data->>'full_name', new.email)
    );
  ELSE
    -- Kasus normal: Pendaftaran bisnis baru via /register.
    -- Buat entitas bisnis baru
    INSERT INTO public.businesses (name)
    VALUES (COALESCE(new.raw_user_meta_data->>'business_name', 'Bisnis Baru'))
    RETURNING id INTO v_business_id;

    -- Otomatis buat 1 cabang pertama ("Cabang Utama") sebagai cabang resmi ke-1
    INSERT INTO public.branches (business_id, name, code, branch_type, status, address)
    VALUES (v_business_id, 'Cabang Utama', 'PUSAT', 'outlet', 'active', 'Pusat Operasional')
    RETURNING id INTO v_main_branch_id;

    -- Pasang user sebagai 'owner' dan kaitkan ke Cabang Utama
    INSERT INTO public.profiles (id, business_id, branch_id, role, full_name)
    VALUES (
      new.id,
      v_business_id,
      v_main_branch_id,
      'owner'::user_role,
      COALESCE(new.raw_user_meta_data->>'full_name', new.email)
    );
  END IF;

  RETURN new;
END;
$$;

-- ─── 2. AUTO-PROVISION CABANG UTAMA UNTUK BISNIS TANPA CABANG ────────────────
INSERT INTO public.branches (business_id, name, code, branch_type, status, address)
SELECT
  b.id AS business_id,
  'Cabang Utama' AS name,
  'PUSAT' AS code,
  'outlet' AS branch_type,
  'active' AS status,
  'Pusat Operasional' AS address
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.branches br WHERE br.business_id = b.id
);

-- ─── 3. TANDAI CABANG PERTAMA (TERTUA) DENGAN KODE PUSAT JIKA BELUM ADA ──────
UPDATE public.branches b
SET code = 'PUSAT'
WHERE b.id IN (
  SELECT DISTINCT ON (business_id) id
  FROM public.branches
  ORDER BY business_id, created_at ASC
)
AND (b.code IS NULL OR b.code = '');

-- ─── 4. SINKRONKAN PROFILES.BRANCH_ID YANG MASIH NULL ────────────────────────
UPDATE public.profiles p
SET branch_id = (
  SELECT b.id FROM public.branches b
  WHERE b.business_id = p.business_id
  ORDER BY b.created_at ASC
  LIMIT 1
)
WHERE p.branch_id IS NULL
  AND p.business_id IS NOT NULL;

-- ─── 5. MIGRASI DATA OPERASIONAL ORPHANED (branch_id IS NULL) KE CABANG UTAMA ─

-- A. Penjualan (sales)
UPDATE public.sales s
SET branch_id = (
  SELECT b.id FROM public.branches b
  WHERE b.business_id = s.business_id
  ORDER BY b.created_at ASC
  LIMIT 1
)
WHERE s.branch_id IS NULL;

-- B. Pengeluaran / Beban (expenses)
UPDATE public.expenses e
SET branch_id = (
  SELECT b.id FROM public.branches b
  WHERE b.business_id = e.business_id
  ORDER BY b.created_at ASC
  LIMIT 1
)
WHERE e.branch_id IS NULL;

-- C. Pembelian Bahan Baku (purchases)
UPDATE public.purchases p
SET branch_id = (
  SELECT b.id FROM public.branches b
  WHERE b.business_id = p.business_id
  ORDER BY b.created_at ASC
  LIMIT 1
)
WHERE p.branch_id IS NULL;

-- D. Buku Utang (debts_payables)
UPDATE public.debts_payables d
SET branch_id = COALESCE(
  (SELECT p.branch_id FROM public.purchases p WHERE p.id = d.purchase_id),
  (SELECT b.id FROM public.branches b WHERE b.business_id = d.business_id ORDER BY b.created_at ASC LIMIT 1)
)
WHERE d.branch_id IS NULL;

-- E. Buku Piutang (receivables)
UPDATE public.receivables r
SET branch_id = COALESCE(
  (SELECT s.branch_id FROM public.sales s WHERE s.id = r.sale_id),
  (SELECT b.id FROM public.branches b WHERE b.business_id = r.business_id ORDER BY b.created_at ASC LIMIT 1)
)
WHERE r.branch_id IS NULL;

-- ─── 6. INISIALISASI STOK CABANG UTAMA (PRODUCT & RAW MATERIAL) ──────────────

-- A. Inisialisasi product_branch_stocks untuk produk yang belum memiliki baris stok cabang
INSERT INTO public.product_branch_stocks (business_id, product_id, branch_id, stock)
SELECT
  p.business_id,
  p.id,
  (SELECT b.id FROM public.branches b WHERE b.business_id = p.business_id ORDER BY b.created_at ASC LIMIT 1) AS branch_id,
  COALESCE(p.stock, 0)
FROM public.products p
WHERE (SELECT b.id FROM public.branches b WHERE b.business_id = p.business_id ORDER BY b.created_at ASC LIMIT 1) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.product_branch_stocks pbs WHERE pbs.product_id = p.id
  )
ON CONFLICT (product_id, branch_id) DO NOTHING;

-- B. Inisialisasi raw_material_branch_stocks untuk bahan baku yang belum memiliki baris stok cabang
INSERT INTO public.raw_material_branch_stocks (business_id, raw_material_id, branch_id, quantity)
SELECT
  rm.business_id,
  rm.id,
  (SELECT b.id FROM public.branches b WHERE b.business_id = rm.business_id ORDER BY b.created_at ASC LIMIT 1) AS branch_id,
  COALESCE(rm.stock, 0)
FROM public.raw_materials rm
WHERE (SELECT b.id FROM public.branches b WHERE b.business_id = rm.business_id ORDER BY b.created_at ASC LIMIT 1) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.raw_material_branch_stocks rmbs WHERE rmbs.raw_material_id = rm.id
  )
ON CONFLICT (raw_material_id, branch_id) DO NOTHING;

