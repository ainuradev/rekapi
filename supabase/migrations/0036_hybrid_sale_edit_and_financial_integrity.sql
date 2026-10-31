-- ================================================================
-- Migration 0036: Hybrid Sale Edit, Server-Side Pricing, & Financial Integrity (Tahap 2)
-- 1. Tambah kolom account_id pada tabel sales untuk sinkronisasi akun kas/bank
-- 2. Perbarui trigger fn_sync_sale_to_financial_account agar patuh pada sales.account_id
-- 3. Perbarui RPC create_sale_atomic agar konsisten menetapkan account_id kas vs bank
-- 4. Perbarui RPC update_sale_atomic:
--    a. Tolak edit jika terdapat cicilan lanjutan (count(sale_payments) > 1)
--    b. Wajib ambil selling_price & cost_price resmi dari tabel products
--    c. Rekonsiliasi mutasi kas, sale_payments, dan piutang secara atomik
--    d. Ikat edited_by ke auth.uid() & validasi cabang pegawai
-- 5. Perbarui RPC void_sale_atomic agar simetris membalik akun kas/bank yang benar
-- ================================================================

-- ─── 1. TABEL SALES: Tambah kolom account_id ──────────────────────────────────
alter table public.sales
  add column if not exists account_id uuid references public.financial_accounts(id) on delete set null;

create index if not exists idx_sales_account_id on public.sales (account_id);


-- ─── 2. TRIGGER SYNC SALE: Patuh pada sales.account_id ───────────────────────
create or replace function public.fn_sync_sale_to_financial_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_is_cash boolean;
  v_pm text;
  v_real_cash_amount numeric(12,2);
begin
  -- Hitung penerimaan uang nyata pada transaksi ini (hanya sebesar paid_amount)
  v_real_cash_amount := coalesce(new.paid_amount, 0);

  -- Jika penjualan kredit tanpa DP (paid_amount = 0 atau payment_status = 'unpaid'),
  -- atau transaksi di-void, JANGAN membuat mutasi kas!
  if v_real_cash_amount <= 0 or new.status = 'voided' then
    return new;
  end if;

  -- 1. Utamakan akun yang eksplisit tercatat pada sales.account_id
  v_account_id := new.account_id;

  -- 2. Jika account_id belum terisi, tentukan akun kas/bank default berdasarkan payment_method
  if v_account_id is null then
    v_pm := lower(coalesce(new.payment_method::text, ''));
    v_is_cash := (v_pm = 'cash' or v_pm = 'tunai');

    if v_is_cash then
      select id into v_account_id
      from financial_accounts
      where business_id = new.business_id
        and type = 'cash'
        and status = 'active'
      order by is_default_cash desc, created_at asc
      limit 1;
    else
      select id into v_account_id
      from financial_accounts
      where business_id = new.business_id
        and type in ('bank', 'e_wallet')
        and status = 'active'
      order by is_default_bank desc, created_at asc
      limit 1;
    end if;

    if v_account_id is null then
      select id into v_account_id
      from financial_accounts
      where business_id = new.business_id
        and status = 'active'
      order by created_at asc
      limit 1;
    end if;
  end if;

  if v_account_id is not null then
    -- Tambah saldo berjalan HANYA sebesar uang riil yang diterima
    update financial_accounts
    set current_balance = current_balance + v_real_cash_amount,
        updated_at = now()
    where id = v_account_id;

    -- Catat jurnal mutasi kas masuk
    insert into financial_transactions (
      business_id,
      account_id,
      type,
      category,
      amount,
      reference_id,
      description,
      transaction_date
    ) values (
      new.business_id,
      v_account_id,
      'income',
      'sale',
      v_real_cash_amount,
      new.id,
      case 
        when new.payment_status = 'partial' then 'Penerimaan Uang Muka (DP) Penjualan #' || coalesce(new.invoice_number, left(new.id::text, 8))
        else 'Penjualan Kasir #' || coalesce(new.invoice_number, left(new.id::text, 8))
      end,
      coalesce(new.transaction_date::date, current_date)
    );
  end if;

  return new;
end;
$$;


