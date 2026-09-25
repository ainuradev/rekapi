-- =========================================================
-- Fix 1: Pegawai boleh INSERT produk (misal lapor barang baru datang),
-- tapi UPDATE/DELETE produk tetap owner-only (biar harga jual/HPP
-- yang sudah ada nggak bisa diubah sembarangan sama pegawai).
-- =========================================================

drop policy if exists "owner manage products" on products;

-- Select: semua role dalam tenant boleh lihat (sudah ada sebelumnya, tetap dipertahankan)
-- (policy "select products in tenant" sudah cukup, tidak perlu diubah)

create policy "owner update products" on products
  for update using (business_id = auth_business_id() and auth_is_owner());

create policy "owner delete products" on products
  for delete using (business_id = auth_business_id() and auth_is_owner());

create policy "insert products in tenant" on products
  for insert with check (business_id = auth_business_id());
  -- Owner & pegawai sama-sama boleh insert produk baru.
  -- HPP-nya sendiri dikunci lewat trigger di bawah, bukan lewat policy ini.

-- ---------------------------------------------------------
-- Trigger: pegawai TIDAK BOLEH set cost_price (HPP) sendiri,
-- meskipun dia kirim value lewat form/API. Dipaksa 0, biar diisi
-- owner belakangan lewat halaman update produk (yang owner-only).
-- Ini dikunci di level database, bukan cuma disembunyikan di UI —
-- jadi nggak bisa diakalin lewat devtools.
-- ---------------------------------------------------------
create or replace function enforce_cost_price_owner_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not auth_is_owner() then
    new.cost_price := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_cost_price on products;
create trigger trg_enforce_cost_price
  before insert on products
  for each row execute function enforce_cost_price_owner_only();


-- =========================================================
-- Fix 2: sale_edit_logs insert harus mengikuti aturan yang SAMA
-- dengan siapa yang boleh update sales itu sendiri — bukan cuma
-- cek business_id doang.
-- =========================================================

drop policy if exists "insert sale_edit_logs in tenant" on sale_edit_logs;

create policy "insert sale_edit_logs matching sale permission" on sale_edit_logs
  for insert with check (
    exists (
      select 1 from sales s
      where s.id = sale_edit_logs.sale_id
      and s.business_id = auth_business_id()
      and (auth_is_owner() or (s.branch_id = auth_branch_id() and s.user_id = auth.uid()))
    )
    and edited_by = auth.uid()
  );