-- ================================================================
-- Migration 0028: Financial Accounts, Debts, Receivables, and Equity
-- Modul Keuangan Lengkap: Saldo Awal, Kas & Rekening Bank, Utang, Piutang, Modal
-- ================================================================

-- 1. TABEL FINANCIAL_ACCOUNTS (Kas & Rekening Bank)
create table if not exists financial_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  type text not null check (type in ('cash', 'bank', 'e_wallet')),
  account_number text,
  bank_name text,
  initial_balance numeric(14,2) not null default 0 check (initial_balance >= 0),
  current_balance numeric(14,2) not null default 0,
  is_default_cash boolean not null default false,
  is_default_bank boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_financial_accounts_business on financial_accounts (business_id);
create index if not exists idx_financial_accounts_type on financial_accounts (business_id, type);

-- 2. TABEL FINANCIAL_TRANSACTIONS (Jurnal Mutasi Kas & Bank)
create table if not exists financial_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  account_id uuid not null references financial_accounts(id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'transfer_in', 'transfer_out')),
  category text not null check (category in (
    'sale', 'expense', 'debt_payment', 'receivable_payment',
    'equity_deposit', 'equity_withdraw', 'transfer', 'adjustment', 'opening_balance'
  )),
  amount numeric(14,2) not null check (amount > 0),
  reference_id uuid,
  description text,
  transaction_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_financial_tx_business on financial_transactions (business_id);
create index if not exists idx_financial_tx_account on financial_transactions (account_id);
create index if not exists idx_financial_tx_date on financial_transactions (business_id, transaction_date);

