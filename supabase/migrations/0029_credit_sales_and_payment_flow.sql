-- ================================================================
-- Migration 0029: Credit Sales, Partial Payments, Receivables & Void Flow
-- Menyelaraskan Penjualan Kredit, Pembayaran Parsial, Piutang, Kas, Stok,
-- dan Jejak Audit Sesuai Standar POS & Akuntansi UMKM
-- ================================================================

-- 1. PERLUASAN TABEL SALES: Status Penjualan & Status Pembayaran
-- Status Penjualan: completed, voided
-- Status Pembayaran: unpaid, partial, paid
alter table sales
  add column if not exists status text not null default 'completed' check (status in ('completed', 'voided')),
  add column if not exists payment_status text not null default 'paid' check (payment_status in ('unpaid', 'partial', 'paid')),
  add column if not exists paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  add column if not exists due_date date,
  add column if not exists notes text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references profiles(id),
  add column if not exists void_reason text;

create index if not exists idx_sales_status on sales (business_id, status);
create index if not exists idx_sales_payment_status on sales (business_id, payment_status);
create index if not exists idx_sales_due_date on sales (business_id, due_date);

-- Backfill data historis: tandai penjualan yang sudah ada sebagai lunas (paid) dan total terbayar = total tagihan
update sales
set paid_amount = total,
    payment_status = 'paid',
    status = 'completed'
where paid_amount = 0 and (payment_status is null or payment_status = 'paid') and status = 'completed';

-- 2. TABEL BARU: SALE_PAYMENTS (Riwayat Pembayaran Parsial & Pelunasan Transaksi POS)
create table if not exists sale_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete restrict,
  sale_id uuid not null references sales(id) on delete cascade,
  receivable_id uuid references receivables(id) on delete set null,
  payment_number text not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method payment_method not null default 'cash',
  account_id uuid references financial_accounts(id) on delete set null,
  payment_date date not null default current_date,
  recorded_by uuid not null references profiles(id),
  idempotency_key uuid,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_sale_payments_business on sale_payments (business_id);
create index if not exists idx_sale_payments_branch on sale_payments (branch_id);
create index if not exists idx_sale_payments_sale on sale_payments (sale_id);
create index if not exists idx_sale_payments_receivable on sale_payments (receivable_id);
create index if not exists idx_sale_payments_date on sale_payments (business_id, payment_date);

-- Unique constraint idempotency pembayaran agar tidak terjadi double-payment akibat klik berulang
create unique index if not exists uq_sale_payments_idempotency
  on sale_payments (business_id, idempotency_key)
  where idempotency_key is not null;

-- Row Level Security (RLS) untuk sale_payments
alter table sale_payments enable row level security;

drop policy if exists "sale_payments_select_policy" on sale_payments;
create policy "sale_payments_select_policy" on sale_payments
  for select using (business_id = auth_business_id());

drop policy if exists "sale_payments_insert_policy" on sale_payments;
create policy "sale_payments_insert_policy" on sale_payments
  for insert with check (business_id = auth_business_id());

-- 3. PERBAIKAN TRIGGER SINKRONISASI KAS: JANGAN BUAT PENERIMAAN KAS FIKTIF DARI PENJUALAN KREDIT!
-- Trigger pada sales hanya menambah kas sebesar uang nyata yang dibayarkan saat penjualan (paid_amount > 0).
-- Jika penjualan kredit tanpa DP (unpaid / paid_amount = 0), saldo kas/bank TIDAK bertambah!
create or replace function fn_sync_sale_to_financial_account()
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
  -- JANGAN membuat penerimaan kas fiktif!
  if v_real_cash_amount <= 0 or new.status = 'voided' then
    return new;
  end if;

  v_pm := lower(coalesce(new.payment_method::text, ''));
  v_is_cash := (v_pm = 'cash' or v_pm = 'tunai');

  -- Cari akun kas/bank yang sesuai
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

  if v_account_id is not null then
    -- Tambah saldo berjalan HANYA sebesar uang riil yang diterima
    update financial_accounts
    set current_balance = current_balance + v_real_cash_amount,
        updated_at = now()
    where id = v_account_id;

    -- Catat jurnal transaksi mutasi kas
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

