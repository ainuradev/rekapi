-- =========================================================
-- Migration 0014: Multi-Branch Product Stock Inventory
--
-- 1. Create product_branch_stocks table (stok terpisah per cabang)
-- 2. Populate initial branch stocks from existing products.stock
-- 3. Trigger: auto-create product_branch_stocks rows when a new product or branch is added
-- 4. Update fn_deduct_stock_on_sale() to deduct stock from the specific sale's branch
-- 5. Update fn_restore_stock_on_delete() to restore stock to the specific sale's branch
-- 6. RLS policies for product_branch_stocks
-- =========================================================

-- 1. Tabel product_branch_stocks
create table if not exists product_branch_stocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  stock numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_product_branch unique (product_id, branch_id)
);

create index if not exists idx_pbs_product on product_branch_stocks (product_id);
create index if not exists idx_pbs_branch on product_branch_stocks (branch_id);
create index if not exists idx_pbs_business on product_branch_stocks (business_id);

-- 2. Migrasi data awal: isi product_branch_stocks untuk setiap kombinasi produk & cabang
insert into product_branch_stocks (business_id, product_id, branch_id, stock)
select
  p.business_id,
  p.id as product_id,
  b.id as branch_id,
  coalesce(p.stock, 0) as stock
from products p
join branches b on b.business_id = p.business_id
on conflict (product_id, branch_id) do nothing;

-- 3. Trigger: Saat produk baru di-insert, buat baris stok untuk semua cabang milik bisnis tersebut
create or replace function fn_init_product_branch_stocks()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into product_branch_stocks (business_id, product_id, branch_id, stock)
  select
    new.business_id,
    new.id,
    b.id,
    coalesce(new.stock, 0)
  from branches b
  where b.business_id = new.business_id
  on conflict (product_id, branch_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_init_product_branch_stocks on products;
create trigger trg_init_product_branch_stocks
  after insert on products
  for each row
  execute function fn_init_product_branch_stocks();

-- Trigger: Saat cabang baru di-insert, buat baris stok untuk semua produk milik bisnis tersebut
create or replace function fn_init_branch_product_stocks()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into product_branch_stocks (business_id, product_id, branch_id, stock)
  select
    new.business_id,
    p.id,
    new.id,
    coalesce(p.stock, 0)
  from products p
  where p.business_id = new.business_id
  on conflict (product_id, branch_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_init_branch_product_stocks on branches;
create trigger trg_init_branch_product_stocks
  after insert on branches
  for each row
  execute function fn_init_branch_product_stocks();

-- 4. TRIGGER: Kurangi stok cabang saat transaksi penjualan dibuat (insert sale_items)
create or replace function fn_deduct_stock_on_sale()
returns trigger
language plpgsql
security definer
as $$
declare
  v_branch_id uuid;
begin
  -- Cari branch_id dari header penjualan (sales)
  select branch_id into v_branch_id
  from sales
  where id = new.sale_id;

  if v_branch_id is not null then
    -- Kurangi stok spesifik di cabang transaksi
    update product_branch_stocks
      set stock = greatest(stock - new.quantity, 0),
          updated_at = now()
    where product_id = new.product_id
      and branch_id = v_branch_id;
  end if;

  -- Update juga kolom produk utama (stok global agregat) agar backward-compatible
  update products
    set stock = greatest(stock - new.quantity, 0),
        updated_at = now()
  where id = new.product_id;

  return new;
end;
$$;

-- 5. TRIGGER: Kembalikan stok cabang saat transaksi penjualan dihapus (delete sale_items)
create or replace function fn_restore_stock_on_delete()
returns trigger
language plpgsql
security definer
as $$
declare
  v_branch_id uuid;
begin
  select branch_id into v_branch_id
  from sales
  where id = old.sale_id;

  if v_branch_id is not null then
    update product_branch_stocks
      set stock = stock + old.quantity,
          updated_at = now()
    where product_id = old.product_id
      and branch_id = v_branch_id;
  end if;

  update products
    set stock = stock + old.quantity,
        updated_at = now()
  where id = old.product_id;

  return old;
end;
$$;

-- 6. Row Level Security (RLS)
alter table product_branch_stocks enable row level security;

create policy "select branch stocks in tenant" on product_branch_stocks
  for select using (business_id = auth_business_id());

create policy "owner manage branch stocks" on product_branch_stocks
  for all using (business_id = auth_business_id() and auth_is_owner());
