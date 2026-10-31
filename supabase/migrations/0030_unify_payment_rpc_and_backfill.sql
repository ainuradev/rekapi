-- ================================================================
-- Migration 0030: Unify Payment RPC, Receivables-Sales Sync & Data Backfill
-- Menyelaraskan Parameter RPC record_sale_payment_atomic, 
-- Memperkuat Integritas Relasi Piutang-Penjualan, dan Rekonsiliasi Data Historis
-- ================================================================

-- 1. DROP OVERLOAD SEBELUMNYA AGAR TIPE PARAMETER BARU DAPAT DITERAPKAN TANPA KONFLIK
drop function if exists record_sale_payment_atomic(uuid, uuid, numeric, payment_method, uuid, uuid, date, text, uuid);
drop function if exists record_sale_payment_atomic(uuid, uuid, numeric, payment_method, uuid, uuid, date, text, text);
drop function if exists record_sale_payment_atomic(uuid, uuid, numeric, payment_method, uuid, uuid, date, text, text, uuid);

-- 2. PERBARUI RPC RECORD_SALE_PAYMENT_ATOMIC
-- Menerima alias p_user_id & p_recorded_by, serta p_idempotency_key bertipe text dengan validasi regex UUID
create or replace function record_sale_payment_atomic(
  p_business_id uuid,
  p_sale_id uuid,
  p_amount numeric(12,2),
  p_payment_method payment_method,
  p_account_id uuid default null,
  p_recorded_by uuid default null,
  p_payment_date date default current_date,
  p_notes text default null,
  p_idempotency_key text default null,
  p_user_id uuid default null
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
  v_recorded_by uuid;
  v_idempotency_uuid uuid := null;
begin
  -- 1. Evaluasi dan fallback user pencatat pembayaran
  v_recorded_by := coalesce(p_recorded_by, p_user_id, auth.uid());
  if v_recorded_by is null then
    raise exception 'Pengguna pencatat pembayaran wajib diisi.' using errcode = 'P0001';
  end if;

  -- 2. Evaluasi toleransi format UUID untuk p_idempotency_key
  -- Jika string memenuhi pola UUID v1-v5, konversi ke UUID untuk checking dan indexing sale_payments.
  -- Jika bukan UUID valid atau null, biarkan null agar tidak memicu exception crash pada PostgreSQL.
  if p_idempotency_key is not null and trim(p_idempotency_key) <> '' then
    if trim(p_idempotency_key) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_idempotency_uuid := trim(p_idempotency_key)::uuid;
    end if;
  end if;

  -- 3. Pengecekan Idempotensi Pembayaran (hanya jika v_idempotency_uuid valid)
  if v_idempotency_uuid is not null then
    select id into v_payment_id
    from sale_payments
    where business_id = p_business_id and idempotency_key = v_idempotency_uuid;

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

  -- 4. Kunci dan ambil data penjualan
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

  -- 5. Validasi: Pembayaran tidak boleh melebihi sisa tagihan piutang
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

  -- 6. Ambil data piutang terkait jika ada
  select id, total_amount, paid_amount
  into v_rec
  from receivables
  where sale_id = p_sale_id and business_id = p_business_id
  for update;

  v_payment_number := 'PAY/' || to_char(coalesce(p_payment_date, current_date), 'YYYYMMDD') || '/' || floor(1000 + random() * 9000)::text;

  -- 7. Catat di tabel sale_payments (Immutable Ledger Pembayaran)
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
    v_recorded_by,
    v_idempotency_uuid,
    coalesce(p_notes, 'Pembayaran piutang penjualan')
  ) returning id into v_payment_id;

  -- 8. Update Header Penjualan
  update sales
  set paid_amount = v_new_paid,
      payment_status = v_new_status,
      updated_at = now()
  where id = p_sale_id;

  -- 9. Update Kartu Piutang
  if v_rec.id is not null then
    update receivables
    set paid_amount = v_new_paid,
        status = v_new_status,
        updated_at = now()
    where id = v_rec.id;
  end if;

  -- 10. Tambah Saldo Akun Kas/Bank Penampung & Catat Jurnal Mutasi
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

revoke execute on function record_sale_payment_atomic(uuid, uuid, numeric, payment_method, uuid, uuid, date, text, text, uuid) from public;
grant execute on function record_sale_payment_atomic(uuid, uuid, numeric, payment_method, uuid, uuid, date, text, text, uuid) to authenticated, service_role;

-- 3. INTEGRITAS RELASI PIUTANG-PENJUALAN (PARTIAL UNIQUE INDEX)
create unique index if not exists uq_receivables_business_sale
  on receivables (business_id, sale_id)
  where sale_id is not null;

-- 4. DATA BACKFILL (SINKRONISASI DATA HISTORIS SALES DAN RECEIVABLES)
update sales s
set paid_amount = r.paid_amount,
    payment_status = r.status,
    updated_at = now()
from receivables r
where r.sale_id = s.id
  and r.business_id = s.business_id
  and s.status <> 'voided'
  and (s.paid_amount <> r.paid_amount or s.payment_status <> r.status);
