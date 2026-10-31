-- ================================================================
-- Migration 0017: Preserve Audit Trail on Sale Deletion & Multi-Tenant Audit
-- 1. Mengubah kolom sale_id pada tabel sale_edit_logs menjadi NULLABLE
-- 2. Mengubah foreign key constraint dari ON DELETE CASCADE menjadi ON DELETE SET NULL
--    sehingga histori audit log tidak ikut musnah saat transaksi dihapus oleh owner.
-- 3. Menambahkan kolom business_id pada sale_edit_logs dan memperbarui RLS
--    agar audit log tetap terikat pada tenant bisnis dan dapat diaudit meski transaksi dihapus.
-- ================================================================

-- 1. Hapus batasan NOT NULL pada sale_id agar bisa bernilai NULL saat transaksi dihapus
alter table sale_edit_logs
  alter column sale_id drop not null;

-- 2. Ganti constraint foreign key ON DELETE CASCADE menjadi ON DELETE SET NULL
alter table sale_edit_logs
  drop constraint if exists sale_edit_logs_sale_id_fkey,
  add constraint sale_edit_logs_sale_id_fkey
    foreign key (sale_id) references sales(id) on delete set null;

-- 3. Tambahkan business_id agar audit log memiliki tenant isolation mandiri
alter table sale_edit_logs
  add column if not exists business_id uuid references businesses(id) on delete cascade;

-- Backfill business_id dari data transaksi lama jika belum terisi
update sale_edit_logs sel
set business_id = s.business_id
from sales s
where sel.sale_id = s.id
  and sel.business_id is null;

-- 4. Perbarui RLS select policy agar tenant tetap bisa membaca log walau sale_id sudah null
drop policy if exists "select sale_edit_logs in tenant" on sale_edit_logs;
create policy "select sale_edit_logs in tenant" on sale_edit_logs
  for select using (
    business_id in (select business_id from profiles where id = auth.uid())
    or
    exists (
      select 1 from sales s
      where s.id = sale_edit_logs.sale_id
        and s.business_id in (select business_id from profiles where id = auth.uid())
    )
  );
