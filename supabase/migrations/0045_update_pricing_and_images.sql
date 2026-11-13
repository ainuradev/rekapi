-- ================================================================
-- Migration 0045: Update Subscription Pricing (Rp 49k / 99k / 179k)
--                 & Add Product Image + Store QRIS Image Columns
-- ================================================================

-- 1. Update harga resmi paket langganan di public.subscription_plans
--    - Standard : Rp 49.000 / bulan (Harga coret Rp 149.000)
--    - Business : Rp 99.000 / bulan (Harga coret Rp 299.000)
--    - Pro      : Rp 179.000 / bulan (Harga coret Rp 499.000)
update public.subscription_plans set
    price         = 49000,
    max_branches  = 1,
    max_employees = 1,
    description   = 'Cocok untuk bisnis dengan 1 cabang dan 1 akun pegawai kasir',
    features      = '["Maksimal 1 cabang","1 akun pegawai (khusus cabang)","Semua fitur kasir POS","Laporan harian & mingguan","Export CSV","Support standar"]'::jsonb
where code = 'standard';

update public.subscription_plans set
    price         = 99000,
    max_branches  = 3,
    max_employees = 3,
    description   = 'Untuk bisnis yang mulai berkembang hingga 3 cabang',
    features      = '["Maksimal 3 cabang","3 akun pegawai (1 pegawai per cabang)","Semua fitur Standard","Laporan advanced & HPP","Export Excel","Support prioritas"]'::jsonb
where code = 'business';

update public.subscription_plans set
    price         = 179000,
    max_branches  = 5,
    max_employees = 5,
    description   = 'Untuk bisnis berkembang pesat hingga 5 cabang',
    features      = '["Maksimal 5 cabang","5 akun pegawai (1 pegawai per cabang)","Semua fitur Business","Laporan advanced & HPP","Akses API","Support prioritas 24/7"]'::jsonb
where code = 'pro';

-- 2. Tambahkan kolom image_url pada public.products
alter table public.products
    add column if not exists image_url text null;

comment on column public.products.image_url is 'URL atau WebP Data URI foto produk yang ditampilkan di Katalog Produk dan Kasir POS';

-- Berikan izin SELECT kolom image_url pada tabel products untuk role authenticated (kasir & owner)
grant select (image_url) on public.products to authenticated;

-- Perbarui owner_products_view agar menyertakan kolom image_url baru
create or replace view public.owner_products_view
with (security_barrier = true)
as
select *
from public.products
where business_id = auth_business_id()
  and auth_is_owner();

grant select on public.owner_products_view to authenticated;

-- Perbarui get_cashier_products RPC agar tidak gagal & tetap kompatibel
create or replace function public.get_cashier_products(p_business_id uuid)
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
  from public.products p
  where p.business_id = p_business_id
    and p.status = 'aktif'
    and p.business_id = auth_business_id()
  order by p.name asc;
$$;

revoke execute on function public.get_cashier_products(uuid) from public;
grant execute on function public.get_cashier_products(uuid) to authenticated, service_role;

-- 3. Tambahkan kolom qris_image_url pada public.businesses dan public.branches
alter table public.businesses
    add column if not exists qris_image_url text null;

alter table public.branches
    add column if not exists qris_image_url text null;

comment on column public.businesses.qris_image_url is 'URL atau WebP Data URI gambar kode QRIS statis bisnis (hanya dapat diubah oleh Owner)';
comment on column public.branches.qris_image_url is 'URL atau WebP Data URI gambar kode QRIS statis cabang (opsional, hanya dapat diubah oleh Owner)';

-- Sinkronisasikan nilai qris_url lama ke qris_image_url jika sudah ada
update public.businesses
set qris_image_url = qris_url
where qris_image_url is null and qris_url is not null;

-- Pastikan grant UPDATE pada businesses menyertakan qris_image_url (RLS tetap membatasi hanya untuk Owner)
grant update (name, address, phone, logo_url, qris_url, qris_image_url) on public.businesses to authenticated;

-- Pertegas policy RLS bahwa hanya Owner yang dapat mengubah data bisnis (termasuk qris_image_url & qris_url)
drop policy if exists "owner update own business" on public.businesses;
create policy "owner update own business" on public.businesses
  for update
  using (id = auth_business_id() and auth_is_owner())
  with check (id = auth_business_id() and auth_is_owner());

