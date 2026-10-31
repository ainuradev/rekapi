-- 0026_global_stock_and_auto_purchase_materials.sql
-- 1. Tambah kolom stock (Stok Induk / Global) pada tabel raw_materials
-- 2. Update fungsi record_purchase_with_stock_atomic agar otomatis mencatat bahan baku baru jika belum tersedia

-- 1. Kolom stock pada raw_materials
alter table raw_materials 
  add column if not exists stock numeric(12,2) not null default 0 check (stock >= 0);

-- 2. Update RPC record_purchase_with_stock_atomic
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
  v_mat_id uuid;
  v_mat_name text;
  v_mat_unit text;
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

  return jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'total', v_total
  );
end;
$$;
