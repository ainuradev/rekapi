-- =========================================================
-- UMKM OS (Rekapin) — Auth Trigger
-- Saat user baru register (auth.users), otomatis:
-- 1. Buat row di `businesses` (nama diambil dari metadata signup)
-- 2. Buat row di `profiles` dengan role 'owner', terhubung ke business itu
-- =========================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  -- Ambil nama bisnis & nama lengkap dari metadata yang dikirim saat signUp
  insert into public.businesses (name)
  values (coalesce(new.raw_user_meta_data->>'business_name', 'Bisnis Baru'))
  returning id into v_business_id;

  insert into public.profiles (id, business_id, branch_id, role, full_name)
  values (
    new.id,
    v_business_id,
    null, -- owner akses semua cabang
    'owner',
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );

  return new;
end;
$$;

-- Trigger jalan setelah Supabase Auth berhasil membuat user baru
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- CATATAN:
-- - Trigger ini hanya untuk REGISTER OWNER BARU (bikin bisnis baru).
-- - Untuk pegawai yang diundang owner, jangan lewat trigger ini —
--   itu harus dibuatkan flow terpisah (owner insert manual ke `profiles`
--   dengan business_id yang sudah ada, lalu kirim invite email/reset password).