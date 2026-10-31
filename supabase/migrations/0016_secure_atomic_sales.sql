-- ================================================================
-- Migration 0016: Secure Atomic Sales & Idempotency
-- 1. Tambah kolom idempotency_key dan invoice_number pada tabel sales
-- 2. Partial unique index untuk mencegah transaksi duplikat akibat retry/klik ganda
-- 3. Stored Procedure RPC fn_create_sale_atomic untuk atomisitas transaksi
--    dengan verifikasi ketat otorisasi tenant, cabang, dan integritas data
-- ================================================================

-- 1. Tambah kolom idempotency_key dan invoice_number
alter table sales
  add column if not exists idempotency_key uuid,
  add column if not exists invoice_number text;

-- 2. Unique index untuk idempotency per bisnis
create unique index if not exists idx_sales_business_idempotency
  on sales (business_id, idempotency_key)
  where idempotency_key is not null;

-- Index invoice_number untuk pencarian cepat
create index if not exists idx_sales_invoice_number
  on sales (business_id, invoice_number)
  where invoice_number is not null;

-- 3. Stored Procedure atomik untuk pembuatan transaksi
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

  -- 1. Insert header penjualan
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
    p_total,
    p_idempotency_key,
    p_invoice_number
  ) returning id into v_sale_id;

  -- 2. Insert item-item penjualan secara atomik
  for v_item in select * from jsonb_to_recordset(p_items) as (
    product_id uuid,
    quantity numeric(10,2),
    price numeric(12,2),
    cost_price numeric(12,2),
    subtotal numeric(12,2)
  ) loop
    declare
      v_db_cost_price numeric(12,2);
    begin
      -- Pastikan produk terdaftar pada bisnis yang sah dan ambil HPP resmi langsung dari database
      select coalesce(cost_price, 0)
      into v_db_cost_price
      from products
      where id = v_item.product_id and business_id = p_business_id;

      if not found then
        raise exception 'Produk % tidak terdaftar pada bisnis Anda.', v_item.product_id;
      end if;

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
        v_item.price,
        v_db_cost_price,
        v_item.subtotal
      );
    end;
  end loop;

  return jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'is_duplicate', false
  );
exception
  when unique_violation then
    -- Tangani balapan konkurensi: jika transaksi dengan idempotency_key serupa baru saja masuk
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
    raise exception 'Gagal menyimpan transaksi atomik: duplikasi constraint terdeteksi.';
  when others then
    -- PostgreSQL otomatis me-rollback seluruh transaksi saat terjadi exception
    raise exception 'Gagal menyimpan transaksi atomik: %', SQLERRM;
end;
$$;

-- 4. Batasi hak akses eksekusi RPC hanya untuk role authenticated dan service_role
revoke execute on function create_sale_atomic(uuid, uuid, uuid, sale_channel, payment_method, numeric, jsonb, uuid, text) from public;
grant execute on function create_sale_atomic(uuid, uuid, uuid, sale_channel, payment_method, numeric, jsonb, uuid, text) to authenticated, service_role;

