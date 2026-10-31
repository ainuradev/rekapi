-- ================================================================
-- Migration 0031: Integrate Purchases with Finance (Cash / Accounts Payable)
-- Menghubungkan Pembelian Bahan Baku ke Kas & Utang Usaha serta Rekonsiliasi Neraca & Arus Kas
-- ================================================================

-- 1. PERLUASAN TABEL PURCHASES
alter table purchases
  add column if not exists payment_status text not null default 'paid' check (payment_status in ('paid', 'unpaid')),
  add column if not exists payment_method text not null default 'cash',
  add column if not exists account_id uuid references financial_accounts(id) on delete set null,
  add column if not exists paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  add column if not exists due_date date;

create index if not exists idx_purchases_payment_status on purchases (business_id, payment_status);
create index if not exists idx_purchases_account on purchases (account_id);

-- Backfill data historis: pembelian lama dianggap lunas
update purchases
set paid_amount = total,
    payment_status = 'paid'
where paid_amount = 0 and (payment_status is null or payment_status = 'paid');

-- 2. PERLUASAN TABEL DEBTS_PAYABLES: Relasi 1:1 ke Purchases
alter table debts_payables
  add column if not exists purchase_id uuid references purchases(id) on delete set null;

create index if not exists idx_debts_purchase on debts_payables (purchase_id);

create unique index if not exists uq_debts_business_purchase
  on debts_payables (business_id, purchase_id)
  where purchase_id is not null;

-- 3. PERBARUI RPC RECORD_PURCHASE_WITH_STOCK_ATOMIC AGAR MENCAKUP KAS / UTANG SECARA ATOMIK
-- Hapus overload lama 7-parameter dari 0023/0026 agar tidak menimbulkan ambiguitas PostgREST/PostgreSQL (42725 / PGRST203)
drop function if exists record_purchase_with_stock_atomic(uuid, uuid, uuid, text, date, jsonb, text);

