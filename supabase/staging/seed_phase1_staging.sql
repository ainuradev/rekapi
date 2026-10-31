-- ================================================================
-- STAGING-ONLY seed for Phase 1 integration tests.
-- JANGAN PERNAH dijalankan di project production.
--
-- Prasyarat: buat 3 user di Supabase Auth STAGING (Dashboard > Authentication
-- > Add user, centang "Auto confirm"):
--   owner-a@rekapi-staging.test, pegawai-a@rekapi-staging.test,
--   owner-b@rekapi-staging.test
-- Trigger handle_new_user (0004/0006) akan membuat business + profile owner
-- untuk setiap signup. Skrip ini lalu merapikan role & relasi.
-- Jalankan di SQL Editor project STAGING.
-- ================================================================

do $$
declare
  v_owner_a uuid;
  v_emp_a uuid;
  v_owner_b uuid;
  v_biz_a uuid;
  v_biz_b uuid;
  v_branch_a uuid;
  v_branch_b uuid;
  v_plan uuid;
begin
  -- Guard anti salah database: batalkan jika mendeteksi nama bisnis customer production
  if exists (select 1 from businesses where name ilike '%dimsum mentai%') then
    raise exception 'BAHAYA: Database ini terdeteksi sebagai database PRODUCTION (ada Dimsum Mentai). Eksekusi seed dibatalkan!';
  end if;

  select id into v_owner_a from auth.users where email = 'owner-a@rekapi-staging.test';
  select id into v_emp_a   from auth.users where email = 'pegawai-a@rekapi-staging.test';
  select id into v_owner_b from auth.users where email = 'owner-b@rekapi-staging.test';
  if v_owner_a is null or v_emp_a is null or v_owner_b is null then
    raise exception 'Buat ketiga user staging terlebih dahulu';
  end if;

  select business_id into v_biz_a from profiles where id = v_owner_a;
  select business_id into v_biz_b from profiles where id = v_owner_b;

  -- Paket business (3 cabang) agar test CRUD cabang dan max_branches bermakna
  select id into v_plan from subscription_plans where code = 'business';

  update businesses set name = 'IT Tenant A', subscription_status = 'active',
    subscription_plan_id = v_plan, subscription_expires_at = now() + interval '30 days'
    where id = v_biz_a;
  update businesses set name = 'IT Tenant B', subscription_status = 'active',
    subscription_plan_id = v_plan, subscription_expires_at = now() + interval '30 days'
    where id = v_biz_b;

  insert into branches (business_id, name, address, phone)
    values (v_biz_a, 'IT Cabang A1', 'Jl. Dummy A1', '0800000001') returning id into v_branch_a;
  insert into branches (business_id, name)
    values (v_biz_b, 'IT Cabang B1') returning id into v_branch_b;

  -- Employee A: pastikan profile terpasang ke bisnis A, role pegawai, terkunci di cabang A1.
  -- Gunakan upsert agar aman dari cascade delete.
  insert into profiles (id, business_id, branch_id, role, full_name)
    values (v_emp_a, v_biz_a, v_branch_a, 'pegawai', 'pegawai-a@rekapi-staging.test')
    on conflict (id) do update set
      business_id = excluded.business_id,
      branch_id = excluded.branch_id,
      role = excluded.role;

  insert into products (business_id, name, selling_price, cost_price, status)
    values (v_biz_a, 'IT Produk A', 10000, 4000, 'aktif'),
           (v_biz_b, 'IT Produk B', 20000, 9000, 'aktif');

  -- Satu penjualan historis di cabang A1 (untuk test FK RESTRICT 2b)
  insert into sales (business_id, branch_id, user_id, channel, payment_method, total)
    values (v_biz_a, v_branch_a, v_owner_a, 'offline', 'cash', 10000);
end $$;
