-- ================================================================
-- Migration 0040: Auto-Deactivate Branches & Employees on Downgrade + Active Quota Protection
-- 1. Ensure public.profiles has is_active boolean NOT NULL DEFAULT true
-- 2. Function public.auto_deactivate_on_downgrade(p_business_id uuid)
-- 3. Trigger on public.businesses to detect plan downgrade and trigger auto-deactivation
-- 4. Update enforce_branch_limit() to count only active branches (status = 'active')
--    and enforce limit on BEFORE INSERT OR UPDATE OF business_id, status ON branches
-- 5. Update enforce_employee_limit() to count only active employees (is_active = true)
--    and enforce limit on BEFORE INSERT OR UPDATE OF business_id, role, is_active ON profiles
-- ================================================================

-- ─── 1. TAMBAH KOLOM is_active PADA PROFILES ─────────────────────────────────
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Index untuk performa query pegawai aktif
CREATE INDEX IF NOT EXISTS idx_profiles_business_role_active 
ON public.profiles (business_id, role, is_active);

-- ─── 2. FUNGSI AUTO-DEACTIVATE SAAT DOWNGRADE ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_deactivate_on_downgrade(p_business_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_main_branch_id uuid;
BEGIN
  -- 1. Cari Cabang Utama (prioritaskan code = 'PUSAT', lalu cabang tertua created_at)
  SELECT id INTO v_main_branch_id
  FROM public.branches
  WHERE business_id = p_business_id
  ORDER BY 
    CASE WHEN code = 'PUSAT' THEN 0 ELSE 1 END,
    created_at ASC
  LIMIT 1;

  IF v_main_branch_id IS NOT NULL THEN
    -- 2. Pastikan Cabang Utama selalu berstatus active
    UPDATE public.branches
    SET status = 'active'
    WHERE id = v_main_branch_id;

    -- 3. Nonaktifkan seluruh cabang lain milik bisnis tersebut
    UPDATE public.branches
    SET status = 'inactive'
    WHERE business_id = p_business_id
      AND id <> v_main_branch_id
      AND status = 'active';

    -- 4. Nonaktifkan seluruh akun pegawai yang BUKAN bertugas di Cabang Utama (atau branch_id null)
    UPDATE public.profiles
    SET is_active = false
    WHERE business_id = p_business_id
      AND role = 'pegawai'
      AND (branch_id IS NULL OR branch_id <> v_main_branch_id)
      AND is_active = true;
  END IF;
END;
$$;

-- ─── 3. TRIGGER PADA TABEL BUSINESSES UNTUK MENDETEKSI DOWNGRADE ──────────────
CREATE OR REPLACE FUNCTION public.fn_check_business_downgrade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_max_branches int := 1;
  v_new_max_branches int := 1;
BEGIN
  -- Hanya proses jika subscription_plan_id atau subscription_status berubah
  IF old.subscription_plan_id IS NOT DISTINCT FROM new.subscription_plan_id 
     AND old.subscription_status IS NOT DISTINCT FROM new.subscription_status THEN
    RETURN new;
  END IF;

  -- 1. Hitung kuota cabang lama
  IF old.subscription_status = 'active' AND old.subscription_plan_id IS NOT NULL THEN
    SELECT COALESCE(max_branches, 1) INTO v_old_max_branches
    FROM public.subscription_plans
    WHERE id = old.subscription_plan_id;
  ELSE
    v_old_max_branches := 1;
  END IF;

  -- 2. Hitung kuota cabang baru
  IF new.subscription_status = 'active' AND new.subscription_plan_id IS NOT NULL THEN
    SELECT COALESCE(max_branches, 1) INTO v_new_max_branches
    FROM public.subscription_plans
    WHERE id = new.subscription_plan_id;
  ELSE
    v_new_max_branches := 1;
  END IF;

  -- 3. Jika kuota cabang baru lebih kecil dari kuota cabang lama (downgrade)
  IF v_new_max_branches < v_old_max_branches THEN
    PERFORM public.auto_deactivate_on_downgrade(new.id);
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_business_downgrade ON public.businesses;
CREATE TRIGGER trg_check_business_downgrade
  AFTER UPDATE OF subscription_plan_id, subscription_status ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_check_business_downgrade();

-- ─── 4. PERBARUI enforce_branch_limit() (HANYA HITUNG CABANG AKTIF) ───────────
CREATE OR REPLACE FUNCTION public.enforce_branch_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_plan_id uuid;
  v_max int;
  v_count int;
  v_is_unlimited boolean := false;
BEGIN
  -- service_role tidak dibatasi
  IF auth.role() = 'service_role' THEN
    RETURN new;
  END IF;

  -- Hanya periksa jika status cabang adalah 'active'
  IF new.status <> 'active' THEN
    RETURN new;
  END IF;

  -- Jika update dan status tetap bukan active, lewati
  IF TG_OP = 'UPDATE' AND old.status = new.status AND new.business_id = old.business_id THEN
    RETURN new;
  END IF;

  -- Kunci baris bisnis untuk mencegah race condition
  PERFORM 1 FROM public.businesses WHERE id = new.business_id FOR UPDATE;

  SELECT b.subscription_status, b.subscription_plan_id, sp.max_branches
  INTO v_status, v_plan_id, v_max
  FROM public.businesses b
  LEFT JOIN public.subscription_plans sp ON sp.id = b.subscription_plan_id
  WHERE b.id = new.business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bisnis tidak ditemukan.' USING errcode = 'P0002';
  END IF;

  IF v_status = 'active' AND v_plan_id IS NOT NULL THEN
    IF v_max IS NULL THEN
      v_is_unlimited := true;
    END IF;
  ELSE
    v_max := 1;
  END IF;

  IF v_is_unlimited THEN
    RETURN new;
  END IF;

  -- Hitung cabang AKTIF saat ini (kecuali baris yang sedang diupdate ini)
  SELECT count(*) INTO v_count
  FROM public.branches
  WHERE business_id = new.business_id
    AND status = 'active'
    AND id <> COALESCE(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Batas cabang aktif paket langganan tercapai (maks % cabang). Upgrade paket untuk mengaktifkan cabang ini.', v_max
      USING errcode = 'P0001';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_branch_limit ON public.branches;
CREATE TRIGGER trg_enforce_branch_limit
  BEFORE INSERT OR UPDATE OF business_id, status ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_branch_limit();

REVOKE EXECUTE ON FUNCTION public.enforce_branch_limit() FROM public;

-- ─── 5. PERBARUI enforce_employee_limit() (HANYA HITUNG PEGAWAI AKTIF) ─────────
CREATE OR REPLACE FUNCTION public.enforce_employee_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_plan_id uuid;
  v_max int;
  v_count int;
BEGIN
  -- service_role tidak dibatasi
  IF auth.role() = 'service_role' THEN
    RETURN new;
  END IF;

  -- Hanya periksa jika role pegawai dan is_active = true
  IF new.role <> 'pegawai' OR new.is_active = false THEN
    RETURN new;
  END IF;

  -- Jika update tapi business_id, role, dan is_active tidak berubah, lewati
  IF TG_OP = 'UPDATE' 
     AND new.business_id = old.business_id 
     AND old.role = new.role 
     AND old.is_active = new.is_active THEN
    RETURN new;
  END IF;

  -- Kunci baris bisnis untuk mencegah race condition
  PERFORM 1 FROM public.businesses WHERE id = new.business_id FOR UPDATE;

  SELECT b.subscription_status, b.subscription_plan_id, sp.max_employees
  INTO v_status, v_plan_id, v_max
  FROM public.businesses b
  LEFT JOIN public.subscription_plans sp ON sp.id = b.subscription_plan_id
  WHERE b.id = new.business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bisnis tidak ditemukan.' USING errcode = 'P0002';
  END IF;

  IF v_status = 'active' AND v_plan_id IS NOT NULL THEN
    IF v_max IS NULL THEN
      RETURN new;
    END IF;
  ELSE
    v_max := 1;
  END IF;

  -- Hitung pegawai AKTIF saat ini (kecuali baris yang sedang diupdate ini)
  SELECT count(*) INTO v_count
  FROM public.profiles
  WHERE business_id = new.business_id
    AND role = 'pegawai'
    AND is_active = true
    AND id <> COALESCE(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Batas kuota pegawai aktif paket langganan tercapai (maks % pegawai). Upgrade paket untuk mengaktifkan pegawai ini.', v_max
      USING errcode = 'P0001';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_employee_limit ON public.profiles;
CREATE TRIGGER trg_enforce_employee_limit
  BEFORE INSERT OR UPDATE OF business_id, role, is_active ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_employee_limit();

REVOKE EXECUTE ON FUNCTION public.enforce_employee_limit() FROM public;