-- ─── 3. PERBARUI CREATE_SALE_ATOMIC (Sinkronisasi account_id Kas vs Bank) ────
create or replace function public.create_sale_atomic(
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
  v_resolved_account_id uuid := null;
  v_pm text;
  v_is_cash boolean;
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

  -- 3. Pengecekan Idempotensi lebih awal
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

  -- 4. Validasi kepemilikan produk, status aktif, integritas harga resmi, & ketersediaan stok cabang
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

  -- 6. Resolusi akun kas vs bank yang valid & konsisten
  if v_real_paid > 0 then
    if p_account_id is not null then
      select id into v_resolved_account_id
      from financial_accounts
      where id = p_account_id and business_id = p_business_id and status = 'active';
    end if;

    if v_resolved_account_id is null then
      v_pm := lower(coalesce(p_payment_method::text, ''));
      v_is_cash := (v_pm = 'cash' or v_pm = 'tunai');

      if v_is_cash then
        select id into v_resolved_account_id
        from financial_accounts
        where business_id = p_business_id and type = 'cash' and status = 'active'
        order by is_default_cash desc, created_at asc
        limit 1;
      else
        select id into v_resolved_account_id
        from financial_accounts
        where business_id = p_business_id and type in ('bank', 'e_wallet') and status = 'active'
        order by is_default_bank desc, created_at asc
        limit 1;
      end if;

      if v_resolved_account_id is null then
        select id into v_resolved_account_id
        from financial_accounts
        where business_id = p_business_id and status = 'active'
        order by created_at asc
        limit 1;
      end if;
    end if;
  end if;

  -- 7. Validasi Penjualan Kredit & Batas Piutang Pelanggan
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

  -- 8. Insert Header Penjualan (termasuk account_id yang tersinkronisasi)
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
    notes,
    account_id
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
    p_notes,
    v_resolved_account_id
  ) returning id into v_sale_id;

  -- 9. Insert Item-Item Penjualan (snapshot HPP & harga jual resmi DB)
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

  -- 10. Catat Piutang Usaha jika belum lunas
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

  -- 11. Catat Riwayat Pembayaran Awal / DP jika v_real_paid > 0
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
      v_resolved_account_id,
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
    'account_id', v_resolved_account_id,
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

revoke execute on function public.create_sale_atomic(uuid, uuid, uuid, sale_channel, payment_method, numeric, jsonb, uuid, text, uuid, text, numeric, date, text, uuid) from public;
grant execute on function public.create_sale_atomic(uuid, uuid, uuid, sale_channel, payment_method, numeric, jsonb, uuid, text, uuid, text, numeric, date, text, uuid) to authenticated, service_role;