-- 4. UPDATE STORED PROCEDURE: CREATE_SALE_ATOMIC
-- Mendukung penjualan kredit, DP, identifikasi pelanggan, cek limit piutang, dan pencatatan piutang
create or replace function create_sale_atomic(
  p_business_id uuid,
  p_branch_id uuid,
  p_user_id uuid,
  p_channel sale_channel,
  p_payment_method payment_method,
  p_total numeric(12,2),
  p_items jsonb, -- Array of {product_id: uuid, quantity: numeric, price: numeric, cost_price: numeric, subtotal: numeric}
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
  v_item record;
  v_caller_biz_id uuid;
  v_caller_branch_id uuid;
  v_caller_role text;
  v_real_paid numeric(12,2);
  v_calc_status text;
  v_customer_name text;
  v_customer_limit numeric(12,2);
  v_current_receivables numeric(12,2);
  v_unpaid_balance numeric(12,2);
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

  -- 3. Pengecekan Idempotensi: jika idempotency_key sudah terdaftar, kembalikan transaksi yang ada
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

  -- 4. Hitung dan Validasi Status Pembayaran & Uang Muka (DP)
  v_calc_status := coalesce(lower(trim(p_payment_status)), 'paid');
  if v_calc_status not in ('paid', 'partial', 'unpaid') then
    v_calc_status := 'paid';
  end if;

  if v_calc_status = 'paid' then
    v_real_paid := p_total;
  elsif v_calc_status = 'unpaid' then
    v_real_paid := 0;
  else -- partial
    v_real_paid := coalesce(p_paid_amount, 0);
    if v_real_paid <= 0 then
      v_calc_status := 'unpaid';
      v_real_paid := 0;
    elsif v_real_paid >= p_total then
      v_calc_status := 'paid';
      v_real_paid := p_total;
    end if;
  end if;

  v_unpaid_balance := p_total - v_real_paid;

  -- 5. ATURAN 3.B.1: Penjualan kredit/tempo WAJIB terhubung ke pelanggan terdaftar
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

    -- Validasi Limit Piutang Pelanggan (jika limit > 0)
    if v_customer_limit > 0 then
      select coalesce(sum(total_amount - paid_amount), 0)
      into v_current_receivables
      from receivables
      where business_id = p_business_id
        and customer_id = p_customer_id
        and status <> 'paid';

      if (v_current_receivables + v_unpaid_balance) > v_customer_limit then
        raise exception 'Transaksi ditolak: Total piutang pelanggan ini (Rp %) akan melebihi batas kredit maksimal (Rp %).',
          (v_current_receivables + v_unpaid_balance), v_customer_limit using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- 6. Insert Header Penjualan
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
    p_total,
    p_idempotency_key,
    p_invoice_number,
    p_customer_id,
    'completed',
    v_calc_status,
    v_real_paid,
    p_due_date,
    p_notes
  ) returning id into v_sale_id;

  -- 7. Insert Item-Item Penjualan (Stok akan otomatis terpotong via trigger fn_deduct_stock_on_sale)
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

  -- 8. Catat Piutang Usaha jika ada sisa tagihan belum lunas
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
      p_total,
      v_real_paid,
      p_due_date,
      v_calc_status,
      coalesce(p_notes, 'Penjualan kasir POS termin kredit')
    ) returning id into v_receivable_id;
  end if;

  -- 9. Catat Riwayat Pembayaran Awal / DP jika ada uang yang dibayarkan
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
    raise exception 'Gagal menyimpan transaksi atomik: duplikasi constraint terdeteksi.';
  when others then
    raise exception 'Gagal menyimpan transaksi atomik: %', SQLERRM;
