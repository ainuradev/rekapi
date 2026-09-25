-- =========================================================
-- Migration 0009: Product Unit (Satuan Penjualan)
--
-- 1. Tambah kolom `unit` ke tabel products (default 'pcs')
--    Contoh nilai: 'porsi', 'cup', 'pcs', 'botol', 'pack', 'box', 'loyang', 'kg'
-- =========================================================

alter table products
  add column if not exists unit text not null default 'pcs';
