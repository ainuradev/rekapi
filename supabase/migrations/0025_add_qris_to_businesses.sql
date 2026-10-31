-- ================================================================
-- Migration 0025: Add QRIS static image support to businesses
-- Status: Release Candidate
--
-- Entitas yang dibuat/diperbarui:
--  1. businesses.qris_url: Menyimpan URL atau Data URI gambar QRIS statis bisnis
--  2. Grant update kolom qris_url ke authenticated (owner terisolasi via RLS)
-- ================================================================

alter table businesses
  add column if not exists qris_url text;

comment on column businesses.qris_url is 'URL atau Data URI gambar QRIS statis bisnis untuk ditampilkan pada modal kasir POS saat pembayaran QRIS';

-- Perbarui izin update kolom pada tabel businesses agar authenticated (owner) dapat menyimpan qris_url
grant update (name, address, phone, logo_url, qris_url) on businesses to authenticated;
