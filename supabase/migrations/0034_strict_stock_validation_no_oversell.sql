-- ================================================================
-- Migration 0034: Strict Stock Validation (No Oversell) pada Penjualan Baru & Edit Riwayat Transaksi
--
-- Tujuan:
-- 1. Menolak keras transaksi penjualan baru (`create_sale_atomic`) maupun edit riwayat
--    transaksi (`update_sale_atomic`) apabila kuantitas item melebihi stok cabang yang
--    efektif tersedia.
-- 2. Rumus ketersediaan stok pada Edit Transaksi:
--      Stok Efektif Tersedia = Stok Cabang Saat Ini + Stok Lama yang Dipulihkan dari Transaksi Ini (old_qty)
--    Di dalam transaksi database atomik, penghapusan `sale_items` lama memulihkan stok terlebih dahulu,
--    lalu sebelum pemotongan item baru dilakukan pengecekan ketat dengan row-level lock (`FOR UPDATE`).
--    Jika `new_qty > Stok Efektif Tersedia`, fungsi melempar `RAISE EXCEPTION` (`P0001`) sehingga
--    seluruh perubahan otomatis di-rollback bersih.
-- 3. Memperkuat trigger `fn_deduct_stock_on_sale` (`BEFORE INSERT ON sale_items`) sebagai jaring
--    pengaman terakhir agar penyisipan langsung ke `sale_items` pun tidak pernah bisa oversell.
-- ================================================================

begin;

-- 1. HELPER FORMAT ANGKA STOK BERSIH (Contoh: 8.00 -> "8", 2.50 -> "2.5")
create or replace function fn_format_stock_qty(p_val numeric)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_clean numeric;
begin
  v_clean := greatest(round(coalesce(p_val, 0), 2), 0);
  if v_clean = trunc(v_clean) then
    return trunc(v_clean)::bigint::text;
  end if;
  return rtrim(v_clean::text, '0');
end;
$$;

-- 2. TRIGGER PEMOTONGAN STOK KETAT (BEFORE INSERT ON sale_items — NO OVERSELL)
create or replace function fn_deduct_stock_on_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_sale_status text;
  v_product_name text;
  v_current_branch_stock numeric(10,2);
  v_current_global_stock numeric(10,2);
  v_available numeric(10,2) := 0;
  v_has_branch_row boolean := false;
begin
  if new.quantity is null or new.quantity <= 0 then
    raise exception 'Kuantitas item harus lebih besar dari 0.' using errcode = '22003';
  end if;

  select branch_id, coalesce(status, 'completed')
  into v_branch_id, v_sale_status
  from sales
  where id = new.sale_id;

  if v_sale_status = 'voided' then
    raise exception 'Tidak dapat menambahkan item ke transaksi yang telah dibatalkan (voided).'
      using errcode = 'P0001';
  end if;

  select name, stock
  into v_product_name, v_current_global_stock
  from products
  where id = new.product_id;

  if v_branch_id is not null then
    select stock into v_current_branch_stock
    from product_branch_stocks
    where product_id = new.product_id
      and branch_id = v_branch_id
    for update;

    if found then
      v_has_branch_row := true;
      v_available := greatest(coalesce(v_current_branch_stock, 0), 0);

      if new.quantity > v_available then
        raise exception 'Stok produk % tidak mencukupi. Stok tersedia maksimal: %',
          coalesce(v_product_name, 'Produk'),
          fn_format_stock_qty(v_available)
          using errcode = 'P0001';
      end if;

      update product_branch_stocks
        set stock = stock - new.quantity,
            updated_at = now()
      where product_id = new.product_id
        and branch_id = v_branch_id;
      -- trg_sync_product_aggregate_stock otomatis menyinkronkan products.stock = SUM(stock)

      new.branch_stock_deducted := new.quantity;
      new.global_stock_deducted := new.quantity;
      return new;
    end if;

    -- Jika produk sudah memakai product_branch_stocks di cabang lain tetapi belum ada baris di cabang ini,
    -- maka stok fisik di cabang ini adalah 0 (tolak oversell lintas cabang).
    if exists (select 1 from product_branch_stocks where product_id = new.product_id) then
      raise exception 'Stok produk % tidak mencukupi. Stok tersedia maksimal: 0',
        coalesce(v_product_name, 'Produk')
        using errcode = 'P0001';
    end if;
  end if;

  -- Fallback hanya untuk produk kompatibilitas lama yang sama sekali belum memiliki baris di product_branch_stocks
  select name, stock
  into v_product_name, v_current_global_stock
  from products
  where id = new.product_id
  for update;

  if not found then
    raise exception 'Produk % tidak ditemukan.', new.product_id using errcode = 'P0002';
  end if;

  v_available := greatest(coalesce(v_current_global_stock, 0), 0);
  if new.quantity > v_available then
    raise exception 'Stok produk % tidak mencukupi. Stok tersedia maksimal: %',
      coalesce(v_product_name, 'Produk'),
      fn_format_stock_qty(v_available)
      using errcode = 'P0001';
  end if;

  update products
    set stock = stock - new.quantity,
        updated_at = now()
  where id = new.product_id;

  new.branch_stock_deducted := 0;
  new.global_stock_deducted := new.quantity;
  return new;
