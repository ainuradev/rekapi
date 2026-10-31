-- ================================================================
-- Migration 0023: Phase 2 — Raw Materials, Branch Stock, Ledger Mutations & Suppliers
-- Status: Release Candidate / Phase 2
--
-- Entitas yang dibuat/diperbarui:
--  1. suppliers: Master data pemasok bahan baku terisolasi per tenant
--  2. raw_materials: Master bahan baku dengan satuan dasar, min_stock, & cost_per_unit
--  3. raw_material_branch_stocks: Stok bahan baku terpisah per cabang usaha
--  4. inventory_mutations: Kartu mutasi stok (immutable ledger)
--  5. Relasi purchases.supplier_id & purchase_items.raw_material_id
--  6. Stored procedure record_inventory_mutation_atomic & record_purchase_with_stock_atomic
-- ================================================================

-- 1. TABEL SUPPLIERS (Master Supplier)
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  bank_details text,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_suppliers_business on suppliers (business_id);
create index if not exists idx_suppliers_business_name on suppliers (business_id, name);

-- 2. TABEL RAW_MATERIALS (Master Bahan Baku)
create table if not exists raw_materials (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  sku text,
  name text not null,
  category text,
  unit text not null default 'pcs',
  cost_per_unit numeric(12,2) not null default 0 check (cost_per_unit >= 0),
  min_stock numeric(12,2) not null default 0 check (min_stock >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_raw_materials_business on raw_materials (business_id);
create index if not exists idx_raw_materials_category on raw_materials (business_id, category);
-- Cegah duplikasi SKU dalam bisnis yang sama bila SKU diisi
create unique index if not exists uq_raw_materials_business_sku
  on raw_materials (business_id, lower(trim(sku)))
  where sku is not null and trim(sku) <> '';

-- 3. TABEL RAW_MATERIAL_BRANCH_STOCKS (Stok Bahan Baku Per Cabang)
create table if not exists raw_material_branch_stocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  raw_material_id uuid not null references raw_materials(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  quantity numeric(12,2) not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_raw_material_branch unique (raw_material_id, branch_id)
);

create index if not exists idx_rmbs_business on raw_material_branch_stocks (business_id);
create index if not exists idx_rmbs_material on raw_material_branch_stocks (raw_material_id);
create index if not exists idx_rmbs_branch on raw_material_branch_stocks (branch_id);

-- Trigger: Inisialisasi stok cabang saat bahan baku baru ditambahkan
create or replace function fn_init_raw_material_branch_stocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into raw_material_branch_stocks (business_id, raw_material_id, branch_id, quantity)
  select
    new.business_id,
    new.id,
    b.id,
    0
  from branches b
  where b.business_id = new.business_id
  on conflict (raw_material_id, branch_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_init_raw_material_branch_stocks on raw_materials;
create trigger trg_init_raw_material_branch_stocks
  after insert on raw_materials
  for each row
  execute function fn_init_raw_material_branch_stocks();

-- Trigger: Inisialisasi stok bahan saat cabang baru dibuka
create or replace function fn_init_branch_raw_material_stocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into raw_material_branch_stocks (business_id, raw_material_id, branch_id, quantity)
  select
    new.business_id,
    rm.id,
    new.id,
    0
  from raw_materials rm
  where rm.business_id = new.business_id
  on conflict (raw_material_id, branch_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_init_branch_raw_material_stocks on branches;
create trigger trg_init_branch_raw_material_stocks
  after insert on branches
  for each row
  execute function fn_init_branch_raw_material_stocks();

-- 4. TABEL INVENTORY_MUTATIONS (Kartu Mutasi Ledger)
create table if not exists inventory_mutations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete restrict,
  raw_material_id uuid not null references raw_materials(id) on delete restrict,
  mutation_type text not null check (
    mutation_type in (
      'purchase_in',
      'opening_balance',
      'adjustment',
      'waste',
      'transfer_in',
      'transfer_out'
    )
  ),
  quantity_change numeric(12,2) not null,
  balance_after numeric(12,2) not null check (balance_after >= 0),
  notes text,
  reference_id text,
  user_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_inv_mut_material_branch
  on inventory_mutations (business_id, raw_material_id, branch_id, created_at desc);
create index if not exists idx_inv_mut_branch
  on inventory_mutations (branch_id, created_at desc);
create index if not exists idx_inv_mut_reference
  on inventory_mutations (business_id, reference_id)
  where reference_id is not null;

-- Proteksi Immutable Ledger: Jangan izinkan UPDATE atau DELETE pada riwayat mutasi
revoke update, delete on inventory_mutations from authenticated;
revoke update, delete on inventory_mutations from anon;

-- 5. PERLUASAN TABEL PURCHASES & PURCHASE_ITEMS
alter table purchases
  add column if not exists supplier_id uuid references suppliers(id) on delete set null;

alter table purchase_items
  add column if not exists raw_material_id uuid references raw_materials(id) on delete set null;

alter table purchase_items
  add column if not exists unit text;

create index if not exists idx_purchases_supplier on purchases (supplier_id);
create index if not exists idx_purchase_items_material on purchase_items (raw_material_id);

-- 6. ATOMIC RPC FUNCTION: record_inventory_mutation_atomic
-- Menjamin perubahan stok cabang dan pencatatan kartu mutasi ledger terjadi secara atomik
create or replace function record_inventory_mutation_atomic(
  p_business_id uuid,
  p_branch_id uuid,
  p_raw_material_id uuid,
  p_mutation_type text,
  p_quantity_change numeric,
  p_notes text default null,
  p_reference_id text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_biz_id uuid;
  v_caller_role text;
  v_caller_branch_id uuid;
  v_current_stock numeric(12,2) := 0;
  v_new_stock numeric(12,2);
  v_mutation_id uuid;
  v_existing_mutation_id uuid;
begin
  -- 1. Otorisasi Pemanggil
  if auth.role() <> 'service_role' then
    if auth.uid() is null then
      raise exception 'Akses ditolak: Pengguna tidak terautentikasi.' using errcode = '42501';
    end if;

    select business_id, role, branch_id
    into v_caller_biz_id, v_caller_role, v_caller_branch_id
    from profiles
    where id = auth.uid();

    if v_caller_biz_id <> p_business_id then
      raise exception 'Akses ditolak: Tidak dapat mengubah inventaris bisnis lain.' using errcode = '42501';
    end if;

    if v_caller_role <> 'owner' and (v_caller_branch_id is null or v_caller_branch_id <> p_branch_id) then
      raise exception 'Akses ditolak: Pegawai hanya dapat mengubah inventaris cabangnya sendiri.' using errcode = '42501';
    end if;
  end if;

  -- 2. Validasi Relasi Tenant & Cabang
  if not exists (select 1 from branches where id = p_branch_id and business_id = p_business_id) then
    raise exception 'Cabang tidak valid atau tidak dimiliki oleh bisnis ini.' using errcode = 'P0002';
  end if;

  if not exists (select 1 from raw_materials where id = p_raw_material_id and business_id = p_business_id) then
    raise exception 'Bahan baku tidak ditemukan pada bisnis ini.' using errcode = 'P0002';
  end if;

  -- 3. Idempotensi Proteksi: Cek apakah referensi mutasi sudah pernah diproses
  if p_idempotency_key is not null and trim(p_idempotency_key) <> '' then
    select id into v_existing_mutation_id
    from inventory_mutations
    where business_id = p_business_id
      and branch_id = p_branch_id
      and raw_material_id = p_raw_material_id
      and reference_id = p_idempotency_key
    limit 1;

    if v_existing_mutation_id is not null then
      select quantity into v_current_stock
      from raw_material_branch_stocks
      where raw_material_id = p_raw_material_id and branch_id = p_branch_id;

      return jsonb_build_object(
        'success', true,
        'idempotent', true,
        'mutation_id', v_existing_mutation_id,
        'current_stock', coalesce(v_current_stock, 0)
      );
    end if;
  end if;

  -- 4. Kunci Baris Stok dengan SELECT FOR UPDATE (Concurrency Protection)
  select quantity into v_current_stock
  from raw_material_branch_stocks
  where raw_material_id = p_raw_material_id and branch_id = p_branch_id
  for update;

  if not found then
    -- Baris stok belum ada: inisialisasi baris baru dengan quantity 0
    insert into raw_material_branch_stocks (business_id, raw_material_id, branch_id, quantity)
    values (p_business_id, p_raw_material_id, p_branch_id, 0)
    returning quantity into v_current_stock;
  end if;

  -- 5. Hitung Saldo Akhir & Cegah Saldo Negatif
  v_new_stock := v_current_stock + p_quantity_change;

  if v_new_stock < 0 then
    raise exception 'Stok tidak mencukupi untuk bahan ini (stok saat ini: %, pengurangan: %).',
      v_current_stock, abs(p_quantity_change)
      using errcode = 'P0003';
  end if;

  -- 6. Perbarui Saldo Stok Cabang
  update raw_material_branch_stocks
  set quantity = v_new_stock,
      updated_at = now()
  where raw_material_id = p_raw_material_id and branch_id = p_branch_id;

  -- 7. Catat Entri Ledger Kartu Mutasi
  insert into inventory_mutations (
    business_id,
    branch_id,
    raw_material_id,
    mutation_type,
    quantity_change,
    balance_after,
    notes,
    reference_id,
    user_id
  )
  values (
    p_business_id,
    p_branch_id,
    p_raw_material_id,
    p_mutation_type,
    p_quantity_change,
    v_new_stock,
    p_notes,
    coalesce(p_idempotency_key, p_reference_id),
    auth.uid()
  )
  returning id into v_mutation_id;

  return jsonb_build_object(
    'success', true,
    'mutation_id', v_mutation_id,
    'previous_stock', v_current_stock,
    'current_stock', v_new_stock
  );
end;
$$;

-- 7. ATOMIC RPC FUNCTION: record_purchase_with_stock_atomic
-- Menjamin penyimpanan header pembelian, items, dan penambahan stok cabang atomik
create or replace function record_purchase_with_stock_atomic(
  p_business_id uuid,
  p_branch_id uuid,
  p_supplier_id uuid,
  p_supplier_name text,
  p_purchase_date date,
  p_items jsonb, -- Array of { raw_material_id: uuid | null, item_name: text, quantity: numeric, price: numeric, unit: text | null }
  p_idempotency_key text default null
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
    if not exists (select 1 from suppliers where id = p_supplier_id and business_id = p_business_id) then
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

  -- 4. Hitung Total Pembelian
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

  -- 5. Insert Header Pembelian
  insert into purchases (
    id,
    business_id,
    branch_id,
    supplier_id,
    supplier,
    purchase_date,
    total
  )
  values (
    case when p_idempotency_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then p_idempotency_key::uuid
      else gen_random_uuid()
    end,
    p_business_id,
    p_branch_id,
    p_supplier_id,
    p_supplier_name,
    p_purchase_date,
    v_total
  )
  returning id into v_purchase_id;

  -- 6. Insert Purchase Items & Mutasi Stok Atomik
  for v_item in select * from jsonb_to_recordset(p_items) as x(
    raw_material_id uuid,
    item_name text,
    quantity numeric,
    price numeric,
    unit text
  )
  loop
    v_item_subtotal := round(v_item.quantity * v_item.price, 2);

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
      v_item.raw_material_id,
      v_item.item_name,
      v_item.quantity,
      v_item.price,
      v_item_subtotal,
      v_item.unit
    );

    -- Jika terhubung ke master bahan baku, mutasikan stok cabang secara otomatis
    if v_item.raw_material_id is not null then
      -- Validasi kepemilikan bahan baku
      if not exists (
        select 1 from raw_materials
        where id = v_item.raw_material_id and business_id = p_business_id
      ) then
        raise exception 'Bahan baku ID % tidak valid untuk bisnis ini.', v_item.raw_material_id;
      end if;

      -- Eksekusi mutasi stok purchase_in
      perform record_inventory_mutation_atomic(
        p_business_id,
        p_branch_id,
        v_item.raw_material_id,
        'purchase_in',
        v_item.quantity,
        'Pembelian #' || substr(v_purchase_id::text, 1, 8),
        v_purchase_id::text,
        'purchase_in_' || v_purchase_id::text || '_' || v_item.raw_material_id::text
      );

      -- Perbarui cost_per_unit referensi master bahan (opsional namun bermanfaat untuk HPP)
      update raw_materials
      set cost_per_unit = v_item.price,
          updated_at = now()
      where id = v_item.raw_material_id and business_id = p_business_id;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'total', v_total
  );
end;
$$;

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
alter table suppliers enable row level security;
alter table raw_materials enable row level security;
alter table raw_material_branch_stocks enable row level security;
alter table inventory_mutations enable row level security;

-- SUPPLIERS
drop policy if exists "suppliers_select" on suppliers;
create policy "suppliers_select" on suppliers
  for select using (business_id = auth_business_id());

drop policy if exists "suppliers_insert" on suppliers;
create policy "suppliers_insert" on suppliers
  for insert with check (business_id = auth_business_id() and auth_is_owner());

drop policy if exists "suppliers_update" on suppliers;
create policy "suppliers_update" on suppliers
  for update using (business_id = auth_business_id() and auth_is_owner());

drop policy if exists "suppliers_delete" on suppliers;
create policy "suppliers_delete" on suppliers
  for delete using (business_id = auth_business_id() and auth_is_owner());

-- RAW_MATERIALS
drop policy if exists "raw_materials_select" on raw_materials;
create policy "raw_materials_select" on raw_materials
  for select using (business_id = auth_business_id());

drop policy if exists "raw_materials_insert" on raw_materials;
create policy "raw_materials_insert" on raw_materials
  for insert with check (business_id = auth_business_id() and auth_is_owner());

drop policy if exists "raw_materials_update" on raw_materials;
create policy "raw_materials_update" on raw_materials
  for update using (business_id = auth_business_id() and auth_is_owner());

drop policy if exists "raw_materials_delete" on raw_materials;
create policy "raw_materials_delete" on raw_materials
  for delete using (business_id = auth_business_id() and auth_is_owner());

-- RAW_MATERIAL_BRANCH_STOCKS
drop policy if exists "rmbs_select" on raw_material_branch_stocks;
create policy "rmbs_select" on raw_material_branch_stocks
  for select using (
    business_id = auth_business_id() and (
      auth_is_owner() or
      branch_id = auth_branch_id() or
      auth_branch_id() is null
    )
  );

drop policy if exists "rmbs_insert" on raw_material_branch_stocks;
create policy "rmbs_insert" on raw_material_branch_stocks
  for insert with check (business_id = auth_business_id() and auth_is_owner());

drop policy if exists "rmbs_update" on raw_material_branch_stocks;
create policy "rmbs_update" on raw_material_branch_stocks
  for update using (business_id = auth_business_id() and auth_is_owner());

drop policy if exists "rmbs_delete" on raw_material_branch_stocks;
create policy "rmbs_delete" on raw_material_branch_stocks
  for delete using (business_id = auth_business_id() and auth_is_owner());

-- INVENTORY_MUTATIONS
drop policy if exists "inventory_mutations_select" on inventory_mutations;
create policy "inventory_mutations_select" on inventory_mutations
  for select using (
    business_id = auth_business_id() and (
      auth_is_owner() or
      branch_id = auth_branch_id() or
      auth_branch_id() is null
    )
  );

drop policy if exists "inventory_mutations_insert" on inventory_mutations;
create policy "inventory_mutations_insert" on inventory_mutations
  for insert with check (
    business_id = auth_business_id() and (
      auth_is_owner() or
      branch_id = auth_branch_id() or
      auth_branch_id() is null
    )
  );

-- GRANTS
grant select on suppliers, raw_materials, raw_material_branch_stocks, inventory_mutations to authenticated;
grant insert, update, delete on suppliers, raw_materials, raw_material_branch_stocks to authenticated;
grant insert on inventory_mutations to authenticated;
grant execute on function record_inventory_mutation_atomic to authenticated;
grant execute on function record_purchase_with_stock_atomic to authenticated;
