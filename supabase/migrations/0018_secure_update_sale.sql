-- ================================================================
-- Migration 0018: Secure Atomic Update Sale & Inventory Sync
-- 1. Stored Procedure RPC fn_update_sale_atomic untuk atomisitas edit transaksi
-- 2. Menjamin perubahan header sales, sale_items, dan sale_edit_logs
--    berada dalam satu transaksi database tunggal (all-or-nothing).
-- 3. Verifikasi otorisasi caller di level database (anti-bypass)
-- ================================================================

create or replace function update_sale_atomic(
  p_sale_id uuid,
  p_business_id uuid,
  p_user_id uuid,
  p_channel sale_channel,
  p_payment_method payment_method,
  p_total numeric(12,2),
  p_items jsonb, -- Array of {product_id: uuid, quantity: numeric, price: numeric, cost_price: numeric, subtotal: numeric}
  p_old_data jsonb,
  p_new_data jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_biz_id uuid;
  v_current_branch_id uuid;
  v_caller_biz_id uuid;
  v_caller_branch_id uuid;
  v_caller_role text;
  v_item record;
begin
  -- Otorisasi Pemanggil di level database (Anti Bypass)
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
  end if;

  -- 1. Validasi keberadaan transaksi dan isolasi tenant
  select business_id, branch_id
  into v_current_biz_id, v_current_branch_id
  from sales
  where id = p_sale_id;

  if v_current_biz_id is null then
    raise exception 'Transaksi tidak ditemukan.';
  end if;

  if v_current_biz_id <> p_business_id then
    raise exception 'Akses ditolak: Transaksi tidak terdaftar di bisnis Anda.';
  end if;

  -- Jika pemanggil adalah pegawai, hanya boleh mengedit transaksi di cabangnya sendiri
  if v_caller_role = 'pegawai' and v_caller_branch_id is not null and v_caller_branch_id <> v_current_branch_id then
    raise exception 'Akses ditolak: Pegawai hanya dapat mengedit transaksi di cabang sendiri.';
  end if;

  -- 2. Update header penjualan
  update sales
  set channel = p_channel,
      payment_method = p_payment_method,
      total = p_total,
      is_edited = true,
      updated_at = now()
  where id = p_sale_id;

  -- 3. Hapus item lama (trigger akan mengembalikan stok lama secara otomatis)
  delete from sale_items
  where sale_id = p_sale_id;

  -- 4. Masukkan item baru yang sudah diverifikasi (trigger akan mengurangi stok baru secara otomatis)
  for v_item in select * from jsonb_to_recordset(p_items) as (
    product_id uuid,
    quantity numeric(10,2),
    price numeric(12,2),
    cost_price numeric(12,2),
    subtotal numeric(12,2)
  ) loop
    if not exists (select 1 from products where id = v_item.product_id and business_id = p_business_id) then
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
      p_sale_id,
      v_item.product_id,
      v_item.quantity,
      v_item.price,
      v_item.cost_price,
      v_item.subtotal
    );
  end loop;

  -- 5. Catat jejak audit pengeditan
  insert into sale_edit_logs (
    sale_id,
    business_id,
    edited_by,
    old_data,
    new_data,
    reason
  ) values (
    p_sale_id,
    p_business_id,
    p_user_id,
    p_old_data,
    p_new_data,
    p_reason
  );

  return jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id
  );
exception
  when others then
    -- PostgreSQL otomatis me-rollback seluruh operasi jika terjadi exception
    raise exception 'Gagal memperbarui transaksi atomik: %', SQLERRM;
end;
$$;

-- 4. Batasi hak akses eksekusi RPC hanya untuk role authenticated dan service_role
revoke execute on function update_sale_atomic(uuid, uuid, uuid, sale_channel, payment_method, numeric, jsonb, jsonb, jsonb, text) from public;
grant execute on function update_sale_atomic(uuid, uuid, uuid, sale_channel, payment_method, numeric, jsonb, jsonb, jsonb, text) to authenticated, service_role;
