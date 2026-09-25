-- =========================================================
-- Update trigger handle_new_user:
-- - Kalau signup BIASA (lewat form /register) → tetap buat business baru
--   + profile owner, seperti sebelumnya.
-- - Kalau user dibuat lewat ADMIN API oleh owner (invite pegawai) → metadata
--   akan berisi `invited_business_id`, `invited_role`, `invited_branch_id`.
--   Di kasus ini, JANGAN buat business baru — cukup buat profile yang
--   nempel ke business yang sudah ada.
-- =========================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_invited_business_id uuid;
begin
  v_invited_business_id := (new.raw_user_meta_data->>'invited_business_id')::uuid;

  if v_invited_business_id is not null then
    -- Kasus: pegawai yang diundang owner ke business yang sudah ada.
    insert into public.profiles (id, business_id, branch_id, role, full_name)
    values (
      new.id,
      v_invited_business_id,
      (new.raw_user_meta_data->>'invited_branch_id')::uuid,
      coalesce(new.raw_user_meta_data->>'invited_role', 'pegawai')::user_role,
      coalesce(new.raw_user_meta_data->>'full_name', new.email)
    );
  else
    -- Kasus normal: signup baru, bikin business + profile owner.
    insert into public.businesses (name)
    values (coalesce(new.raw_user_meta_data->>'business_name', 'Bisnis Baru'))
    returning id into v_business_id;

    insert into public.profiles (id, business_id, branch_id, role, full_name)
    values (
      new.id,
      v_business_id,
      null,
      'owner',
      coalesce(new.raw_user_meta_data->>'full_name', new.email)
    );
  end if;

  return new;
end;
$$;

-- Trigger-nya sendiri tidak berubah, cuma function-nya yang diganti (create or replace di atas).