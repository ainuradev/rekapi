-- ================================================================
-- Migration 0024: Tahap 1 — Master Data, Customers, Extended Suppliers & Branches
-- Status: Release Candidate / Tahap 1
--
-- Entitas yang dibuat/diperbarui:
--  1. customers: Master data pelanggan, CRM, kategori pelanggan & limit piutang
--  2. sales.customer_id: Relasi opsional pelanggan pada transaksi kasir (walk-in default)
--  3. suppliers: Kolom tambahan kode, kategori, PIC, NPWP, termin bayar, & limit kredit
--  4. supplier_items: Relasi m2m supplier dan bahan baku dengan validasi tenant
--  5. branches: Kolom tambahan tipe cabang, jam operasional, PIC, status, & hierarki induk
--  6. Triggers validasi isolasi tenant relasi & pencegahan siklus hierarki cabang
-- ================================================================

-- ================================================================
-- 1. TABEL CUSTOMERS (Master Pelanggan & CRM)
-- ================================================================
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  code text,
  name text not null,
  phone text,
  email text,
  address text,
  category text not null default 'regular' check (category in ('regular', 'member', 'vip', 'wholesale')),
  default_discount_pct numeric(5,2) not null default 0 check (default_discount_pct >= 0 and default_discount_pct <= 100),
  receivable_limit numeric(12,2) not null default 0 check (receivable_limit >= 0),
  notes text,
  registered_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customers_business on customers (business_id);
create index if not exists idx_customers_business_name on customers (business_id, name);
create index if not exists idx_customers_business_phone on customers (business_id, phone);

-- Cegah kode pelanggan duplikat dalam satu bisnis bila diisi
create unique index if not exists uq_customers_business_code
  on customers (business_id, lower(trim(code)))
  where code is not null and trim(code) <> '';

-- Hubungkan ke tabel sales secara opsional (nullable, walk-in default)
alter table sales
  add column if not exists customer_id uuid references customers(id) on delete set null;

create index if not exists idx_sales_customer on sales (customer_id);

-- ================================================================
-- 2. PERLUASAN TABEL SUPPLIERS (Master Pemasok)
-- ================================================================
alter table suppliers
  add column if not exists code text,
  add column if not exists category text,
  add column if not exists pic_name text,
  add column if not exists npwp text,
  add column if not exists payment_terms_days int not null default 0 check (payment_terms_days >= 0),
  add column if not exists credit_limit numeric(12,2) not null default 0 check (credit_limit >= 0);

create unique index if not exists uq_suppliers_business_code
  on suppliers (business_id, lower(trim(code)))
  where code is not null and trim(code) <> '';

-- ================================================================
-- 3. TABEL SUPPLIER_ITEMS (Katalog Pasokan Bahan Baku Supplier)
-- ================================================================
create table if not exists supplier_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  raw_material_id uuid not null references raw_materials(id) on delete cascade,
  supplier_product_code text,
  last_price numeric(12,2) not null default 0 check (last_price >= 0),
  min_order_qty numeric(12,2) not null default 1 check (min_order_qty > 0),
  lead_time_days int not null default 1 check (lead_time_days >= 0),
  is_preferred boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_supplier_material unique (supplier_id, raw_material_id)
);

create index if not exists idx_supplier_items_biz on supplier_items (business_id);
create index if not exists idx_supplier_items_supplier on supplier_items (supplier_id);
create index if not exists idx_supplier_items_material on supplier_items (raw_material_id);

-- Trigger: Verifikasi ketat bahwa supplier dan raw_material berada pada bisnis yang sama
create or replace function fn_validate_supplier_item_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_biz uuid;
  v_material_biz uuid;
begin
  select business_id into v_supplier_biz from suppliers where id = new.supplier_id;
  if v_supplier_biz is null or v_supplier_biz <> new.business_id then
    raise exception 'Supplier tidak valid atau tidak terdaftar pada bisnis Anda.' using errcode = 'P0002';
  end if;

  select business_id into v_material_biz from raw_materials where id = new.raw_material_id;
  if v_material_biz is null or v_material_biz <> new.business_id then
    raise exception 'Bahan baku tidak valid atau tidak terdaftar pada bisnis Anda.' using errcode = 'P0002';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_supplier_item_tenant on supplier_items;