-- ─── 4. PERBARUI UPDATE_SALE_ATOMIC (Hibrida, Server-Side Pricing, & Mutasi) ─
create or replace function public.update_sale_atomic(
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
  v_old_sale record;
  v_caller_biz_id uuid;
  v_caller_branch_id uuid;
  v_caller_role text;
  v_caller_id uuid;
  v_payment_count int;
  v_subsequent_payment_count int;
  v_agg record;
  v_product_name text;
  v_db_selling_price numeric(12,2);
  v_db_cost_price numeric(12,2);
  v_branch_stock numeric(10,2);
  v_global_stock numeric(10,2);
  v_effective_stock numeric(10,2);
  v_computed_total numeric(12,2) := 0;
  v_diff_total numeric(12,2);
  v_target_account_id uuid;
  v_new_payment_status text;
  v_new_paid_amount numeric(12,2);
  v_new_unpaid numeric(12,2);
  v_customer_limit numeric(12,2);
  v_current_receivables numeric(12,2);
  v_single_payment record;
begin
  -- 1. Otorisasi Pemanggil di level Database
  if auth.uid() is null and auth.role() <> 'service_role' then
    raise exception 'Akses ditolak: Pengguna tidak terautentikasi.' using errcode = '42501';
  end if;

  v_caller_id := coalesce(auth.uid(), p_user_id);

  if auth.uid() is not null then
    select business_id, branch_id, role
    into v_caller_biz_id, v_caller_branch_id, v_caller_role
    from profiles
    where id = auth.uid();

    if v_caller_biz_id is null or v_caller_biz_id <> p_business_id then
      raise exception 'Akses ditolak: Anda tidak memiliki wewenang pada bisnis ini.' using errcode = '42501';
    end if;
  else
    select business_id, branch_id, role
    into v_caller_biz_id, v_caller_branch_id, v_caller_role
    from profiles
    where id = p_user_id;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Item transaksi tidak boleh kosong.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as (quantity numeric(10,2))
    where quantity is null or quantity <= 0
  ) then
    raise exception 'Kuantitas item harus lebih besar dari 0.' using errcode = '22003';
  end if;

  -- 2. Kunci baris transaksi (FOR UPDATE) & validasi tenant, status voided, dan cabang
  select id, business_id, branch_id, channel, payment_method, total, coalesce(paid_amount, 0) as paid_amount,
         payment_status, status, customer_id, invoice_number, account_id
  into v_old_sale
  from sales
  where id = p_sale_id
  for update;

  if v_old_sale.id is null then
    raise exception 'Transaksi tidak ditemukan.' using errcode = 'P0002';
  end if;

  if v_old_sale.business_id <> p_business_id then
    raise exception 'Akses ditolak: Transaksi tidak terdaftar di bisnis Anda.' using errcode = '42501';
  end if;

  if v_old_sale.status = 'voided' then
    raise exception 'Transaksi ini telah dibatalkan (voided) dan tidak dapat diedit.' using errcode = 'P0001';
  end if;

  if v_caller_role = 'pegawai' and v_caller_branch_id is not null and v_caller_branch_id <> v_old_sale.branch_id then
    raise exception 'Akses ditolak: Pegawai hanya dapat mengedit transaksi di cabang sendiri.' using errcode = '42501';
  end if;

  -- 3. KEBIJAKAN EDIT HIBRIDA: Cek apakah ada riwayat pembayaran cicilan lanjutan
  select count(*) into v_payment_count
  from sale_payments
  where sale_id = p_sale_id;

  -- Jika transaksi kredit dan memiliki lebih dari 1 riwayat pembayaran (sudah pernah dicicil lanjutan)
  if v_payment_count > 1 then
    raise exception 'Transaksi ini telah memiliki % kali riwayat pembayaran cicilan bertahap dan tidak dapat diedit langsung. Silakan gunakan fitur Batalkan (Void) dan buat transaksi baru yang sesuai.',
      v_payment_count using errcode = 'P0001';
  end if;

  -- Jika ada 1 pembayaran tapi itu pembayaran pelunasan piutang lanjutan (bukan DP awal kasir)
  if v_old_sale.payment_status in ('unpaid', 'partial') and v_payment_count = 1 then
    select count(*) into v_subsequent_payment_count
    from sale_payments
    where sale_id = p_sale_id
      and notes not ilike '%DP%'
      and notes not ilike '%Uang muka%'
      and notes not ilike '%kasir%';

    if v_subsequent_payment_count > 0 then
      raise exception 'Transaksi ini telah memiliki pembayaran cicilan piutang lanjutan dan tidak dapat diedit langsung. Silakan gunakan fitur Batalkan (Void) dan buat transaksi baru yang sesuai.' using errcode = 'P0001';
    end if;
  end if;

  -- 4. Hapus item lama -> trigger fn_restore_stock_on_delete otomatis memulihkan old_qty ke stok cabang
  delete from sale_items
  where sale_id = p_sale_id;

  -- 5. Validasi ketersediaan stok cabang & hitung total resmi menggunakan harga & HPP database
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
    select name, coalesce(selling_price, 0), coalesce(cost_price, 0), stock
    into v_product_name, v_db_selling_price, v_db_cost_price, v_global_stock
    from products
    where id = v_agg.product_id
      and business_id = p_business_id;

    if not found then
      raise exception 'Produk % tidak terdaftar pada bisnis Anda.', v_agg.product_id using errcode = 'P0002';
    end if;

    v_effective_stock := 0;

    if v_old_sale.branch_id is not null then
      select stock into v_branch_stock
      from product_branch_stocks
      where product_id = v_agg.product_id
        and branch_id = v_old_sale.branch_id
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
      raise exception 'Stok produk % tidak mencukupi. Stok tersedia maksimal: %',
        coalesce(v_product_name, 'Produk'),
        fn_format_stock_qty(v_effective_stock)
        using errcode = 'P0001';
    end if;

    v_computed_total := v_computed_total + round(v_db_selling_price * v_agg.total_new_qty, 2);
  end loop;

  -- 6. Masukkan item baru dengan HARGA JUAL & HPP RESMI DARI DATABASE (Anti Tampering)
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
    select coalesce(selling_price, 0), coalesce(cost_price, 0)
    into v_db_selling_price, v_db_cost_price
    from products
    where id = v_agg.product_id
      and business_id = p_business_id;

    insert into sale_items (
      sale_id,
      product_id,
      quantity,
      price,
      cost_price,
      subtotal
    ) values (
      p_sale_id,
      v_agg.product_id,
      v_agg.total_new_qty,
      v_db_selling_price,
      v_db_cost_price,
      round(v_db_selling_price * v_agg.total_new_qty, 2)
    );
  end loop;

  v_diff_total := v_computed_total - v_old_sale.total;

  -- 7. REKONSILIASI KAS, PIUTANG, DAN SALE_PAYMENTS SECARA ATOMIK
  if v_old_sale.payment_status = 'paid' then
    -- KASUS A: Transaksi Lunas Langsung (Tunai / QRIS / Transfer)
    v_new_payment_status := 'paid';
    v_new_paid_amount := v_computed_total;

    -- Tentukan akun kas/bank asal
    select account_id into v_target_account_id
    from sale_payments
    where sale_id = p_sale_id
    limit 1;

    if v_target_account_id is null then
      v_target_account_id := v_old_sale.account_id;
    end if;

    if v_target_account_id is null then
      select account_id into v_target_account_id
      from financial_transactions
      where reference_id = p_sale_id and category = 'sale'
      limit 1;
    end if;

    -- Jika ada selisih nilai transaksi lunas, sesuaikan saldo akun kas/bank
    if v_diff_total <> 0 and v_target_account_id is not null then
      update financial_accounts
      set current_balance = current_balance + v_diff_total,
          updated_at = now()
      where id = v_target_account_id
        and business_id = p_business_id;

      -- Sinkronkan catatan transaksi jurnal
      update financial_transactions
      set amount = v_computed_total,
          description = 'Penjualan Kasir #' || coalesce(v_old_sale.invoice_number, left(p_sale_id::text, 8)) || ' (Disesuaikan)'
      where reference_id = p_sale_id and category = 'sale';

      -- Sinkronkan catatan sale_payments
      update sale_payments
      set amount = v_computed_total
      where sale_id = p_sale_id;
    end if;

    update sales
    set total = v_computed_total,
        paid_amount = v_new_paid_amount,
        payment_status = v_new_payment_status,
        channel = p_channel,
        payment_method = p_payment_method,
        is_edited = true,
        updated_at = now()
    where id = p_sale_id;

  else
    -- KASUS B: Transaksi Kredit / Tempo (Belum Lunas / Partial DP)
    v_new_paid_amount := v_old_sale.paid_amount;
    v_new_unpaid := greatest(0, v_computed_total - v_new_paid_amount);

    if v_computed_total <= v_new_paid_amount then
      v_new_payment_status := 'paid';
      v_new_unpaid := 0;
    elsif v_new_paid_amount > 0 then
      v_new_payment_status := 'partial';
    else
      v_new_payment_status := 'unpaid';
    end if;

    -- Validasi limit piutang jika piutang bertambah
    if v_diff_total > 0 and v_old_sale.customer_id is not null then
      select coalesce(receivable_limit, 0)
      into v_customer_limit
      from customers
      where id = v_old_sale.customer_id and business_id = p_business_id;

      if v_customer_limit > 0 then
        select coalesce(sum(total_amount - paid_amount), 0)
        into v_current_receivables
        from receivables
        where business_id = p_business_id
          and customer_id = v_old_sale.customer_id
          and status <> 'paid'
          and sale_id <> p_sale_id;

        if (v_current_receivables + v_new_unpaid) > v_customer_limit then
          raise exception 'Penyesuaian transaksi ditolak: Total piutang pelanggan ini akan melebihi batas kredit maksimal (Rp %).',
            v_customer_limit using errcode = 'P0001';
        end if;
      end if;
    end if;

    -- Perbarui kartu piutang
    update receivables
    set total_amount = v_computed_total,
        status = v_new_payment_status,
        updated_at = now()
    where sale_id = p_sale_id and business_id = p_business_id;

    update sales
    set total = v_computed_total,
        paid_amount = v_new_paid_amount,
        payment_status = v_new_payment_status,
        channel = p_channel,
        payment_method = p_payment_method,
        is_edited = true,
        updated_at = now()
    where id = p_sale_id;
  end if;

  -- 8. Catat jejak audit pengeditan (edited_by diikat ke auth.uid())
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
    v_caller_id,
    p_old_data,
    p_new_data,
    p_reason
  );

  return jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'new_total', v_computed_total,
    'paid_amount', v_new_paid_amount,
    'payment_status', v_new_payment_status
  );
