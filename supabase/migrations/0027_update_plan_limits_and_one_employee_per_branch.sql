-- ================================================================
-- Migration 0027: Update Plan Limits & Enforce 1 Employee per Branch
--
-- 1. Update subscription_plans limits & descriptions:
--    - Standard: max_branches = 1, max_employees = 1
--    - Business: max_branches = 3, max_employees = 3
--    - Pro: max_branches = 5, max_employees = 5
-- 2. Enforce 1 Employee per Branch (tidak share pegawai antar-cabang):
--    - Setiap cabang hanya dapat memiliki 1 akun login pegawai.
--    - create unique index uq_branch_single_employee on profiles (branch_id)
--      where role = 'pegawai' and branch_id is not null;
-- 3. Trigger enforce_employee_limit on profiles:
--    - Memastikan jumlah akun pegawai tidak melebihi kuota paket langganan.
-- ================================================================

-- 1. Update subscription_plans limits, features & official pricing
update public.subscription_plans set
    price             = 149000,
    max_branches      = 1,
    max_employees     = 1,
    description       = 'Cocok untuk bisnis dengan 1 cabang dan 1 akun pegawai kasir',
    features          = '["Maksimal 1 cabang","1 akun pegawai (khusus cabang)","Semua fitur kasir POS","Laporan harian & mingguan","Export CSV","Support standar"]'::jsonb
where code = 'standard';

update public.subscription_plans set
    price             = 299000,
    max_branches      = 3,
    max_employees     = 3,
    description       = 'Untuk bisnis yang mulai berkembang hingga 3 cabang',
    features          = '["Maksimal 3 cabang","3 akun pegawai (1 pegawai per cabang)","Semua fitur Standard","Laporan advanced & HPP","Export Excel","Support prioritas"]'::jsonb
where code = 'business';

update public.subscription_plans set
    price             = 499000,
    max_branches      = 5,
    max_employees     = 5,
    description       = 'Untuk bisnis berkembang pesat hingga 5 cabang',
    features          = '["Maksimal 5 cabang","5 akun pegawai (1 pegawai per cabang)","Semua fitur Business","Laporan advanced & HPP","Akses API","Support prioritas 24/7"]'::jsonb
where code = 'pro';

-- 2. Enforce 1 employee per branch strictly at database level
create unique index if not exists uq_branch_single_employee
on public.profiles (branch_id)
where role = 'pegawai' and branch_id is not null;

-- 3. Trigger enforce_employee_limit on profiles
create or replace function public.enforce_employee_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_plan_id uuid;
  v_max int;
  v_count int;
begin
  -- Hanya periksa jika role adalah 'pegawai'
  if new.role <> 'pegawai' then
    return new;
  end if;

  -- Jika update tapi business_id dan role tidak berubah, lewati
  if TG_OP = 'UPDATE' and new.business_id = old.business_id and old.role = 'pegawai' then
    return new;
  end if;

  -- Kunci baris bisnis untuk mencegah race condition
  perform 1 from businesses where id = new.business_id for update;

  select b.subscription_status, b.subscription_plan_id, sp.max_employees
  into v_status, v_plan_id, v_max
  from businesses b
  left join subscription_plans sp on sp.id = b.subscription_plan_id
  where b.id = new.business_id;

  if not found then
    raise exception 'Bisnis tidak ditemukan.' using errcode = 'P0002';
  end if;

  -- Sinkronisasi aturan limit:
  -- Jika active dan plan terdaftar: gunakan sp.max_employees (null = unlimited)
  -- Jika bukan active (trial, expired, canceled, pending): default 1 pegawai
  if v_status = 'active' and v_plan_id is not null then
    if v_max is null then
      return new;
    end if;
  else
    v_max := 1;
  end if;

  select count(*) into v_count
  from profiles
  where business_id = new.business_id
    and role = 'pegawai'
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_count >= v_max then
    raise exception 'Batas kuota pegawai paket langganan tercapai (maks % pegawai). Upgrade paket untuk menambah pegawai.', v_max
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_employee_limit on profiles;
create trigger trg_enforce_employee_limit
  before insert or update of business_id, role on profiles
  for each row execute function public.enforce_employee_limit();

revoke execute on function public.enforce_employee_limit() from public;
