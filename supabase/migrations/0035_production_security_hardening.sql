-- ================================================================
-- Migration 0035: Production Security Hardening (P0 Blocker Remediation)
-- 1. Anti Cross-Tenant Takeover in handle_new_user() (Strict app_metadata Only)
-- 2. Tenant Isolation & Security Invoker on Reporting Views v_sale_profit & v_daily_recap
-- 3. Caller Authentication & Business Scoping on record_sale_payment_atomic
-- 4. Enable RLS DELETE Policy for financial_transactions (Owner Only)
-- 5. Harden expire_trials() to Expire Both Trials and Overdue Active Subscriptions
-- ================================================================

-- ─── 1. HANDLE_NEW_USER (P0-1: Anti Cross-Tenant Takeover) ───────────────────
-- CRITICAL SECURITY: Hanya baca invited_business_id dan invited_branch_id dari
-- new.raw_app_meta_data yang HANYA bisa ditulis oleh Admin API (Service Role).
-- JANGAN PERNAH membaca invited_business_id atau role dari raw_user_meta_data
-- karena bisa dimanipulasi oleh siapa saja saat public signUp!
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_invited_business_id uuid;
  v_invited_branch_id uuid;
begin
  -- 1. Hanya ekstrak data undangan dari app_metadata (terproteksi server)
  v_invited_business_id := (new.raw_app_meta_data->>'invited_business_id')::uuid;
  v_invited_branch_id := (new.raw_app_meta_data->>'invited_branch_id')::uuid;

  if v_invited_business_id is not null then
    -- Kasus: Akun pegawai yang diundang oleh owner via Admin API ke bisnis yang sudah ada.
    -- Role dipaksa 'pegawai' demi mencegah eskalasi hak akses menjadi owner.
    insert into public.profiles (id, business_id, branch_id, role, full_name)
    values (
      new.id,
      v_invited_business_id,
      v_invited_branch_id,
      'pegawai'::user_role,
      coalesce(new.raw_user_meta_data->>'full_name', new.email)
    );
  else
    -- Kasus normal: Pendaftaran bisnis baru via /register.
    -- Buat entitas bisnis baru dan pasang user sebagai 'owner'.
    insert into public.businesses (name)
    values (coalesce(new.raw_user_meta_data->>'business_name', 'Bisnis Baru'))
    returning id into v_business_id;

    insert into public.profiles (id, business_id, branch_id, role, full_name)
    values (
      new.id,
      v_business_id,
      null,
      'owner'::user_role,
      coalesce(new.raw_user_meta_data->>'full_name', new.email)
    );
  end if;

  return new;
end;
$$;


-- ─── 2. REPORTING VIEWS (P0-2: Security Invoker & Tenant Isolation) ───────────
-- Recreate views dengan with (security_invoker = true) dan filter business_id = auth_business_id()
drop view if exists public.v_daily_recap cascade;
drop view if exists public.v_sale_profit cascade;

create view public.v_sale_profit
with (security_invoker = true)
as
select
  s.id as sale_id,
  s.business_id,
  s.branch_id,
  s.transaction_date,
  s.channel,
  s.payment_method,
  s.total as omzet,
  coalesce(sum(si.cost_price * si.quantity), 0) as hpp,
  s.total - coalesce(sum(si.cost_price * si.quantity), 0) as laba_kotor
from sales s
left join sale_items si on si.sale_id = s.id
where s.business_id = auth_business_id()
group by s.id, s.business_id, s.branch_id, s.transaction_date, s.channel, s.payment_method, s.total;

create view public.v_daily_recap
with (security_invoker = true)
as
select
  business_id,
  branch_id,
  date(transaction_date) as tanggal,
  sum(omzet) as omzet,
  sum(hpp) as hpp,
  sum(laba_kotor) as laba_kotor
from v_sale_profit
where business_id = auth_business_id()
group by business_id, branch_id, date(transaction_date);

revoke all on public.v_sale_profit from anon, public;
grant select on public.v_sale_profit to authenticated, service_role;

revoke all on public.v_daily_recap from anon, public;
grant select on public.v_daily_recap to authenticated, service_role;


-- ─── 3. RECORD_SALE_PAYMENT_ATOMIC (P0-3: Tenant & Branch Authentication) ────
drop function if exists public.record_sale_payment_atomic(uuid, uuid, numeric, payment_method, uuid, uuid, date, text, text, uuid);

create or replace function public.record_sale_payment_atomic(
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
  v_caller_biz_id uuid;
  v_caller_branch_id uuid;
  v_caller_role text;
begin
  -- 1. Otorisasi Pemanggil di level database (Anti Cross-Tenant Bypass)
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

    v_recorded_by := auth.uid();
  else
    v_recorded_by := coalesce(p_recorded_by, p_user_id);
    if v_recorded_by is null then
      raise exception 'Pengguna pencatat pembayaran wajib diisi.' using errcode = 'P0001';
    end if;
  end if;

  -- 2. Evaluasi p_idempotency_key
  if p_idempotency_key is not null and trim(p_idempotency_key) <> '' then
    if trim(p_idempotency_key) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_idempotency_uuid := trim(p_idempotency_key)::uuid;
    end if;
  end if;

  -- 3. Pengecekan Idempotensi Pembayaran
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

  -- Validasi cabang untuk pegawai
  if v_caller_role = 'pegawai' and v_caller_branch_id is not null and v_caller_branch_id <> v_sale.branch_id then
    raise exception 'Akses ditolak: Pegawai hanya dapat mencatat pembayaran di cabang sendiri.' using errcode = '42501';
  end if;

  -- Validasi kepemilikan akun penampung dana
  if p_account_id is not null then
    if not exists (select 1 from financial_accounts where id = p_account_id and business_id = p_business_id) then
      raise exception 'Akun keuangan tujuan tidak terdaftar pada bisnis Anda.' using errcode = 'P0002';
    end if;
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

revoke execute on function public.record_sale_payment_atomic(uuid, uuid, numeric, payment_method, uuid, uuid, date, text, text, uuid) from public;
grant execute on function public.record_sale_payment_atomic(uuid, uuid, numeric, payment_method, uuid, uuid, date, text, text, uuid) to authenticated, service_role;


-- ─── 4. FINANCIAL_TRANSACTIONS DELETE POLICY (P1-3 Jurnal Bersih) ────────────
drop policy if exists "owner delete financial_transactions" on public.financial_transactions;

create policy "owner delete financial_transactions"
on public.financial_transactions
for delete
using (
  business_id = auth_business_id()
  and auth_is_owner()
);


-- ─── 5. HARDEN EXPIRE_TRIALS (P0-4: Otomasi Expire Langganan & Trial) ────────
create or replace function public.expire_trials()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1. Expire masa trial yang telah melewati batas waktu
  update public.businesses
  set subscription_status = 'expired',
      updated_at = now()
  where subscription_status = 'trial'
    and trial_ends_at is not null
    and trial_ends_at < now();

  -- 2. Expire langganan active yang telah melewati subscription_expires_at
  update public.businesses
  set subscription_status = 'expired',
      updated_at = now()
  where subscription_status = 'active'
    and subscription_expires_at is not null
    and subscription_expires_at < now();

  -- 3. Sinkronkan riwayat record subscriptions
  update public.subscriptions
  set status = 'expired',
      updated_at = now()
  where status in ('trial', 'active')
    and expires_at is not null
    and expires_at < now();
end;
$$;

revoke execute on function public.expire_trials() from public, anon;
grant execute on function public.expire_trials() to service_role;