create trigger trg_validate_supplier_item_tenant
  before insert or update on supplier_items
  for each row
  execute function fn_validate_supplier_item_tenant();

-- ================================================================
-- 4. PERLUASAN TABEL BRANCHES (Cabang & Hierarki Induk)
-- ================================================================
alter table branches
  add column if not exists code text,
  add column if not exists branch_type text not null default 'outlet' check (branch_type in ('outlet', 'central_kitchen', 'warehouse', 'hub')),
  add column if not exists city text,
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7),
  add column if not exists manager_name text,
  add column if not exists ownership_status text not null default 'owned' check (ownership_status in ('owned', 'rented')),
  add column if not exists lease_start_date date,
  add column if not exists lease_end_date date,
  add column if not exists operating_hours jsonb,
  add column if not exists status text not null default 'active' check (status in ('active', 'inactive', 'closed')),
  add column if not exists parent_branch_id uuid references branches(id) on delete set null;

create index if not exists idx_branches_parent on branches (parent_branch_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_branch_parent_not_self'
  ) then
    alter table branches
      add constraint chk_branch_parent_not_self check (parent_branch_id is null or parent_branch_id <> id);
  end if;
end $$;

-- Trigger: Validasi cabang induk (harus bisnis yang sama & bebas siklus hierarki)
create or replace function fn_validate_branch_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curr uuid;
  v_parent_biz uuid;
  v_depth int := 0;
begin
  if new.parent_branch_id is null then
    return new;
  end if;

  if new.parent_branch_id = new.id then
    raise exception 'Cabang tidak dapat menjadi induk bagi dirinya sendiri.' using errcode = 'P0001';
  end if;

  -- 1. Validasi bisnis induk sama
  select business_id into v_parent_biz from branches where id = new.parent_branch_id;
  if v_parent_biz is null or v_parent_biz <> new.business_id then
    raise exception 'Cabang induk harus berada dalam bisnis yang sama.' using errcode = 'P0002';
  end if;

  -- 2. Deteksi siklus (loop traversal)
  v_curr := new.parent_branch_id;
  while v_curr is not null loop
    v_depth := v_depth + 1;
    if v_depth > 50 then
      raise exception 'Kedalaman hierarki cabang melebihi batas atau membentuk siklus.' using errcode = 'P0001';
    end if;

    if v_curr = new.id then
      raise exception 'Hierarki cabang membentuk siklus yang tidak valid.' using errcode = 'P0001';
    end if;

    select parent_branch_id into v_curr from branches where id = v_curr;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_validate_branch_hierarchy on branches;
create trigger trg_validate_branch_hierarchy
  before insert or update of parent_branch_id, business_id on branches
  for each row
  execute function fn_validate_branch_hierarchy();

-- ================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ================================================================
alter table customers enable row level security;
alter table supplier_items enable row level security;

-- CUSTOMERS POLICIES
drop policy if exists "customers_select" on customers;
create policy "customers_select" on customers
  for select using (business_id = auth_business_id());

drop policy if exists "customers_insert" on customers;
create policy "customers_insert" on customers
  for insert with check (business_id = auth_business_id());

drop policy if exists "customers_update" on customers;
create policy "customers_update" on customers
  for update using (business_id = auth_business_id());

drop policy if exists "customers_delete" on customers;
create policy "customers_delete" on customers
  for delete using (business_id = auth_business_id() and auth_is_owner());

-- SUPPLIER_ITEMS POLICIES
drop policy if exists "supplier_items_select" on supplier_items;
create policy "supplier_items_select" on supplier_items
  for select using (business_id = auth_business_id());

drop policy if exists "supplier_items_insert" on supplier_items;
create policy "supplier_items_insert" on supplier_items
  for insert with check (business_id = auth_business_id() and auth_is_owner());

drop policy if exists "supplier_items_update" on supplier_items;
create policy "supplier_items_update" on supplier_items
  for update using (business_id = auth_business_id() and auth_is_owner());

drop policy if exists "supplier_items_delete" on supplier_items;
create policy "supplier_items_delete" on supplier_items
  for delete using (business_id = auth_business_id() and auth_is_owner());

-- GRANTS
grant select, insert, update on customers to authenticated;
grant delete on customers to authenticated;

grant select on supplier_items to authenticated;
grant insert, update, delete on supplier_items to authenticated;
