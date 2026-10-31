-- ================================================================
-- Migration 0022: Sync Trial & Subscription Branch Limits with TypeScript
-- Status: Release Candidate Hardening
--
-- Temuan yang diselesaikan:
--  1. Sinkronisasi trigger enforce_branch_limit() dengan TRIAL_LIMITS di lib/subscription-limits.ts:
--     - Trial / tanpa plan (subscription_plan_id IS NULL) kini dibatasi maks 1 cabang (sebelumnya NULL dianggap unlimited).
--     - Status non-aktif (expired, canceled, pending) dibatasi maks 1 cabang.
--     - Plan aktif mengikuti subscription_plans.max_branches (NULL = unlimited profesional).
--     - Plan tidak ditemukan/invalid di-handle fail-closed (maks 1 cabang), bukan unlimited.
--  2. Trigger dipasang pada BEFORE INSERT OR UPDATE OF business_id untuk mencegah bypass pindah cabang.
-- ================================================================

create or replace function enforce_branch_limit()
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
  v_is_unlimited boolean := false;
begin
  -- service_role (admin/backoffice) tidak dibatasi
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- Jika update tapi business_id tidak berubah, abaikan pengecekan kuota
  if TG_OP = 'UPDATE' and new.business_id = old.business_id then
    return new;
  end if;

  -- Kunci baris bisnis untuk mencegah race antar-insert paralel
  perform 1 from businesses where id = new.business_id for update;

  select b.subscription_status, b.subscription_plan_id, sp.max_branches
  into v_status, v_plan_id, v_max
  from businesses b
  left join subscription_plans sp on sp.id = b.subscription_plan_id
  where b.id = new.business_id;

  if not found then
    raise exception 'Bisnis tidak ditemukan.' using errcode = 'P0002';
  end if;

  -- Sinkronisasi aturan dengan lib/subscription-limits.ts:
  -- 1. Jika subscription_status = 'active' dan terhubung ke plan yang sah:
  --    - sp.max_branches IS NULL => unlimited (paket profesional)
  --    - sp.max_branches IS NOT NULL => ikuti batas paket (misal 1 untuk basic, 3 untuk bisnis)
  -- 2. Jika bukan 'active' (trial, expired, canceled, pending) ATAU tidak ada plan terdaftar:
  --    - Ikuti TRIAL_LIMITS (maksimal 1 cabang)
  if v_status = 'active' and v_plan_id is not null then
    if v_max is null then
      v_is_unlimited := true;
    end if;
  else
    -- Fallback aman: trial / expired / canceled / tanpa plan => batas 1 cabang
    v_max := 1;
  end if;

  if v_is_unlimited then
    return new;
  end if;

  select count(*) into v_count from branches where business_id = new.business_id;

  if v_count >= v_max then
    raise exception 'Batas cabang paket langganan tercapai (maks %).', v_max
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_branch_limit on branches;
create trigger trg_enforce_branch_limit
  before insert or update of business_id on branches
  for each row execute function enforce_branch_limit();

revoke execute on function enforce_branch_limit() from public;