end;
$$;

revoke execute on function public.update_sale_atomic(uuid, uuid, uuid, sale_channel, payment_method, numeric, jsonb, jsonb, jsonb, text) from public;
grant execute on function public.update_sale_atomic(uuid, uuid, uuid, sale_channel, payment_method, numeric, jsonb, jsonb, jsonb, text) to authenticated, service_role;


-- ─── 5. PERBARUI VOID_SALE_ATOMIC (Simetris Pembalikan Kas vs Bank) ──────────
create or replace function public.void_sale_atomic(
  p_business_id uuid,
  p_sale_id uuid,
  p_user_id uuid,
  p_reason text default 'Pembatalan transaksi oleh pengguna'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale record;
  v_item record;
  v_payment record;
  v_ft record;
  v_caller_id uuid;
  v_caller_role text;
  v_branch_restore numeric(10,2);
  v_global_restore numeric(10,2);
  v_has_branch_row boolean;
  v_reversed_payment_ids uuid[] := array[]::uuid[];
begin
  if auth.uid() is null and auth.role() <> 'service_role' then
    raise exception 'Akses ditolak: Pengguna tidak terautentikasi.' using errcode = '42501';
  end if;

  v_caller_id := coalesce(auth.uid(), p_user_id);

  select role into v_caller_role
  from profiles
  where id = v_caller_id and business_id = p_business_id;

  if v_caller_role is null then
    raise exception 'Pengguna tidak terdaftar pada bisnis ini.' using errcode = '42501';
  end if;

  if v_caller_role <> 'owner' then
    raise exception 'Akses ditolak: Hanya pemilik bisnis (Owner) yang berhak membatalkan (void) transaksi.' using errcode = '42501';
  end if;

  select id, business_id, branch_id, channel, payment_method, total, coalesce(paid_amount, 0) as paid_amount,
         status, invoice_number, transaction_date, account_id
  into v_sale
  from sales
  where id = p_sale_id and business_id = p_business_id
  for update;

  if not found then
    raise exception 'Transaksi penjualan tidak ditemukan.' using errcode = 'P0002';
  end if;

  if v_sale.status = 'voided' then
    raise exception 'Transaksi ini sudah pernah dibatalkan (voided) sebelumnya.' using errcode = 'P0001';
  end if;

  -- 1. Pulihkan stok barang ke cabang / induk
  for v_item in
    select id, product_id, quantity, branch_stock_deducted, global_stock_deducted
    from sale_items
    where sale_id = p_sale_id
    order by product_id
  loop
    v_branch_restore := greatest(coalesce(v_item.branch_stock_deducted, v_item.quantity), 0);
    v_global_restore := greatest(coalesce(v_item.global_stock_deducted, v_item.quantity), 0);
    v_has_branch_row := false;

    if v_sale.branch_id is not null then
      perform 1
      from product_branch_stocks
      where product_id = v_item.product_id
        and branch_id = v_sale.branch_id
      for update;

      if found then
        v_has_branch_row := true;
        if v_branch_restore > 0 then
          update product_branch_stocks
          set stock = stock + v_branch_restore,
              updated_at = now()
          where product_id = v_item.product_id
            and branch_id = v_sale.branch_id;
        end if;
      end if;
    end if;

    if not v_has_branch_row and v_global_restore > 0 then
      update products
      set stock = stock + v_global_restore,
          updated_at = now()
      where id = v_item.product_id;
    end if;
  end loop;

  update sale_items
  set branch_stock_deducted = 0,
      global_stock_deducted = 0
  where sale_id = p_sale_id;

  -- 2. Balikkan Saldo Kas / Bank dari Riwayat Pembayaran (sale_payments)
  for v_payment in
    select id, account_id, amount, payment_number
    from sale_payments
    where sale_id = p_sale_id
  loop
    if v_payment.account_id is not null then
      update financial_accounts
      set current_balance = current_balance - v_payment.amount,
          updated_at = now()
      where id = v_payment.account_id
        and business_id = p_business_id;

      insert into financial_transactions (
        business_id,
        account_id,
        type,
        category,
        amount,
        reference_id,
        description,
        transaction_date
      ) values (
        p_business_id,
        v_payment.account_id,
        'expense',
        'adjustment',
        v_payment.amount,
        v_payment.id,
        'Pembalikan Kas Pembatalan (Void) #' || coalesce(v_sale.invoice_number, left(p_sale_id::text, 8)) || ' - ' || v_payment.payment_number,
        current_date
      );

      v_reversed_payment_ids := array_append(v_reversed_payment_ids, v_payment.id);
    end if;
  end loop;

  -- Fallback untuk transaksi penjualan lama yang belum tercatat di sale_payments
  -- tapi memiliki mutasi kas di financial_transactions
  if cardinality(v_reversed_payment_ids) = 0 and v_sale.paid_amount > 0 then
    for v_ft in
      select id, account_id, amount
      from financial_transactions
      where reference_id = p_sale_id
        and category = 'sale'
        and type = 'income'
    loop
      update financial_accounts
      set current_balance = current_balance - v_ft.amount,
          updated_at = now()
      where id = v_ft.account_id
        and business_id = p_business_id;

      insert into financial_transactions (
        business_id,
        account_id,
        type,
        category,
        amount,
        reference_id,
        description,
        transaction_date
      ) values (
        p_business_id,
        v_ft.account_id,
        'expense',
        'adjustment',
        v_ft.amount,
        p_sale_id,
        'Pembalikan Kas Pembatalan (Void) #' || coalesce(v_sale.invoice_number, left(p_sale_id::text, 8)),
        current_date
      );
    end loop;
  end if;

  -- 3. Batalkan Piutang Terkait
  update receivables
  set status = 'paid',
      notes = coalesce(notes, '') || ' [Dibatalkan / Void: ' || coalesce(p_reason, 'Transaksi dibatalkan') || ']',
      updated_at = now()
  where sale_id = p_sale_id and business_id = p_business_id;

  -- 4. Tandai Transaksi sebagai Voided
  update sales
  set status = 'voided',
      voided_at = now(),
      voided_by = v_caller_id,
      void_reason = p_reason,
      updated_at = now()
  where id = p_sale_id;

  -- 5. Catat ke Audit Trail Log
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
    v_caller_id,
    jsonb_build_object(
      'action', 'VOID',
      'invoice_number', v_sale.invoice_number,
      'total', v_sale.total,
      'paid_amount', v_sale.paid_amount,
      'status', 'completed'
    ),
    jsonb_build_object(
      'action', 'VOID',
      'status', 'voided',
      'voided_at', now(),
      'voided_by', v_caller_id,
      'voided_by_role', v_caller_role
    ),
    p_reason
  );

  return jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'status', 'voided'
  );
end;
$$;

revoke execute on function public.void_sale_atomic(uuid, uuid, uuid, text) from public;
grant execute on function public.void_sale_atomic(uuid, uuid, uuid, text) to authenticated, service_role;

