-- ================================================================
-- Migration 0033: Direct Branch Stock Architecture & Employee Branch Stock RLS
--
-- Keputusan Arsitektur (Direct Branch Stock — Tanpa Gudang Induk Terpisah):
-- 1. Sumber kebenaran stok fisik produk berada di `product_branch_stocks`.
--    Kolom `products.stock` murni berfungsi sebagai agregat total (`SUM(stock)`
--    dari seluruh cabang produk tersebut).
-- 2. Saat produk baru dibuat dengan stok awal N, nilai N HANYA dimasukkan ke
--    1 cabang utama/pertama (atau cabang pegawai pembuat), sedangkan cabang lain
--    diinisialisasi 0 sehingga `SUM(product_branch_stocks.stock) = products.stock = N`.
-- 3. Saat cabang baru ditambahkan, stok produk yang sudah memiliki baris stok cabang
--    diinisialisasi 0 pada cabang baru (tidak menggandakan `products.stock`).
-- 4. Penjualan, edit, void, maupun perubahan stok cabang selalu menjaga
--    `products.stock = SUM(product_branch_stocks.stock)` melalui trigger sinkronisasi.
-- 5. Pegawai diizinkan mengatur stok di cabangnya sendiri melalui RLS & RPC atomik,
--    namun tetap ditolak keras mengubah stok cabang lain.
-- ================================================================

begin;

-- 1. TRIGGER SINKRONISASI AGREGAT OTOMATIS: products.stock = SUM(product_branch_stocks.stock)
create or replace function fn_sync_product_aggregate_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
begin
  v_product_id := coalesce(new.product_id, old.product_id);

  if v_product_id is not null then
    update products
      set stock = coalesce((
            select sum(greatest(pbs.stock, 0))
            from product_branch_stocks pbs
            where pbs.product_id = v_product_id
          ), 0),
          updated_at = now()
    where id = v_product_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_product_aggregate_stock on product_branch_stocks;
create trigger trg_sync_product_aggregate_stock
  after insert or update of stock or delete on product_branch_stocks
  for each row
  execute function fn_sync_product_aggregate_stock();