end;
$$;

drop trigger if exists trg_deduct_stock_on_sale on sale_items;
create trigger trg_deduct_stock_on_sale
  before insert on sale_items
  for each row
  execute function fn_deduct_stock_on_sale();

-- 3. PERBARUI RPC UPDATE_SALE_ATOMIC DENGAN VALIDASI STOK EFEKTIF KETAT & ROLLBACK OTOMATIS
create or replace function update_sale_atomic(
  p_sale_id uuid,
  p_business_id uuid,
  p_user_id uuid,
  p_channel sale_channel,
  p_payment_method payment_method,
  p_total numeric(12,2),
  p_items jsonb,
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
  v_current_status text;
  v_caller_biz_id uuid;
  v_caller_branch_id uuid;
  v_caller_role text;
  v_agg record;
  v_item record;
  v_product_name text;
  v_branch_stock numeric(10,2);
  v_global_stock numeric(10,2);
  v_effective_stock numeric(10,2);
begin
  -- 1. Otorisasi Pemanggil di level database (Anti Bypass)
  if auth.uid() is null and auth.role() <> 'service_role' then
    raise exception 'Akses ditolak: Pengguna tidak terautentikasi.' using errcode = '42501';
  end if;

  if auth.uid() is not null then
    select business_id, branch_id, role
    into v_caller_biz_id, v_caller_branch_id, v_caller_role
    from profiles
    where id = auth.uid();

    if v_caller_biz_id is null or v_caller_biz_id <> p_business_id then
      raise exception 'Akses ditolak: Anda tidak memiliki wewenang pada bisnis ini.' using errcode = '42501';
    end if;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Item transaksi tidak boleh kosong.' using errcode = 'P0001';
  end if;

  -- Validasi awal kuantitas setiap elemen input sebelum menyentuh data
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as (quantity numeric(10,2))
    where quantity is null or quantity <= 0
  ) then
    raise exception 'Kuantitas item harus lebih besar dari 0.' using errcode = '22003';
  end if;

  -- 2. Kunci baris transaksi (FOR UPDATE) dan validasi isolasi tenant + status voided
  select business_id, branch_id, coalesce(status, 'completed')
  into v_current_biz_id, v_current_branch_id, v_current_status
  from sales
  where id = p_sale_id
  for update;

  if v_current_biz_id is null then
    raise exception 'Transaksi tidak ditemukan.' using errcode = 'P0002';
  end if;

  if v_current_biz_id <> p_business_id then
    raise exception 'Akses ditolak: Transaksi tidak terdaftar di bisnis Anda.' using errcode = '42501';
  end if;

  if v_current_status = 'voided' then
    raise exception 'Transaksi ini telah dibatalkan (voided) dan tidak dapat diedit.' using errcode = 'P0001';
  end if;

  if v_caller_role = 'pegawai' and v_caller_branch_id is not null and v_caller_branch_id <> v_current_branch_id then
    raise exception 'Akses ditolak: Pegawai hanya dapat mengedit transaksi di cabang sendiri.' using errcode = '42501';
  end if;

  -- 3. Update header penjualan
  update sales
  set channel = p_channel,
      payment_method = p_payment_method,
      total = p_total,
      is_edited = true,
      updated_at = now()
  where id = p_sale_id;

  -- 4. Hapus item lama -> trigger fn_restore_stock_on_delete otomatis memulihkan old_qty ke stok cabang!
  --    Setelah langkah ini, stok cabang di dalam transaksi ini bernilai: current_stock + old_qty.
  delete from sale_items
  where sale_id = p_sale_id;

  -- 5. Validasi ketat ketersediaan stok efektif per product_id (terurut demi mencegah deadlock)
  for v_agg in
    select
      product_id,
      sum(quantity)::numeric(10,2) as total_new_qty
    from jsonb_to_recordset(p_items) as (
      product_id uuid,
      quantity numeric(10,2)
    )
    group by product_id
    order by product_id
  loop
    select name, stock
    into v_product_name, v_global_stock
    from products
    where id = v_agg.product_id
      and business_id = p_business_id;

    if not found then
      raise exception 'Produk % tidak terdaftar pada bisnis Anda.', v_agg.product_id using errcode = 'P0002';
    end if;

    v_effective_stock := 0;

    if v_current_branch_id is not null then
      select stock into v_branch_stock
      from product_branch_stocks
      where product_id = v_agg.product_id
        and branch_id = v_current_branch_id
      for update;

      if found then
        v_effective_stock := greatest(coalesce(v_branch_stock, 0), 0);
      elsif exists (select 1 from product_branch_stocks where product_id = v_agg.product_id) then
        v_effective_stock := 0;
      else
        select stock into v_global_stock
        from products
        where id = v_agg.product_id
        for update;
        v_effective_stock := greatest(coalesce(v_global_stock, 0), 0);
      end if;
    else
      select stock into v_global_stock
      from products
      where id = v_agg.product_id
      for update;
      v_effective_stock := greatest(coalesce(v_global_stock, 0), 0);
    end if;

    if v_agg.total_new_qty > v_effective_stock then
      -- RAISE EXCEPTION membatalkan (rollback) seluruh perubahan pada langkah 3 & 4 secara atomik!
      raise exception 'Stok produk % tidak mencukupi. Stok tersedia maksimal: %',
        coalesce(v_product_name, 'Produk'),
        fn_format_stock_qty(v_effective_stock)
        using errcode = 'P0001';
    end if;
  end loop;

  -- 6. Masukkan item baru yang sudah tervalidasi (digabung per product_id & terurut)
  for v_item in
    select
      product_id,
      sum(quantity)::numeric(10,2) as quantity,
      max(price)::numeric(12,2) as price,
      max(cost_price)::numeric(12,2) as cost_price,
      round(sum(quantity * price), 2)::numeric(12,2) as subtotal
    from jsonb_to_recordset(p_items) as (
      product_id uuid,
      quantity numeric(10,2),
      price numeric(12,2),
      cost_price numeric(12,2),
      subtotal numeric(12,2)
    )
    group by product_id
    order by product_id
  loop
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

  -- 7. Catat jejak audit pengeditan
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
end;
$$;