create or replace function record_purchase_with_stock_atomic(
  p_business_id uuid,
  p_branch_id uuid,
  p_supplier_id uuid,
  p_supplier_name text,
  p_purchase_date date,
  p_items jsonb, -- Array of { raw_material_id: uuid | null, item_name: text, quantity: numeric, price: numeric, unit: text | null }
  p_idempotency_key text default null,
  p_payment_status text default 'paid',
  p_payment_method text default 'cash',
  p_account_id uuid default null,
  p_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_biz_id uuid;
  v_caller_role text;
  v_purchase_id uuid;
  v_total numeric(12,2) := 0;
  v_item record;
  v_item_subtotal numeric(12,2);
  v_existing_id uuid;
  v_mat_id uuid;
  v_mat_name text;
  v_mat_unit text;
  v_calc_status text;
  v_paid_amt numeric(12,2) := 0;
  v_account_id uuid := p_account_id;
  v_supplier_name text := p_supplier_name;
begin
  -- 1. Otorisasi: Hanya Owner yang dapat mencatat pembelian bahan baku
  if auth.role() <> 'service_role' then
    if auth.uid() is null then
      raise exception 'Akses ditolak: Pengguna tidak terautentikasi.' using errcode = '42501';
    end if;

    select business_id, role
    into v_caller_biz_id, v_caller_role
    from profiles
    where id = auth.uid();

    if v_caller_biz_id <> p_business_id or v_caller_role <> 'owner' then
      raise exception 'Akses ditolak: Hanya Owner yang dapat mencatat pembelian bahan baku.' using errcode = '42501';
    end if;
  end if;

  -- 2. Validasi Cabang
  if not exists (select 1 from branches where id = p_branch_id and business_id = p_business_id) then
    raise exception 'Cabang tidak valid atau tidak dimiliki oleh bisnis ini.' using errcode = 'P0002';
  end if;

  -- Validasi Supplier (jika dipilih)
  if p_supplier_id is not null then
    select name into v_supplier_name
    from suppliers
    where id = p_supplier_id and business_id = p_business_id;

    if not found then
      raise exception 'Supplier tidak ditemukan.' using errcode = 'P0002';
    end if;
  end if;

  -- 3. Idempotensi: Cek duplikasi pembelian jika idempotency_key disediakan
  if p_idempotency_key is not null and trim(p_idempotency_key) <> '' then
    select id into v_existing_id
    from purchases
    where business_id = p_business_id
      and id::text = p_idempotency_key
    limit 1;

    if v_existing_id is not null then
      return jsonb_build_object(
        'success', true,
        'idempotent', true,
        'purchase_id', v_existing_id
      );
    end if;
  end if;

  -- 4. Hitung Total Pembelian & Validasi Dasar
  for v_item in select * from jsonb_to_recordset(p_items) as x(
    raw_material_id uuid,
    item_name text,
    quantity numeric,
    price numeric,
    unit text
  )
  loop
    if v_item.quantity <= 0 or v_item.price < 0 then
      raise exception 'Kuantitas harus > 0 dan harga tidak boleh negatif.' using errcode = '22003';
    end if;
    v_item_subtotal := round(v_item.quantity * v_item.price, 2);
    v_total := v_total + v_item_subtotal;
  end loop;

  v_calc_status := coalesce(lower(trim(p_payment_status)), 'paid');
  if v_calc_status not in ('paid', 'unpaid') then
    v_calc_status := 'paid';
  end if;

  if v_calc_status = 'paid' then
    v_paid_amt := v_total;
    -- Cari akun kas/bank default jika tidak ditentukan
    if v_account_id is null then
      select id into v_account_id
      from financial_accounts
      where business_id = p_business_id and status = 'active'
      order by is_default_cash desc, is_default_bank desc, created_at asc
      limit 1;
    end if;
  else
    v_paid_amt := 0;
    v_account_id := null;
  end if;

  -- 5. Insert Header Pembelian
  insert into purchases (
    id,
    business_id,
    branch_id,
    supplier_id,
    supplier,
    purchase_date,
    total,
    payment_status,
    payment_method,
    account_id,
    paid_amount,
    due_date
  )
  values (
    case when p_idempotency_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then p_idempotency_key::uuid
      else gen_random_uuid()
    end,
    p_business_id,
    p_branch_id,
    p_supplier_id,
    v_supplier_name,
    p_purchase_date,
    v_total,
    v_calc_status,
    coalesce(p_payment_method, 'cash'),
    v_account_id,
    v_paid_amt,
    p_due_date
  )
  returning id into v_purchase_id;

  -- 6. Insert Purchase Items & Otomatis Buat Bahan Baru / Tambah Stok
  for v_item in select * from jsonb_to_recordset(p_items) as x(
    raw_material_id uuid,
    item_name text,
    quantity numeric,
    price numeric,
    unit text
  )
  loop
    v_item_subtotal := round(v_item.quantity * v_item.price, 2);
    v_mat_id := v_item.raw_material_id;
    v_mat_name := trim(coalesce(v_item.item_name, ''));
    v_mat_unit := lower(trim(coalesce(v_item.unit, 'pcs')));
    if v_mat_unit = '' then
      v_mat_unit := 'pcs';
    end if;

    -- Jika raw_material_id tidak disertakan, cari berdasarkan nama
    if v_mat_id is null and v_mat_name <> '' then
      select id into v_mat_id
      from raw_materials
      where business_id = p_business_id
        and lower(trim(name)) = lower(v_mat_name)
      limit 1;

      -- Jika bahan belum terdaftar sama sekali, buat baru di master raw_materials
      if v_mat_id is null then
        insert into raw_materials (
          business_id,
          name,
          category,
          unit,
          cost_per_unit,
          min_stock,
          status,
          stock
        )
        values (
          p_business_id,
          v_mat_name,
          'Bahan Baku',
          v_mat_unit,
          v_item.price,
          0,
          'active',
          0
        )
        returning id into v_mat_id;
      end if;
    end if;

    -- Insert ke purchase_items dengan raw_material_id yang sudah terhubung
    insert into purchase_items (
      purchase_id,
      raw_material_id,
      item_name,
      quantity,
      price,
      subtotal,
      unit
    )
    values (
      v_purchase_id,
      v_mat_id,
      v_mat_name,
      v_item.quantity,
      v_item.price,
      v_item_subtotal,
      v_mat_unit
    );

    -- Otomatis tambah stok cabang dan catat kartu mutasi
    if v_mat_id is not null then
      perform record_inventory_mutation_atomic(
        p_business_id,
        p_branch_id,
        v_mat_id,
        'purchase_in',
        v_item.quantity,
        'Pembelian #' || substr(v_purchase_id::text, 1, 8),
        v_purchase_id::text,
        'purchase_in_' || v_purchase_id::text || '_' || v_mat_id::text
      );

      -- Perbarui harga beli HPP terakhir pada master bahan
      update raw_materials
      set cost_per_unit = v_item.price,
          updated_at = now()
      where id = v_mat_id and business_id = p_business_id;
    end if;
  end loop;

  -- 7. Integrasi Finansial: Potong Kas / Catat Utang Usaha
  if v_calc_status = 'paid' and v_total > 0 and v_account_id is not null then
    -- Kurangkan saldo akun kas/bank
    update financial_accounts
    set current_balance = current_balance - v_total,
        updated_at = now()
    where id = v_account_id and business_id = p_business_id;

    -- Catat jurnal mutasi kas keluar
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
      v_account_id,
      'expense',
      'expense',
      v_total,
      v_purchase_id,
      'Pembelian Bahan Baku #' || substr(v_purchase_id::text, 1, 8) || ' (' || coalesce(v_supplier_name, 'Supplier') || ')',
      p_purchase_date
    );
  elsif v_calc_status = 'unpaid' and v_total > 0 then
    -- Catat utang usaha baru pada debts_payables
    insert into debts_payables (
      business_id,
      supplier_id,
      creditor_name,
      purchase_id,
      title,
      total_amount,
      paid_amount,
      due_date,
      status,
      notes
    ) values (
      p_business_id,
      p_supplier_id,
      coalesce(v_supplier_name, 'Supplier Bahan Baku'),
      v_purchase_id,
      'Utang Pembelian Bahan Baku #' || substr(v_purchase_id::text, 1, 8),
      v_total,
      0,
      p_due_date,
      'unpaid',
      'Pembelian tempo bahan baku via modul Bahan Baku'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'total', v_total,
    'payment_status', v_calc_status,
    'paid_amount', v_paid_amt
  );
end;
$$;

revoke execute on function record_purchase_with_stock_atomic(uuid, uuid, uuid, text, date, jsonb, text, text, text, uuid, date) from public;
grant execute on function record_purchase_with_stock_atomic(uuid, uuid, uuid, text, date, jsonb, text, text, text, uuid, date) to authenticated, service_role;
