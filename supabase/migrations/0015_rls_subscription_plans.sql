-- ================================================================
-- Migration 0015: Enable RLS on subscription_plans
-- Fixes critical vulnerability: rls_disabled_in_public
-- ================================================================

-- 1. Enable Row Level Security on subscription_plans
alter table subscription_plans enable row level security;

-- 2. Drop existing policy if any (idempotency)
drop policy if exists "anyone can view subscription plans" on subscription_plans;

-- 3. Policy: Public / Authenticated read access
-- Anyone can view the subscription plans catalog (pricing, features, limits)
create policy "anyone can view subscription plans" on subscription_plans
  for select
  using (true);

-- Catatan:
-- Tidak dibuat policy INSERT, UPDATE, atau DELETE untuk public/authenticated.
-- Modifikasi paket langganan hanya dapat dilakukan oleh role admin (service_role)
-- melalui Supabase Dashboard atau backend server.

-- 4. Memastikan juga product_branch_stocks (jika sudah ada) memiliki RLS aktif
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'product_branch_stocks'
  ) then
    alter table product_branch_stocks enable row level security;
  end if;
end $$;
