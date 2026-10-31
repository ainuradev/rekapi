-- ================================================================
-- Migration 0020: Add business & branch profiles (Phase 1)
-- 1. Tambah kolom address, phone, logo_url pada tabel businesses
-- 2. Tambah kolom address, phone pada tabel branches
-- Menjamin isolasi tenant, non-destruktif, dan kompatibel mundur.
-- ================================================================

-- 1. Tambah kolom profil pada businesses
alter table businesses
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists logo_url text;

comment on column businesses.address is 'Alamat lengkap lokasi utama / kantor bisnis UMKM';
comment on column businesses.phone is 'Nomor telepon atau kontak resmi bisnis';
comment on column businesses.logo_url is 'URL logo bisnis untuk keperluan branding dan struk';

-- 2. Tambah kolom profil pada branches
alter table branches
  add column if not exists address text,
  add column if not exists phone text;

comment on column branches.address is 'Alamat fisik lokasi cabang atau outlet toko';
comment on column branches.phone is 'Nomor telepon atau kontak operasional cabang';