-- 2. PERBARUI INISIALISASI STOK PRODUK BARU: HANYA 1 CABANG UTAMA MENDAPAT STOK AWAL N, CABANG LAIN = 0
create or replace function fn_init_product_branch_stocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preferred_branch_id uuid;
begin
  -- Jika pembuat produk terikat pada cabang spesifik milik bisnis yang sama, prioritaskan cabang tersebut
  if auth.uid() is not null then
    select p.branch_id
    into v_preferred_branch_id
    from profiles p
    join branches b on b.id = p.branch_id and b.business_id = new.business_id
    where p.id = auth.uid()
      and p.business_id = new.business_id
    limit 1;
  end if;

  insert into product_branch_stocks (business_id, product_id, branch_id, stock)
  select
    new.business_id,
    new.id,
    b.id,
    case
      when row_number() over (
        order by
          case when v_preferred_branch_id is not null and b.id = v_preferred_branch_id then 0 else 1 end asc,
          b.created_at asc,
          b.id asc
      ) = 1
      then greatest(coalesce(new.stock, 0), 0)
      else 0
    end
  from branches b
  where b.business_id = new.business_id
  on conflict (product_id, branch_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_init_product_branch_stocks on products;
create trigger trg_init_product_branch_stocks
  after insert on products
  for each row
  execute function fn_init_product_branch_stocks();

-- 3. PERBARUI INISIALISASI SAAT CABANG BARU DIBUAT: JANGAN GANDAKAN STOK KE CABANG BARU
create or replace function fn_init_branch_product_stocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into product_branch_stocks (business_id, product_id, branch_id, stock)
  select
    new.business_id,
    p.id,
    new.id,
    case
      when exists (
        select 1 from product_branch_stocks pbs where pbs.product_id = p.id
      ) then 0
      else greatest(coalesce(p.stock, 0), 0)
    end
  from products p
  where p.business_id = new.business_id
  on conflict (product_id, branch_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_init_branch_product_stocks on branches;
create trigger trg_init_branch_product_stocks
  after insert on branches
  for each row
  execute function fn_init_branch_product_stocks();

-- 4. SELARASKAN PEMOTONGAN & PEMULIHAN PENJUALAN DENGAN AGREGAT OTOMATIS
--    Jika produk memiliki baris di product_branch_stocks, mutasi dilakukan pada product_branch_stocks
--    dan trigger trg_sync_product_aggregate_stock menyinkronkan products.stock secara otomatis
--    (mencegah pemotongan/pemulihan ganda pada products.stock).
create or replace function fn_deduct_stock_on_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_sale_status text;
  v_current_branch_stock numeric(10,2);
  v_current_global_stock numeric(10,2);
  v_branch_deducted numeric(10,2) := 0;
  v_global_deducted numeric(10,2) := 0;
  v_has_branch_row boolean := false;
begin
  select branch_id, coalesce(status, 'completed')
  into v_branch_id, v_sale_status
  from sales
  where id = new.sale_id;

  if v_sale_status = 'voided' then
    raise exception 'Tidak dapat menambahkan item ke transaksi yang telah dibatalkan (voided).'
      using errcode = 'P0001';
  end if;

  if v_branch_id is not null then
    select stock into v_current_branch_stock
    from product_branch_stocks
    where product_id = new.product_id
      and branch_id = v_branch_id
    for update;

    if found then
      v_has_branch_row := true;
      v_branch_deducted := greatest(least(coalesce(v_current_branch_stock, 0), new.quantity), 0);
      v_global_deducted := v_branch_deducted;

      if v_branch_deducted > 0 then
        update product_branch_stocks
          set stock = stock - v_branch_deducted,
              updated_at = now()
        where product_id = new.product_id
          and branch_id = v_branch_id;
        -- trg_sync_product_aggregate_stock otomatis menyinkronkan products.stock = SUM(stock)
      end if;
    end if;
  end if;

  -- Fallback hanya untuk produk lama yang belum memiliki baris di product_branch_stocks
  if not v_has_branch_row then
    select stock into v_current_global_stock
    from products
    where id = new.product_id
    for update;

    if found then
      v_global_deducted := greatest(least(coalesce(v_current_global_stock, 0), new.quantity), 0);
      if v_global_deducted > 0 then
        update products
          set stock = stock - v_global_deducted,
              updated_at = now()
        where id = new.product_id;
      end if;
    end if;
  end if;

  new.branch_stock_deducted := v_branch_deducted;
  new.global_stock_deducted := v_global_deducted;

  return new;
end;
$$;

drop trigger if exists trg_deduct_stock_on_sale on sale_items;
create trigger trg_deduct_stock_on_sale
  before insert on sale_items
  for each row
  execute function fn_deduct_stock_on_sale();

create or replace function fn_restore_stock_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_sale_status text;
  v_branch_restore numeric(10,2);
  v_global_restore numeric(10,2);
  v_has_branch_row boolean := false;
begin
  select branch_id, coalesce(status, 'completed')
  into v_branch_id, v_sale_status
  from sales
  where id = old.sale_id;

  if v_sale_status = 'voided' then
    return old;
  end if;

  v_branch_restore := greatest(coalesce(old.branch_stock_deducted, old.quantity), 0);
  v_global_restore := greatest(coalesce(old.global_stock_deducted, old.quantity), 0);

  if v_branch_id is not null then
    perform 1
    from product_branch_stocks
    where product_id = old.product_id
      and branch_id = v_branch_id
    for update;

    if found then
      v_has_branch_row := true;
      if v_branch_restore > 0 then
        update product_branch_stocks
          set stock = stock + v_branch_restore,
              updated_at = now()
        where product_id = old.product_id
          and branch_id = v_branch_id;
        -- trg_sync_product_aggregate_stock otomatis menyinkronkan products.stock = SUM(stock)
      end if;
    end if;
  end if;

  if not v_has_branch_row and v_global_restore > 0 then
    update products
      set stock = stock + v_global_restore,
          updated_at = now()
    where id = old.product_id;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_restore_stock_on_delete on sale_items;
create trigger trg_restore_stock_on_delete
  after delete on sale_items
  for each row
  execute function fn_restore_stock_on_delete();

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
  v_caller_id uuid;
  v_caller_role text;
  v_branch_restore numeric(10,2);
  v_global_restore numeric(10,2);
  v_has_branch_row boolean;
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
          -- trg_sync_product_aggregate_stock otomatis menyinkronkan products.stock = SUM(stock)
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
    end if;
  end loop;

  update receivables
  set status = 'paid',
      notes = coalesce(notes, '') || ' [Dibatalkan / Void: ' || coalesce(p_reason, 'Transaksi dibatalkan') || ']',
      updated_at = now()
  where sale_id = p_sale_id and business_id = p_business_id;

  update sales
  set status = 'voided',
      voided_at = now(),
      voided_by = v_caller_id,
      void_reason = p_reason,
      updated_at = now()
  where id = p_sale_id;

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

revoke execute on function void_sale_atomic(uuid, uuid, uuid, text) from public;
grant execute on function void_sale_atomic(uuid, uuid, uuid, text) to authenticated, service_role;

-- 5. RPC ATOMIK PENGATURAN STOK CABANG LANGSUNG (OWNER SEMUA CABANG, PEGAWAI HANYA CABANG SENDIRI)
create or replace function set_product_branch_stock_atomic(
  p_product_id uuid,
  p_branch_id uuid,
  p_stock numeric(10,2)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_biz_id uuid;
  v_caller_branch_id uuid;
  v_caller_role text;
  v_clean_stock numeric(10,2);
  v_total_stock numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'Akses ditolak: Pengguna tidak terautentikasi.' using errcode = '42501';
  end if;

  if p_stock is null or p_stock < 0 then
    raise exception 'Stok produk tidak boleh negatif.' using errcode = '22003';
  end if;

  v_clean_stock := round(p_stock, 2);

  select business_id, branch_id, role
  into v_caller_biz_id, v_caller_branch_id, v_caller_role
  from profiles
  where id = auth.uid();

  if v_caller_biz_id is null then
    raise exception 'Profil bisnis pengguna tidak ditemukan.' using errcode = '42501';
  end if;

  -- Pegawai (non-owner) hanya berhak mengubah stok di cabangnya sendiri
  if v_caller_role <> 'owner' then
    if v_caller_branch_id is null or v_caller_branch_id <> p_branch_id then
      raise exception 'Akses ditolak: Anda hanya dapat mengatur stok di cabang tempat Anda ditugaskan.'
        using errcode = '42501';
    end if;
  end if;

  -- Validasi produk & cabang benar-benar milik bisnis pengguna
  if not exists (
    select 1 from products where id = p_product_id and business_id = v_caller_biz_id
  ) then
    raise exception 'Produk tidak ditemukan pada bisnis Anda.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from branches where id = p_branch_id and business_id = v_caller_biz_id
  ) then
    raise exception 'Cabang tidak ditemukan pada bisnis Anda.' using errcode = 'P0002';
  end if;

  insert into product_branch_stocks (
    business_id,
    product_id,
    branch_id,
    stock,
    updated_at
  ) values (
    v_caller_biz_id,
    p_product_id,
    p_branch_id,
    v_clean_stock,
    now()
  )
  on conflict (product_id, branch_id)
  do update set
    stock = excluded.stock,
    updated_at = now();

  -- trg_sync_product_aggregate_stock otomatis menyinkronkan products.stock
  select coalesce(stock, 0)
  into v_total_stock
  from products
  where id = p_product_id;

  return jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'branch_id', p_branch_id,
    'branch_stock', v_clean_stock,
    'total_stock', v_total_stock
  );
end;
$$;

revoke execute on function set_product_branch_stock_atomic(uuid, uuid, numeric) from public;
grant execute on function set_product_branch_stock_atomic(uuid, uuid, numeric) to authenticated, service_role;

-- 6. PERBAIKAN RLS PADA product_branch_stocks AGAR PEGAWAI DAPAT MENGELOLA CABANGNYA SENDIRI
alter table product_branch_stocks enable row level security;

drop policy if exists "owner manage branch stocks" on product_branch_stocks;
create policy "owner manage branch stocks" on product_branch_stocks
  for all
  using (business_id = auth_business_id() and auth_is_owner())
  with check (business_id = auth_business_id() and auth_is_owner());

drop policy if exists "employee insert own branch stocks" on product_branch_stocks;
create policy "employee insert own branch stocks" on product_branch_stocks
  for insert
  with check (
    business_id = auth_business_id()
    and not auth_is_owner()
    and auth_branch_id() is not null
    and branch_id = auth_branch_id()
    and stock >= 0
    and exists (
      select 1 from products p
      where p.id = product_branch_stocks.product_id
        and p.business_id = auth_business_id()
    )
    and exists (
      select 1 from branches b
      where b.id = product_branch_stocks.branch_id
        and b.business_id = auth_business_id()
    )
  );

drop policy if exists "employee update own branch stocks" on product_branch_stocks;
create policy "employee update own branch stocks" on product_branch_stocks
  for update
  using (
    business_id = auth_business_id()
    and not auth_is_owner()
    and auth_branch_id() is not null
    and branch_id = auth_branch_id()
  )
  with check (
    business_id = auth_business_id()
    and not auth_is_owner()
    and auth_branch_id() is not null
    and branch_id = auth_branch_id()
    and stock >= 0
  );

-- 7. REKONSILIASI AGREGAT DATA EKSISTING: Sinkronkan products.stock = SUM(product_branch_stocks.stock)
--    untuk produk yang sudah memiliki baris di product_branch_stocks
update products p
set stock = sub.total_stock,
    updated_at = now()
from (
  select product_id, coalesce(sum(greatest(stock, 0)), 0) as total_stock
  from product_branch_stocks
  group by product_id
) sub
where p.id = sub.product_id
  and p.stock is distinct from sub.total_stock;

commit;

