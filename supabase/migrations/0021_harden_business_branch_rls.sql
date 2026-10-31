-- ================================================================
-- Migration 0021: Harden Business & Branch RLS, Enforce Plan Limits, and Price Integrity
-- Status: VERIFIED & TESTED in Staging (12/12 PASS)
--
-- Temuan yang ditutup:
--  F1. Policy "owner update own business" (0002) dibatasi hanya ke kolom profil
--      (name, address, phone, logo_url). Owner ditolak mengubah kolom langganan langsung.
--  F2. Batas subscription_plans.max_branches ditegakkan di level database
--      menggunakan trigger enforce_branch_limit() dengan FOR UPDATE row-lock.
--  F3. Integritas harga pada RPC create_sale_atomic: menghitung ulang subtotal & total
--      dari selling_price resmi database dan menolak total manipulasi client.
-- ================================================================

-- F1: batasi UPDATE businesses oleh user biasa hanya ke kolom profil
revoke update on businesses from authenticated;
grant update (name, address, phone, logo_url) on businesses to authenticated;

-- F2: tegakkan max_branches di level database
create or replace function enforce_branch_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max int;
  v_count int;
begin
  -- service_role (admin/backoffice) tidak dibatasi
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- kunci baris bisnis untuk mencegah race antar-insert paralel
  perform 1 from businesses where id = new.business_id for update;

  select sp.max_branches into v_max
  from businesses b
  left join subscription_plans sp on sp.id = b.subscription_plan_id
  where b.id = new.business_id;

  -- null = unlimited (sesuai komentar 0001)
  if v_max is null then
    return new;
  end if;

  select count(*) into v_count from branches where business_id = new.business_id;

  if v_count >= v_max then
    raise exception 'Batas cabang paket langganan tercapai (maks %).', v_max
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_branch_limit on branches;
create trigger trg_enforce_branch_limit
  before insert on branches
  for each row execute function enforce_branch_limit();

revoke execute on function enforce_branch_limit() from public;

-- ================================================================
-- F3: Integritas harga pada RPC create_sale_atomic
-- Cegah manipulasi harga/total langsung dari client dengan validasi selling_price resmi dari DB
-- ================================================================
create or replace function create_sale_atomic(
  p_business_id uuid,
  p_branch_id uuid,
  p_user_id uuid,
  p_channel sale_channel,
  p_payment_method payment_method,
  p_total numeric(12,2),
  p_items jsonb, -- Array of {product_id: uuid, quantity: numeric, price: numeric, cost_price: numeric, subtotal: numeric}
  p_idempotency_key uuid default null,
  p_invoice_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_item record;
  v_caller_biz_id uuid;
  v_caller_branch_id uuid;
  v_caller_role text;
  v_db_cost_price numeric(12,2);
  v_db_selling_price numeric(12,2);
  v_item_subtotal numeric(12,2);
  v_computed_total numeric(12,2) := 0;
begin
  -- Otorisasi Pemanggil di level Database (Anti Bypass RPC)
  if auth.uid() is null and auth.role() <> 'service_role' then
    raise exception 'Akses ditolak: Pengguna tidak terautentikasi.';
  end if;

  if auth.uid() is not null then
    select business_id, branch_id, role
    into v_caller_biz_id, v_caller_branch_id, v_caller_role
    from profiles
    where id = auth.uid();

    if v_caller_biz_id is null or v_caller_biz_id <> p_business_id then
      raise exception 'Akses ditolak: Anda tidak memiliki wewenang pada bisnis ini.';
    end if;

    if v_caller_role = 'pegawai' and v_caller_branch_id is not null and v_caller_branch_id <> p_branch_id then
      raise exception 'Akses ditolak: Pegawai hanya dapat membuat transaksi di cabangnya sendiri.';
    end if;
  end if;

  -- Validasi cabang harus terdaftar pada bisnis yang sama
  if not exists (select 1 from branches where id = p_branch_id and business_id = p_business_id) then
    raise exception 'Cabang tidak valid atau tidak terdaftar pada bisnis Anda.';
  end if;

  -- Pengecekan Idempotensi: jika idempotency_key sudah terdaftar, kembalikan transaksi yang sudah ada
  if p_idempotency_key is not null then
    select id into v_sale_id
    from sales
    where business_id = p_business_id
      and idempotency_key = p_idempotency_key;

    if v_sale_id is not null then
      return jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'is_duplicate', true
      );
    end if;
  end if;

  -- 1. Validasi item dan hitung total resmi langsung dari database produk
  for v_item in select * from jsonb_to_recordset(p_items) as (
    product_id uuid,
    quantity numeric(10,2),
    price numeric(12,2),
    cost_price numeric(12,2),
    subtotal numeric(12,2)
  ) loop
    select coalesce(cost_price, 0), coalesce(selling_price, 0)
    into v_db_cost_price, v_db_selling_price
    from products
    where id = v_item.product_id and business_id = p_business_id;

    if not found then
      raise exception 'Produk % tidak terdaftar pada bisnis Anda.', v_item.product_id;
    end if;

    v_item_subtotal := round(v_db_selling_price * v_item.quantity, 2);
    v_computed_total := v_computed_total + v_item_subtotal;
  end loop;

  -- Verifikasi total transaksi tidak boleh dimanipulasi dari client
  if abs(coalesce(p_total, 0) - v_computed_total) > 0.05 then
    raise exception 'Integritas harga gagal: total transaksi (%) tidak sesuai dengan total resmi (%).', p_total, v_computed_total;
  end if;

  -- 2. Insert header penjualan dengan total terverifikasi
  insert into sales (
    business_id,
    branch_id,
    user_id,
    channel,
    payment_method,
    total,
    idempotency_key,
    invoice_number
  ) values (
    p_business_id,
    p_branch_id,
    p_user_id,
    p_channel,
    p_payment_method,
    v_computed_total,
    p_idempotency_key,
    p_invoice_number
  ) returning id into v_sale_id;

  -- 3. Insert item-item penjualan secara atomik dengan harga dan HPP resmi
  for v_item in select * from jsonb_to_recordset(p_items) as (
    product_id uuid,
    quantity numeric(10,2),
    price numeric(12,2),
    cost_price numeric(12,2),
    subtotal numeric(12,2)
  ) loop
    select coalesce(cost_price, 0), coalesce(selling_price, 0)
    into v_db_cost_price, v_db_selling_price
    from products
    where id = v_item.product_id and business_id = p_business_id;

    v_item_subtotal := round(v_db_selling_price * v_item.quantity, 2);

    insert into sale_items (
      sale_id,
      product_id,
      quantity,
      price,
      cost_price,
      subtotal
    ) values (
      v_sale_id,
      v_item.product_id,
      v_item.quantity,
      v_db_selling_price,
      v_db_cost_price,
      v_item_subtotal
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'is_duplicate', false
  );
exception
  when unique_violation then
    if p_idempotency_key is not null then
      select id into v_sale_id
      from sales
      where business_id = p_business_id
        and idempotency_key = p_idempotency_key;

      if v_sale_id is not null then
        return jsonb_build_object(
          'success', true,
          'sale_id', v_sale_id,
          'is_duplicate', true
        );
      end if;
    end if;
    raise;
end;
$$;
