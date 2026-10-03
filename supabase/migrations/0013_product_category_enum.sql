-- ================================================================
-- Migration 0013: Product Category Enum
-- Membuat enum `product_category` dengan nilai ('makanan', 'minuman', 'lainnya')
-- dan mengonversi kolom `category` pada tabel `products` menggunakan enum ini.
-- ================================================================

-- 1. Buat tipe enum product_category jika belum ada
do $$
begin
  if not exists (select 1 from pg_type where typname = 'product_category') then
    create type product_category as enum ('makanan', 'minuman', 'lainnya');
  end if;
end$$;

-- 2. Bersihkan atau normalisasi nilai category yang sudah ada pada tabel products
-- agar sesuai dengan nilai enum ('makanan', 'minuman', 'lainnya')
update products
set category = case
  when lower(trim(category)) in ('makanan', 'food', 'snack', 'cemilan') then 'makanan'
  when lower(trim(category)) in ('minuman', 'drink', 'beverage', 'kopi', 'tea', 'teh') then 'minuman'
  when category is not null and trim(category) <> '' then 'lainnya'
  else 'makanan' -- default jika null/kosong
end;

-- 3. Ubah tipe kolom category menjadi product_category dengan default 'makanan'
alter table products
  alter column category set default 'makanan'::product_category,
  alter column category type product_category using (category::product_category);