revoke execute on function update_sale_atomic(uuid, uuid, uuid, sale_channel, payment_method, numeric, jsonb, jsonb, jsonb, text) from public;
grant execute on function update_sale_atomic(uuid, uuid, uuid, sale_channel, payment_method, numeric, jsonb, jsonb, jsonb, text) to authenticated, service_role;

-- 4. UNIFIKASI & PERBARUI CREATE_SALE_ATOMIC DENGAN VALIDASI STOK KETAT + INTEGRITAS HARGA + KREDIT/DP
drop function if exists create_sale_atomic(uuid, uuid, uuid, sale_channel, payment_method, numeric, jsonb, uuid, text);

create or replace function create_sale_atomic(
  p_business_id uuid,
  p_branch_id uuid,
  p_user_id uuid,
  p_channel sale_channel,
  p_payment_method payment_method,
  p_total numeric(12,2),
  p_items jsonb,
  p_idempotency_key uuid default null,
  p_invoice_number text default null,
  p_customer_id uuid default null,
  p_payment_status text default 'paid',
  p_paid_amount numeric default null,
  p_due_date date default null,
  p_notes text default null,
  p_account_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_receivable_id uuid;
  v_agg record;
  v_caller_biz_id uuid;
  v_caller_branch_id uuid;
  v_caller_role text;
  v_real_paid numeric(12,2);
  v_calc_status text;
  v_customer_name text;
  v_customer_limit numeric(12,2);
  v_current_receivables numeric(12,2);
  v_unpaid_balance numeric(12,2);
  v_product_name text;
  v_product_status text;
  v_db_selling_price numeric(12,2);
  v_db_cost_price numeric(12,2);
  v_branch_stock numeric(10,2);
  v_global_stock numeric(10,2);
  v_available_stock numeric(10,2);
  v_computed_total numeric(12,2) := 0;
begin
  -- 1. Otorisasi Pemanggil di level Database
  if auth.uid() is null and auth.role() <> 'service_role' then
    raise exception 'Akses ditolak: Pengguna tidak terautentikasi.' using errcode = '42501';
  end if;

  if auth.uid() is not null then
    select business_id, branch_id, role
    into v_caller_biz_id, v_caller_branch_id, v_caller_role
    from profiles
    where id = auth.uid();

    if v_caller_biz_id is null or v_caller_biz_id <> p_business_id then
      raise exception 'Akses ditolak: Anda tidak memiliki wewenang pada bisnis ini.' using errcode = '42501';
    end if;

    if v_caller_role = 'pegawai' and v_caller_branch_id is not null and v_caller_branch_id <> p_branch_id then
      raise exception 'Akses ditolak: Pegawai hanya dapat membuat transaksi di cabangnya sendiri.' using errcode = '42501';
    end if;
  end if;

  -- 2. Validasi Cabang
  if not exists (select 1 from branches where id = p_branch_id and business_id = p_business_id) then
    raise exception 'Cabang tidak valid atau tidak terdaftar pada bisnis Anda.' using errcode = 'P0002';
  end if;

  -- 3. Pengecekan Idempotensi lebih awal agar retry transaksi yang sudah komit tetap idempoten
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

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang belanja tidak boleh kosong.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as (quantity numeric(10,2))
    where quantity is null or quantity <= 0
  ) then
    raise exception 'Kuantitas item harus lebih besar dari 0.' using errcode = '22003';
  end if;

  -- 4. Validasi kepemilikan produk, status aktif, integritas harga resmi, & ketersediaan stok cabang (FOR UPDATE)
  for v_agg in
    select
      product_id,
      sum(quantity)::numeric(10,2) as total_qty
    from jsonb_to_recordset(p_items) as (
      product_id uuid,
      quantity numeric(10,2)
    )
    group by product_id
    order by product_id
  loop
    select name, status::text, coalesce(selling_price, 0), coalesce(cost_price, 0), stock
    into v_product_name, v_product_status, v_db_selling_price, v_db_cost_price, v_global_stock
    from products
    where id = v_agg.product_id
      and business_id = p_business_id;

    if not found then
      raise exception 'Produk % tidak terdaftar pada bisnis Anda.', v_agg.product_id using errcode = 'P0002';
    end if;

    if v_product_status <> 'aktif' then
      raise exception 'Produk "%" berstatus nonaktif dan tidak dapat dijual.', v_product_name using errcode = 'P0001';
    end if;

    select stock into v_branch_stock
    from product_branch_stocks
    where product_id = v_agg.product_id
      and branch_id = p_branch_id
    for update;

    if found then
      v_available_stock := greatest(coalesce(v_branch_stock, 0), 0);
    elsif exists (select 1 from product_branch_stocks where product_id = v_agg.product_id) then
      v_available_stock := 0;
    else
      select stock into v_global_stock
      from products
      where id = v_agg.product_id
      for update;
      v_available_stock := greatest(coalesce(v_global_stock, 0), 0);
    end if;

    if v_agg.total_qty > v_available_stock then
      raise exception 'Stok produk % tidak mencukupi. Stok tersedia maksimal: %',
        coalesce(v_product_name, 'Produk'),
        fn_format_stock_qty(v_available_stock)
        using errcode = 'P0001';
    end if;

    v_computed_total := v_computed_total + round(v_db_selling_price * v_agg.total_qty, 2);
  end loop;

  if abs(coalesce(p_total, 0) - v_computed_total) > 0.05 then
    raise exception 'Integritas harga gagal: total transaksi (%) tidak sesuai dengan total resmi (%).',
      p_total, v_computed_total
      using errcode = 'P0001';
  end if;

  -- 5. Hitung dan Validasi Status Pembayaran & Uang Muka (DP)
  v_calc_status := coalesce(lower(trim(p_payment_status)), 'paid');
  if v_calc_status not in ('paid', 'partial', 'unpaid') then
    v_calc_status := 'paid';
  end if;

  if v_calc_status = 'paid' then
    v_real_paid := v_computed_total;
  elsif v_calc_status = 'unpaid' then
    v_real_paid := 0;
  else
    v_real_paid := coalesce(p_paid_amount, 0);
    if v_real_paid <= 0 then
      v_calc_status := 'unpaid';
      v_real_paid := 0;
    elsif v_real_paid >= v_computed_total then
      v_calc_status := 'paid';
      v_real_paid := v_computed_total;
    end if;
  end if;

  v_unpaid_balance := v_computed_total - v_real_paid;

  -- 6. Validasi Penjualan Kredit & Batas Piutang Pelanggan
  if v_calc_status in ('unpaid', 'partial') then
    if p_customer_id is null then
      raise exception 'Penjualan kredit / tempo harus terkait dengan pelanggan yang teridentifikasi.' using errcode = 'P0001';
    end if;

    select name, coalesce(receivable_limit, 0)
    into v_customer_name, v_customer_limit
    from customers
    where id = p_customer_id and business_id = p_business_id;

    if not found then
      raise exception 'Pelanggan tidak valid atau tidak terdaftar pada bisnis Anda.' using errcode = 'P0002';
    end if;

    if v_customer_limit > 0 then
      select coalesce(sum(total_amount - paid_amount), 0)
      into v_current_receivables
      from receivables
      where business_id = p_business_id
        and customer_id = p_customer_id
        and status <> 'paid';

      if (v_current_receivables + v_unpaid_balance) > v_customer_limit then
        raise exception 'Transaksi ditolak: Total piutang pelanggan ini (Rp %) akan melebihi batas kredit maksimal (Rp %).',
          (v_current_receivables + v_unpaid_balance), v_customer_limit
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- 7. Insert Header Penjualan
  insert into sales (
    business_id,
    branch_id,
    user_id,
    channel,
    payment_method,
    total,
    idempotency_key,
    invoice_number,
    customer_id,
    status,
    payment_status,
    paid_amount,
    due_date,
    notes
  ) values (
    p_business_id,
    p_branch_id,
    p_user_id,
    p_channel,
    p_payment_method,
    v_computed_total,
    p_idempotency_key,
    p_invoice_number,
    p_customer_id,
    'completed',
    v_calc_status,
    v_real_paid,
    p_due_date,
    p_notes
  ) returning id into v_sale_id;

  -- 8. Insert Item-Item Penjualan (terurut & menggunakan harga/HPP resmi DB; stok dipotong oleh trg_deduct_stock_on_sale)
  for v_agg in
    select
      product_id,
      sum(quantity)::numeric(10,2) as total_qty
    from jsonb_to_recordset(p_items) as (
      product_id uuid,
      quantity numeric(10,2)
    )
    group by product_id
    order by product_id
  loop
    select coalesce(selling_price, 0), coalesce(cost_price, 0)
    into v_db_selling_price, v_db_cost_price
    from products
    where id = v_agg.product_id and business_id = p_business_id;

    insert into sale_items (
      sale_id,
      product_id,
      quantity,
      price,
      cost_price,
      subtotal
    ) values (
      v_sale_id,
      v_agg.product_id,
      v_agg.total_qty,
      v_db_selling_price,
      v_db_cost_price,
      round(v_db_selling_price * v_agg.total_qty, 2)
    );
  end loop;

  -- 9. Catat Piutang Usaha jika belum lunas
  if v_calc_status in ('unpaid', 'partial') and v_unpaid_balance > 0 then
    insert into receivables (
      business_id,
      customer_id,
      debtor_name,
      sale_id,
      title,
      total_amount,
      paid_amount,
      due_date,
      status,
      notes
    ) values (
      p_business_id,
      p_customer_id,
      v_customer_name,
      v_sale_id,
      'Penjualan Bon/Kredit #' || coalesce(p_invoice_number, left(v_sale_id::text, 8)),
      v_computed_total,
      v_real_paid,
      p_due_date,
      v_calc_status,
      coalesce(p_notes, 'Penjualan kasir POS termin kredit')
    ) returning id into v_receivable_id;
  end if;

  -- 10. Catat Riwayat Pembayaran Awal / DP jika v_real_paid > 0
  if v_real_paid > 0 then
    insert into sale_payments (
      business_id,
      branch_id,
      sale_id,
      receivable_id,
      payment_number,
      amount,
      payment_method,
      account_id,
      payment_date,
      recorded_by,
      idempotency_key,
      notes
    ) values (
      p_business_id,
      p_branch_id,
      v_sale_id,
      v_receivable_id,
      'PAY/' || to_char(current_date, 'YYYYMMDD') || '/' || floor(1000 + random() * 9000)::text,
      v_real_paid,
      p_payment_method,
      p_account_id,
      current_date,
      p_user_id,
      p_idempotency_key,
      case when v_calc_status = 'partial' then 'Uang muka (DP) penjualan' else 'Pembayaran lunas kasir' end
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'receivable_id', v_receivable_id,
    'payment_status', v_calc_status,
    'paid_amount', v_real_paid,
    'unpaid_balance', v_unpaid_balance,
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

revoke execute on function create_sale_atomic(uuid, uuid, uuid, sale_channel, payment_method, numeric, jsonb, uuid, text, uuid, text, numeric, date, text, uuid) from public;
grant execute on function create_sale_atomic(uuid, uuid, uuid, sale_channel, payment_method, numeric, jsonb, uuid, text, uuid, text, numeric, date, text, uuid) to authenticated, service_role;

-- 5. KEBERSIHAN OVERLOAD & HARDENING KEAMANAN LINTAS MIGRASI (0023-0031)
--    Pastikan pada environment Staging yang telah menerapkan 0023-0032 sebelumnya:
--    a) Overload lama 7-parameter record_purchase_with_stock_atomic dihapus agar bebas konflik PGRST203/42725.
--    b) Izin EXECUTE dari PUBLIC pada RPC inventaris & pembelian dicabut (hanya authenticated & service_role).
--    c) Seluruh fungsi SECURITY DEFINER modul keuangan memiliki search_path = public yang terkunci.
drop function if exists record_purchase_with_stock_atomic(uuid, uuid, uuid, text, date, jsonb, text);

revoke execute on function record_purchase_with_stock_atomic(uuid, uuid, uuid, text, date, jsonb, text, text, text, uuid, date) from public;
grant execute on function record_purchase_with_stock_atomic(uuid, uuid, uuid, text, date, jsonb, text, text, text, uuid, date) to authenticated, service_role;

revoke execute on function record_inventory_mutation_atomic(uuid, uuid, uuid, text, numeric, text, text, text) from public;
grant execute on function record_inventory_mutation_atomic(uuid, uuid, uuid, text, numeric, text, text, text) to authenticated, service_role;

alter function fn_seed_default_financial_accounts(uuid) set search_path = public;
alter function fn_on_business_created_seed_accounts() set search_path = public;
alter function fn_sync_sale_to_financial_account() set search_path = public;
alter function fn_revert_sale_from_financial_account() set search_path = public;

commit;

