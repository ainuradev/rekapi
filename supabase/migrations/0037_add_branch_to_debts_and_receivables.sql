-- ================================================================
-- Migration 0037: Add branch_id to debts_payables and receivables
-- Mendukung isolasi cabang pada Buku Utang dan Piutang Usaha
-- ================================================================

-- 1. Tambah kolom branch_id ke debts_payables
alter table debts_payables
  add column if not exists branch_id uuid references branches(id) on delete set null;

create index if not exists idx_debts_branch on debts_payables (business_id, branch_id);

-- Backfill branch_id utang yang terhubung ke pembelian bahan baku (purchases)
update debts_payables d
set branch_id = p.branch_id
from purchases p
where d.purchase_id = p.id
  and d.branch_id is null;

-- 2. Tambah kolom branch_id ke receivables
alter table receivables
  add column if not exists branch_id uuid references branches(id) on delete set null;

create index if not exists idx_receivables_branch on receivables (business_id, branch_id);

-- Backfill branch_id piutang yang terhubung ke penjualan kasir (sales)
update receivables r
set branch_id = s.branch_id
from sales s
where r.sale_id = s.id
  and r.branch_id is null;