-- 3. TABEL DEBTS_PAYABLES (Buku Utang Usaha)
create table if not exists debts_payables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  creditor_name text not null,
  title text not null,
  total_amount numeric(14,2) not null check (total_amount > 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_debts_business on debts_payables (business_id);
create index if not exists idx_debts_status on debts_payables (business_id, status);
create index if not exists idx_debts_due_date on debts_payables (business_id, due_date);

-- 4. TABEL RECEIVABLES (Buku Piutang Usaha)
create table if not exists receivables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  debtor_name text not null,
  sale_id uuid references sales(id) on delete set null,
  title text not null,
  total_amount numeric(14,2) not null check (total_amount > 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_receivables_business on receivables (business_id);
create index if not exists idx_receivables_status on receivables (business_id, status);
create index if not exists idx_receivables_due_date on receivables (business_id, due_date);

-- 5. TABEL EQUITY_RECORDS (Modal Usaha & Ekuitas Pemilik)
create table if not exists equity_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  title text not null,
  type text not null check (type in ('initial_capital', 'additional_capital', 'drawings_prive')),
  amount numeric(14,2) not null check (amount > 0),
  account_id uuid references financial_accounts(id) on delete set null,
  entry_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_equity_business on equity_records (business_id);
create index if not exists idx_equity_date on equity_records (business_id, entry_date);

-- ================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ================================================================

alter table financial_accounts enable row level security;
alter table financial_transactions enable row level security;
alter table debts_payables enable row level security;
alter table receivables enable row level security;
alter table equity_records enable row level security;

-- 1. financial_accounts policies
drop policy if exists "financial_accounts_select_policy" on financial_accounts;
create policy "financial_accounts_select_policy" on financial_accounts
  for select using (business_id = auth_business_id());

drop policy if exists "financial_accounts_owner_insert" on financial_accounts;
create policy "financial_accounts_owner_insert" on financial_accounts
  for insert with check (business_id = auth_business_id() and auth_is_owner());

drop policy if exists "financial_accounts_owner_update" on financial_accounts;
create policy "financial_accounts_owner_update" on financial_accounts
  for update using (business_id = auth_business_id() and auth_is_owner())
  with check (business_id = auth_business_id() and auth_is_owner());

drop policy if exists "financial_accounts_owner_delete" on financial_accounts;
create policy "financial_accounts_owner_delete" on financial_accounts
  for delete using (business_id = auth_business_id() and auth_is_owner());

-- 2. financial_transactions policies
drop policy if exists "financial_transactions_select_policy" on financial_transactions;
create policy "financial_transactions_select_policy" on financial_transactions
  for select using (business_id = auth_business_id());

drop policy if exists "financial_transactions_insert_policy" on financial_transactions;
create policy "financial_transactions_insert_policy" on financial_transactions
  for insert with check (business_id = auth_business_id());

-- 3. debts_payables policies
drop policy if exists "debts_payables_select_policy" on debts_payables;
create policy "debts_payables_select_policy" on debts_payables
  for select using (business_id = auth_business_id());

drop policy if exists "debts_payables_owner_all" on debts_payables;
create policy "debts_payables_owner_all" on debts_payables
  for all using (business_id = auth_business_id() and auth_is_owner())
  with check (business_id = auth_business_id() and auth_is_owner());

-- 4. receivables policies
drop policy if exists "receivables_select_policy" on receivables;
create policy "receivables_select_policy" on receivables
  for select using (business_id = auth_business_id());

drop policy if exists "receivables_owner_all" on receivables;
create policy "receivables_owner_all" on receivables
  for all using (business_id = auth_business_id() and auth_is_owner())
  with check (business_id = auth_business_id() and auth_is_owner());

-- 5. equity_records policies
drop policy if exists "equity_records_select_policy" on equity_records;
create policy "equity_records_select_policy" on equity_records
  for select using (business_id = auth_business_id());

drop policy if exists "equity_records_owner_all" on equity_records;
create policy "equity_records_owner_all" on equity_records
  for all using (business_id = auth_business_id() and auth_is_owner())
  with check (business_id = auth_business_id() and auth_is_owner());

-- ================================================================
-- AUTO SEED FUNCTION & TRIGGER UNTUK AKUN DEFAULT SETIAP BISNIS
-- ================================================================

create or replace function fn_seed_default_financial_accounts(p_biz_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1. Kas Toko Tunai Default
  if not exists (select 1 from financial_accounts where business_id = p_biz_id and type = 'cash' and is_default_cash = true) then
    insert into financial_accounts (
      business_id, name, type, bank_name, initial_balance, current_balance, is_default_cash, is_default_bank, status
    ) values (
      p_biz_id, 'Kas Toko / Kasir', 'cash', 'Kas Tunai', 0, 0, true, false, 'active'
    );
  end if;

  -- 2. Rekening Bank Utama Default
  if not exists (select 1 from financial_accounts where business_id = p_biz_id and type in ('bank', 'e_wallet') and is_default_bank = true) then
    insert into financial_accounts (
      business_id, name, type, bank_name, initial_balance, current_balance, is_default_cash, is_default_bank, status
    ) values (
      p_biz_id, 'Rekening Bank Utama', 'bank', 'BCA / Bank Transfer', 0, 0, false, true, 'active'
    );
  end if;
end;
$$;

-- Seed default accounts untuk semua bisnis yang sudah ada saat ini
do $$
declare
  r record;
begin
  for r in select id from businesses loop
    perform fn_seed_default_financial_accounts(r.id);
  end loop;
end;
$$;

-- Trigger otomatis saat bisnis baru dibuat
create or replace function fn_on_business_created_seed_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fn_seed_default_financial_accounts(new.id);
  return new;
end;
$$;

drop trigger if exists trg_on_business_created_seed_accounts on businesses;
create trigger trg_on_business_created_seed_accounts
  after insert on businesses
  for each row
  execute function fn_on_business_created_seed_accounts();

-- ================================================================
-- OTOMATISASI KASIR: SYNC PENJUALAN KE SALDO KAS & BANK
-- ================================================================

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
begin
  v_pm := lower(coalesce(new.payment_method::text, ''));
  v_is_cash := (v_pm = 'cash' or v_pm = 'tunai');

  -- Cari akun yang sesuai
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

  -- Jika akun tidak ditemukan (misal dihapus), fallback ke akun aktif apa saja
  if v_account_id is null then
    select id into v_account_id
    from financial_accounts
    where business_id = new.business_id
      and status = 'active'
    order by created_at asc
    limit 1;
  end if;

  if v_account_id is not null and coalesce(new.total, 0) > 0 then
    -- Tambah saldo berjalan
    update financial_accounts
    set current_balance = current_balance + new.total,
        updated_at = now()
    where id = v_account_id;

    -- Catat jurnal transaksi mutasi
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
      new.total,
      new.id,
      'Penjualan Kasir #' || coalesce(new.invoice_number, left(new.id::text, 8)),
      coalesce(new.transaction_date::date, current_date)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_sale_to_financial_account on sales;
create trigger trg_sync_sale_to_financial_account
  after insert on sales
  for each row
  execute function fn_sync_sale_to_financial_account();

-- Reversal saat transaksi penjualan dihapus
create or replace function fn_revert_sale_from_financial_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx record;
begin
  for v_tx in
    select id, account_id, amount
    from financial_transactions
    where reference_id = old.id
      and category = 'sale'
  loop
    update financial_accounts
    set current_balance = current_balance - v_tx.amount,
        updated_at = now()
    where id = v_tx.account_id;

    delete from financial_transactions where id = v_tx.id;
  end loop;

  return old;
end;
$$;

drop trigger if exists trg_revert_sale_from_financial_account on sales;
create trigger trg_revert_sale_from_financial_account
  after delete on sales
  for each row
  execute function fn_revert_sale_from_financial_account();
