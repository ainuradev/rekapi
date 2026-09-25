-- =========================================================
-- UMKM OS — Row Level Security
-- Prinsip: SEMUA akses data wajib lewat business_id milik user
-- yang sedang login (via profiles.business_id).
-- =========================================================

-- Helper function: ambil business_id dari user yang login
create or replace function auth_business_id()
returns uuid
language sql
security definer
stable
as $$
  select business_id from profiles where id = auth.uid()
$$;

-- Helper function: cek apakah user adalah owner
create or replace function auth_is_owner()
returns boolean
language sql
security definer
stable
as $$
  select role = 'owner' from profiles where id = auth.uid()
$$;

-- Helper function: ambil branch_id user (null jika owner/akses semua cabang)
create or replace function auth_branch_id()
returns uuid
language sql
security definer
stable
as $$
  select branch_id from profiles where id = auth.uid()
$$;

-- ---------- ENABLE RLS ----------
alter table businesses enable row level security;
alter table branches enable row level security;
alter table profiles enable row level security;
alter table products enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table sale_edit_logs enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table expenses enable row level security;
alter table import_batches enable row level security;
alter table subscriptions enable row level security;
alter table payment_transactions enable row level security;

-- ---------- BUSINESSES ----------
create policy "select own business" on businesses
  for select using (id = auth_business_id());
create policy "owner update own business" on businesses
  for update using (id = auth_business_id() and auth_is_owner());

-- ---------- BRANCHES ----------
create policy "select branches in tenant" on branches
  for select using (business_id = auth_business_id());
create policy "owner manage branches" on branches
  for all using (business_id = auth_business_id() and auth_is_owner());

-- ---------- PROFILES ----------
create policy "select profiles in tenant" on profiles
  for select using (business_id = auth_business_id());
create policy "owner manage profiles" on profiles
  for insert with check (business_id = auth_business_id() and auth_is_owner());
create policy "owner update profiles" on profiles
  for update using (business_id = auth_business_id() and auth_is_owner());

-- ---------- PRODUCTS ----------
create policy "select products in tenant" on products
  for select using (business_id = auth_business_id());
create policy "owner manage products" on products
  for all using (business_id = auth_business_id() and auth_is_owner());

-- ---------- SALES ----------
-- Pegawai: hanya lihat transaksi cabangnya sendiri. Owner: semua cabang.
create policy "select sales in tenant" on sales
  for select using (
    business_id = auth_business_id()
    and (auth_is_owner() or branch_id = auth_branch_id())
  );
create policy "pegawai insert sales" on sales
  for insert with check (
    business_id = auth_business_id()
    and (auth_is_owner() or branch_id = auth_branch_id())
    and user_id = auth.uid()
  );
-- Edit transaksi: owner semua, pegawai hanya transaksi sendiri di cabangnya
create policy "update sales in tenant" on sales
  for update using (
    business_id = auth_business_id()
    and (auth_is_owner() or (branch_id = auth_branch_id() and user_id = auth.uid()))
  );

-- ---------- SALE ITEMS ----------
create policy "select sale_items via sale" on sale_items
  for select using (
    exists (
      select 1 from sales s
      where s.id = sale_items.sale_id
      and s.business_id = auth_business_id()
      and (auth_is_owner() or s.branch_id = auth_branch_id())
    )
  );
create policy "insert sale_items via sale" on sale_items
  for insert with check (
    exists (
      select 1 from sales s
      where s.id = sale_items.sale_id
      and s.business_id = auth_business_id()
    )
  );

-- ---------- SALE EDIT LOGS ----------
-- Read-only buat semua role dalam tenant (audit trail nggak boleh diubah manual)
create policy "select sale_edit_logs in tenant" on sale_edit_logs
  for select using (
    exists (
      select 1 from sales s
      where s.id = sale_edit_logs.sale_id
      and s.business_id = auth_business_id()
    )
  );
create policy "insert sale_edit_logs in tenant" on sale_edit_logs
  for insert with check (
    exists (
      select 1 from sales s
      where s.id = sale_edit_logs.sale_id
      and s.business_id = auth_business_id()
    )
  );

-- ---------- PURCHASES (owner only) ----------
create policy "owner select purchases" on purchases
  for select using (business_id = auth_business_id() and auth_is_owner());
create policy "owner manage purchases" on purchases
  for insert with check (business_id = auth_business_id() and auth_is_owner());
create policy "owner update purchases" on purchases
  for update using (business_id = auth_business_id() and auth_is_owner());

-- ---------- PURCHASE ITEMS (owner only) ----------
create policy "owner select purchase_items" on purchase_items
  for select using (
    exists (
      select 1 from purchases p
      where p.id = purchase_items.purchase_id
      and p.business_id = auth_business_id() and auth_is_owner()
    )
  );
create policy "owner insert purchase_items" on purchase_items
  for insert with check (
    exists (
      select 1 from purchases p
      where p.id = purchase_items.purchase_id
      and p.business_id = auth_business_id() and auth_is_owner()
    )
  );

-- ---------- EXPENSES (owner only) ----------
create policy "owner select expenses" on expenses
  for select using (business_id = auth_business_id() and auth_is_owner());
create policy "owner manage expenses" on expenses
  for all using (business_id = auth_business_id() and auth_is_owner());

-- ---------- IMPORT BATCHES (owner only) ----------
create policy "owner select import_batches" on import_batches
  for select using (business_id = auth_business_id() and auth_is_owner());
create policy "owner manage import_batches" on import_batches
  for all using (business_id = auth_business_id() and auth_is_owner());

-- ---------- SUBSCRIPTIONS & PAYMENTS (owner only, read-only untuk write dari app) ----------
create policy "owner select subscriptions" on subscriptions
  for select using (business_id = auth_business_id() and auth_is_owner());
create policy "owner select payment_transactions" on payment_transactions
  for select using (business_id = auth_business_id() and auth_is_owner());
-- Catatan: INSERT/UPDATE ke subscriptions & payment_transactions sebaiknya
-- HANYA lewat service_role key di webhook Midtrans (server-side), bukan dari client.
-- Jadi sengaja tidak dibuatkan policy insert/update untuk role authenticated.