end;
$$;

revoke execute on function create_sale_atomic(uuid, uuid, uuid, sale_channel, payment_method, numeric, jsonb, uuid, text, uuid, text, numeric, date, text, uuid) from public;
grant execute on function create_sale_atomic(uuid, uuid, uuid, sale_channel, payment_method, numeric, jsonb, uuid, text, uuid, text, numeric, date, text, uuid) to authenticated, service_role;

-- 5. STORED PROCEDURE: RECORD_SALE_PAYMENT_ATOMIC (Pelunasan & Cicilan Piutang POS)
create or replace function record_sale_payment_atomic(
  p_business_id uuid,
  p_sale_id uuid,
  p_amount numeric(12,2),
  p_payment_method payment_method,
  p_account_id uuid,
  p_recorded_by uuid,
  p_payment_date date default current_date,
  p_notes text default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale record;
  v_rec record;
  v_branch_id uuid;
  v_new_paid numeric(12,2);
  v_new_status text;
  v_payment_id uuid;
  v_payment_number text;
begin
  -- Pengecekan Idempotensi Pembayaran
  if p_idempotency_key is not null then
    select id into v_payment_id
    from sale_payments
    where business_id = p_business_id and idempotency_key = p_idempotency_key;

    if v_payment_id is not null then
      return jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'is_duplicate', true
      );
    end if;
  end if;

  if p_amount <= 0 then
    raise exception 'Nominal pembayaran harus lebih besar dari 0.' using errcode = 'P0001';
  end if;

  -- 1. Kunci dan ambil data penjualan
  select id, business_id, branch_id, total, coalesce(paid_amount, 0) as paid_amount, status, payment_status, invoice_number
  into v_sale
  from sales
  where id = p_sale_id and business_id = p_business_id
  for update;

  if not found then
    raise exception 'Transaksi penjualan tidak ditemukan atau tidak terdaftar pada bisnis Anda.' using errcode = 'P0002';
  end if;

  if v_sale.status = 'voided' then
    raise exception 'Transaksi ini telah dibatalkan (voided) dan tidak dapat menerima pembayaran.' using errcode = 'P0001';
  end if;

  v_branch_id := v_sale.branch_id;

  -- ATURAN 3.D.5: Pembayaran tidak boleh melebihi saldo tagihan
  if (v_sale.paid_amount + p_amount) > v_sale.total then
    raise exception 'Nominal pembayaran (Rp %) melebihi sisa tagihan piutang (Sisa: Rp %).',
      p_amount, (v_sale.total - v_sale.paid_amount) using errcode = 'P0001';
  end if;

  v_new_paid := v_sale.paid_amount + p_amount;
  if v_new_paid >= v_sale.total then
    v_new_status := 'paid';
  else
    v_new_status := 'partial';
  end if;

  -- 2. Ambil data piutang terkait jika ada
  select id, total_amount, paid_amount
  into v_rec
  from receivables
  where sale_id = p_sale_id and business_id = p_business_id
  for update;

  v_payment_number := 'PAY/' || to_char(coalesce(p_payment_date, current_date), 'YYYYMMDD') || '/' || floor(1000 + random() * 9000)::text;

  -- 3. Catat di tabel sale_payments (Immutable Ledger Pembayaran)
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
    v_branch_id,
    p_sale_id,
    v_rec.id,
    v_payment_number,
    p_amount,
    p_payment_method,
    p_account_id,
    coalesce(p_payment_date, current_date),
    p_recorded_by,
    p_idempotency_key,
    coalesce(p_notes, 'Pembayaran piutang penjualan')
  ) returning id into v_payment_id;

  -- 4. Update Header Penjualan
  update sales
  set paid_amount = v_new_paid,
      payment_status = v_new_status,
      updated_at = now()
  where id = p_sale_id;

  -- 5. Update Kartu Piutang
  if v_rec.id is not null then
    update receivables
    set paid_amount = v_new_paid,
        status = v_new_status,
        updated_at = now()
    where id = v_rec.id;
  end if;

  -- 6. Tambah Saldo Akun Kas/Bank Penampung & Catat Jurnal Mutasi
  if p_account_id is not null then
    update financial_accounts
    set current_balance = current_balance + p_amount,
        updated_at = now()
    where id = p_account_id and business_id = p_business_id;

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
      p_account_id,
      'income',
      'receivable_payment',
      p_amount,
      v_payment_id,
      'Pelunasan Piutang #' || coalesce(v_sale.invoice_number, left(p_sale_id::text, 8)) || ' (' || v_payment_number || ')',
      coalesce(p_payment_date, current_date)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'payment_number', v_payment_number,
    'new_paid_amount', v_new_paid,
    'remaining_balance', (v_sale.total - v_new_paid),
    'payment_status', v_new_status
  );
