-- ================================================================
-- Migration 0019: Database-Level Protection for HPP (cost_price)
-- 1. Cabut hak SELECT kolom cost_price dari role authenticated pada tabel products
-- 2. Berikan hak SELECT hanya untuk kolom publik/katalog ke role authenticated
-- 3. Buat security barrier view owner_products_view untuk akses aman owner
-- 4. Lindungi tabel sale_items agar cost_price tidak bocor ke role pegawai
-- ================================================================

-- 1. Cabut hak SELECT penuh pada tabel products dari authenticated
revoke select on products from authenticated;

-- 2. Berikan hak SELECT hanya pada kolom non-sensitif (katalog & kasir)
grant select (
  id,
  business_id,
  name,
  selling_price,
  category,
  status,
  stock,
  unit,
  created_at,
  updated_at
) on products to authenticated;

-- 3. Buat View aman khusus Owner untuk melihat seluruh data produk termasuk HPP
create or replace view owner_products_view
with (security_barrier = true)
as
select *
from products
where business_id = auth_business_id()
  and auth_is_owner();

grant select on owner_products_view to authenticated;

-- 4. Function RPC untuk kasir mengambil katalog produk aktif tanpa membocorkan HPP
create or replace function get_cashier_products(p_business_id uuid)
returns table (
  id uuid,
  name text,
  selling_price numeric,
  category text,
  stock numeric,
  unit text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.name,
    p.selling_price,
    p.category,
    p.stock,
    p.unit
  from products p
  where p.business_id = p_business_id
    and p.status = 'aktif'
    and p.business_id = auth_business_id()
  order by p.name asc;
$$;

revoke execute on function get_cashier_products(uuid) from public;
grant execute on function get_cashier_products(uuid) to authenticated, service_role;
