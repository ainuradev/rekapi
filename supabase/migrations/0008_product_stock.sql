-- =========================================================
-- Migration 0008: Product Stock Management & Purchases RLS
--
-- 1. Tambah kolom `stock` ke tabel products (qty stok tersedia)
-- 2. Trigger: kurangi stok otomatis saat sale_items di-insert (transaksi kasir)
-- 3. Trigger: kembalikan stok saat transaksi dihapus (sale_items di-delete)
-- 4. RLS: owner can delete purchases & purchase_items
-- =========================================================

-- 1. Tambah kolom stock & unit (satuan penjualan)
alter table products
  add column if not exists stock numeric(10,2) not null default 0,
  add column if not exists unit text not null default 'pcs';

-- =============================================
-- 2. TRIGGER: kurangi stok saat insert sale_items
-- =============================================
create or replace function fn_deduct_stock_on_sale()
returns trigger
language plpgsql
security definer
as $$
begin
  update products
    set stock = greatest(stock - new.quantity, 0)
  where id = new.product_id;
  return new;
end;
$$;

drop trigger if exists trg_deduct_stock_on_sale on sale_items;
create trigger trg_deduct_stock_on_sale
  after insert on sale_items
  for each row
  execute function fn_deduct_stock_on_sale();

-- =============================================
-- 3. TRIGGER: kembalikan stok saat delete sale_items
--    (terjadi saat transaksi dihapus atau saat edit — admin client delete + insert baru)
-- =============================================
create or replace function fn_restore_stock_on_delete()
returns trigger
language plpgsql
security definer
as $$
begin
  update products
    set stock = stock + old.quantity
  where id = old.product_id;
  return old;
end;
$$;

drop trigger if exists trg_restore_stock_on_delete on sale_items;
create trigger trg_restore_stock_on_delete
  after delete on sale_items
  for each row
  execute function fn_restore_stock_on_delete();

-- =============================================
-- 4. RLS: owner can delete purchases & purchase_items
-- =============================================
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'purchases' and policyname = 'owner delete purchases'
  ) then
    create policy "owner delete purchases" on purchases
      for delete using (business_id = auth_business_id() and auth_is_owner());
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'purchase_items' and policyname = 'owner delete purchase_items'
  ) then
    create policy "owner delete purchase_items" on purchase_items
      for delete using (
        exists (
          select 1 from purchases p
          where p.id = purchase_items.purchase_id
          and p.business_id = auth_business_id() and auth_is_owner()
        )
      );
  end if;
end $$;