end;
$$;

revoke execute on function record_sale_payment_atomic(uuid, uuid, numeric, payment_method, uuid, uuid, date, text, uuid) from public;
grant execute on function record_sale_payment_atomic(uuid, uuid, numeric, payment_method, uuid, uuid, date, text, uuid) to authenticated, service_role;

-- 6. STORED PROCEDURE: VOID_SALE_ATOMIC (Pembatalan Transaksi Penjualan Aman)
-- Menggantikan hard-delete. Mengembalikan stok, membalik saldo kas/bank, membatalkan piutang, dan mencatat audit log.
create or replace function void_sale_atomic(
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
  v_caller_role text;
begin
  -- 1. Otorisasi
  select role into v_caller_role
  from profiles
  where id = p_user_id and business_id = p_business_id;

  if v_caller_role is null then
    raise exception 'Pengguna tidak terdaftar pada bisnis ini.' using errcode = '42501';
  end if;

  -- 2. Kunci transaksi penjualan
  select id, business_id, branch_id, channel, payment_method, total, coalesce(paid_amount, 0) as paid_amount, status, invoice_number, transaction_date
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

  -- 3. Kembalikan stok untuk setiap item penjualan
  for v_item in
    select product_id, quantity
    from sale_items
    where sale_id = p_sale_id
  loop
    update product_branch_stocks
    set stock = stock + v_item.quantity,
        updated_at = now()
    where product_id = v_item.product_id
      and branch_id = v_sale.branch_id;

    update products
    set stock = stock + v_item.quantity,
        updated_at = now()
    where id = v_item.product_id;
  end loop;

  -- 4. Balikkan dampak kas/bank dari semua pembayaran yang pernah diterima
  for v_payment in
    select id, account_id, amount, payment_number
    from sale_payments
    where sale_id = p_sale_id
  loop
    if v_payment.account_id is not null then
      update financial_accounts
      set current_balance = current_balance - v_payment.amount,
          updated_at = now()
      where id = v_payment.account_id;

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
    end if;
  end loop;

  -- 5. Batalkan piutang terkait di tabel receivables
  update receivables
  set status = 'paid', -- Tutup piutang agar tidak ditagih
      notes = coalesce(notes, '') || ' [Dibatalkan / Void: ' || coalesce(p_reason, 'Transaksi dibatalkan') || ']',
      updated_at = now()
  where sale_id = p_sale_id and business_id = p_business_id;

  -- 6. Ubah status penjualan menjadi voided (TIDAK DIHAPUS DARI DATABASE)
  update sales
  set status = 'voided',
      voided_at = now(),
      voided_by = p_user_id,
      void_reason = p_reason,
      updated_at = now()
  where id = p_sale_id;

  -- 7. Rekam audit log lengkap di sale_edit_logs
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
      'voided_by', p_user_id,
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

revoke execute on function void_sale_atomic(uuid, uuid, uuid, text) from public;
grant execute on function void_sale_atomic(uuid, uuid, uuid, text) to authenticated, service_role;
