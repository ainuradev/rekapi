-- =========================================================
-- Migration 0007: Allow Branch Sales Edit & Sale Items Delete
--
-- 1. Izinkan pegawai mengedit transaksi yang berada di cabangnya
--    (tidak terbatas hanya jika dia yang menginput / user_id = auth.uid()).
--    Berguna jika ada kasir ganti shift, atau akun shared cabang.
-- 2. Tambahkan policy DELETE pada sale_items agar pergantian item saat
--    edit transaksi tidak diblokir oleh RLS.
-- 3. Sesuaikan insert policy pada sale_edit_logs dengan aturan update di atas.
-- =========================================================

-- 1. UPDATE SALES: Owner semua cabang, Pegawai transaksi di cabangnya
drop policy if exists "update sales in tenant" on sales;
create policy "update sales in tenant" on sales
  for update using (
    business_id = auth_business_id()
    and (auth_is_owner() or branch_id = auth_branch_id())
  );

-- 2. DELETE SALE_ITEMS: Izinkan delete item jika user berhak mengedit sale tersebut
drop policy if exists "delete sale_items via sale" on sale_items;
create policy "delete sale_items via sale" on sale_items
  for delete using (
    exists (
      select 1 from sales s
      where s.id = sale_items.sale_id
      and s.business_id = auth_business_id()
      and (auth_is_owner() or s.branch_id = auth_branch_id())
    )
  );

-- 3. INSERT SALE_EDIT_LOGS: Izinkan audit log untuk owner & pegawai di cabangnya
drop policy if exists "insert sale_edit_logs matching sale permission" on sale_edit_logs;
drop policy if exists "insert sale_edit_logs in tenant" on sale_edit_logs;
create policy "insert sale_edit_logs matching sale permission" on sale_edit_logs
  for insert with check (
    exists (
      select 1 from sales s
      where s.id = sale_edit_logs.sale_id
      and s.business_id = auth_business_id()
      and (auth_is_owner() or s.branch_id = auth_branch_id())
    )
    and edited_by = auth.uid()
  );
