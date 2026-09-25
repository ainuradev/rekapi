-- =========================================================
-- UMKM OS — Initial Schema
-- Multi-tenant SaaS pendataan & rekap UMKM
-- =========================================================

-- ---------- EXTENSIONS ----------
create extension if not exists "pgcrypto";

-- ---------- ENUMS ----------
create type user_role as enum ('owner', 'pegawai');
create type subscription_status as enum ('trial', 'active', 'expired', 'canceled');
create type sale_channel as enum ('offline', 'gofood', 'grabfood', 'shopeefood', 'whatsapp', 'qris', 'lainnya');
create type payment_method as enum ('cash', 'qris', 'transfer', 'lainnya');
create type expense_category as enum (
  'gaji', 'listrik', 'air', 'sewa', 'gas',
  'transportasi', 'marketing', 'packaging', 'peralatan', 'lainnya'
);
create type import_status as enum ('pending', 'processing', 'success', 'failed', 'partial');

-- ---------- BUSINESSES (tenant) ----------
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subscription_status subscription_status not null default 'trial',
  trial_ends_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- BRANCHES ----------
create table branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- ---------- PROFILES (extends auth.users) ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null, -- null = akses semua cabang (owner)
  role user_role not null default 'pegawai',
  full_name text not null,
  created_at timestamptz not null default now()
);

-- ---------- SUBSCRIPTION PLANS ----------
create table subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- 'basic' | 'bisnis' | 'profesional'
  name text not null,
  price numeric(12,2) not null,
  max_branches int, -- null = unlimited
  created_at timestamptz not null default now()
);

insert into subscription_plans (code, name, price, max_branches) values
  ('basic', 'Basic', 150000, 1),
  ('bisnis', 'Bisnis', 300000, 3),
  ('profesional', 'Profesional', 500000, null);

-- ---------- SUBSCRIPTIONS ----------
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  plan_id uuid not null references subscription_plans(id),
  status subscription_status not null default 'trial',
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  midtrans_order_id text unique,
  created_at timestamptz not null default now()
);

-- ---------- PAYMENT TRANSACTIONS (Midtrans) ----------
create table payment_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  midtrans_order_id text not null unique,
  midtrans_transaction_id text,
  amount numeric(12,2) not null,
  status text not null default 'pending', -- pending | settlement | expire | cancel | deny
  payment_type text,
  raw_notification jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- PRODUCTS ----------
create table products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  selling_price numeric(12,2) not null,
  cost_price numeric(12,2) not null default 0, -- HPP per unit
  category text,
  status text not null default 'aktif', -- aktif | nonaktif
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- SALES (header) ----------
create table sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete restrict,
  user_id uuid not null references profiles(id),
  transaction_date timestamptz not null default now(),
  channel sale_channel not null default 'offline',
  payment_method payment_method not null default 'cash',
  total numeric(12,2) not null,
  is_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- SALE ITEMS ----------
create table sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric(10,2) not null,
  price numeric(12,2) not null,        -- harga jual saat transaksi
  cost_price numeric(12,2) not null,   -- HPP saat transaksi (snapshot, jangan ambil live dari products)
  subtotal numeric(12,2) not null
);

-- ---------- SALE EDIT LOGS (audit trail) ----------
create table sale_edit_logs (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  edited_by uuid not null references profiles(id),
  edited_at timestamptz not null default now(),
  old_data jsonb not null,
  new_data jsonb not null,
  reason text
);

-- ---------- PURCHASES (header) ----------
create table purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete restrict,
  supplier text,
  purchase_date date not null default current_date,
  total numeric(12,2) not null,
  created_at timestamptz not null default now()
);

-- ---------- PURCHASE ITEMS ----------
create table purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  item_name text not null,
  quantity numeric(10,2) not null,
  price numeric(12,2) not null,
  subtotal numeric(12,2) not null
);

-- ---------- EXPENSES ----------
create table expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  category expense_category not null,
  amount numeric(12,2) not null,
  expense_date date not null default current_date,
  description text,
  created_at timestamptz not null default now()
);

-- ---------- IMPORT BATCHES ----------
create table import_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  filename text not null,
  type text not null, -- 'sales' | 'products'
  status import_status not null default 'pending',
  total_rows int,
  success_rows int,
  failed_rows int,
  error_log jsonb,
  imported_at timestamptz not null default now()
);

-- =========================================================
-- INDEXES — kritis buat performa laporan harian/mingguan/bulanan
-- =========================================================
create index idx_sales_business_branch_date on sales (business_id, branch_id, transaction_date);
create index idx_sales_business_date on sales (business_id, transaction_date);
create index idx_sale_items_sale on sale_items (sale_id);
create index idx_sale_items_product on sale_items (product_id);
create index idx_purchases_business_branch_date on purchases (business_id, branch_id, purchase_date);
create index idx_expenses_business_branch_date on expenses (business_id, branch_id, expense_date);
create index idx_products_business on products (business_id);
create index idx_profiles_business on profiles (business_id);
create index idx_payment_tx_business on payment_transactions (business_id);