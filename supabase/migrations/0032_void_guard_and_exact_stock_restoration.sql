-- ================================================================
-- Migration 0032: Voided Sale Edit Guard & Exact Stock Restoration
--
-- Tujuan:
-- 1. Mencegah transaksi yang sudah dibatalkan (status = 'voided') diedit kembali
--    baik melalui RPC update_sale_atomic, trigger sale_items, maupun RLS langsung,
--    sehingga stok tidak pernah dikembalikan dua kali.
-- 2. Mencegah Phantom Stock (penggelembungan stok fiktif) ketika terjadi oversell
--    (stok < qty penjualan yang di-clamp ke 0) lalu transaksi di-void atau diedit:
--    - Mencatat jumlah stok yang benar-benar terpotong pada sale_items
--      (branch_stock_deducted & global_stock_deducted).
--    - Saat void atau edit (delete sale_items), hanya mengembalikan sebesar stok
--      aktual yang benar-benar terpotong (fallback ke quantity untuk data historis lama).
-- ================================================================

begin;

-- 1. Tambah kolom pelacak stok aktual yang terpotong pada sale_items
--    Nullable agar baris historis sebelum migrasi tetap kompatibel (fallback ke quantity).
alter table sale_items
  add column if not exists branch_stock_deducted numeric(10,2),
  add column if not exists global_stock_deducted numeric(10,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_sale_items_branch_stock_deducted_nonneg'
  ) then
    alter table sale_items
      add constraint chk_sale_items_branch_stock_deducted_nonneg
      check (branch_stock_deducted is null or branch_stock_deducted >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_sale_items_global_stock_deducted_nonneg'
  ) then
    alter table sale_items
      add constraint chk_sale_items_global_stock_deducted_nonneg
      check (global_stock_deducted is null or global_stock_deducted >= 0);
  end if;
end $$;

-- 2. TRIGGER PEMOTONGAN STOK SAAT PENJUALAN (BEFORE INSERT ON sale_items)
--    Menghitung dan menyimpan jumlah stok yang benar-benar terpotong secara presisi
--    dengan row-level lock (FOR UPDATE) agar bebas race condition dan bebas phantom stock.
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
begin
  select branch_id, coalesce(status, 'completed')
  into v_branch_id, v_sale_status
  from sales
  where id = new.sale_id;

  if v_sale_status = 'voided' then
    raise exception 'Tidak dapat menambahkan item ke transaksi yang telah dibatalkan (voided).'
      using errcode = 'P0001';
  end if;

  -- Potong stok cabang (jika branch_id tersedia dan baris stok cabang ada)
  if v_branch_id is not null then
    select stock into v_current_branch_stock
    from product_branch_stocks
    where product_id = new.product_id
      and branch_id = v_branch_id
    for update;

    if found then
      v_branch_deducted := greatest(least(coalesce(v_current_branch_stock, 0), new.quantity), 0);
      if v_branch_deducted > 0 then
        update product_branch_stocks
          set stock = stock - v_branch_deducted,
              updated_at = now()
        where product_id = new.product_id
          and branch_id = v_branch_id;
      end if;
    end if;
  end if;

  -- Potong stok produk induk/agregat (backward-compatible)
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

-- 3. TRIGGER PEMULIHAN STOK SAAT ITEM DIHAPUS / EDIT TRANSAKSI (AFTER DELETE ON sale_items)
--    - Mengabaikan pemulihan jika header transaksi sudah berstatus 'voided' (sudah dipulihkan saat void).
--    - Hanya mengembalikan sebesar *_stock_deducted yang benar-benar terpotong saat penjualan terjadi.
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
begin
  select branch_id, coalesce(status, 'completed')
  into v_branch_id, v_sale_status
  from sales
  where id = old.sale_id;

  -- Jika transaksi sudah voided, stok telah dikembalikan oleh void_sale_atomic
  if v_sale_status = 'voided' then
    return old;
  end if;

  v_branch_restore := greatest(coalesce(old.branch_stock_deducted, old.quantity), 0);
  v_global_restore := greatest(coalesce(old.global_stock_deducted, old.quantity), 0);

  if v_branch_id is not null and v_branch_restore > 0 then
    update product_branch_stocks
      set stock = stock + v_branch_restore,
          updated_at = now()
    where product_id = old.product_id
      and branch_id = v_branch_id;
  end if;

  if v_global_restore > 0 then
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

-- 4. PERBARUI RPC UPDATE_SALE_ATOMIC: KUNCI BARIS SALES & TOLak EDIT TRANSAKSI VOIDED
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
  v_item record;
begin
  -- Otorisasi Pemanggil di level database (Anti Bypass)
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

  -- 1. Kunci baris transaksi (FOR UPDATE) dan validasi isolasi tenant + status voided
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

  -- Jika pemanggil adalah pegawai, hanya boleh mengedit transaksi di cabangnya sendiri
  if v_caller_role = 'pegawai' and v_caller_branch_id is not null and v_caller_branch_id <> v_current_branch_id then
    raise exception 'Akses ditolak: Pegawai hanya dapat mengedit transaksi di cabang sendiri.' using errcode = '42501';
  end if;

  -- 2. Update header penjualan
  update sales
  set channel = p_channel,
      payment_method = p_payment_method,
      total = p_total,
      is_edited = true,
      updated_at = now()
  where id = p_sale_id;

  -- 3. Hapus item lama (trigger fn_restore_stock_on_delete mengembalikan stok aktual yang dulu terpotong)
  delete from sale_items
  where sale_id = p_sale_id;

  -- 4. Masukkan item baru secara terurut berdasarkan product_id (mencegah deadlock multi-item)
  for v_item in
    select *
    from jsonb_to_recordset(p_items) as (
      product_id uuid,
      quantity numeric(10,2),
      price numeric(12,2),
      cost_price numeric(12,2),
      subtotal numeric(12,2)
    )
    order by product_id
  loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Kuantitas item harus lebih besar dari 0.' using errcode = '22003';
    end if;

    if not exists (select 1 from products where id = v_item.product_id and business_id = p_business_id) then
      raise exception 'Produk % tidak terdaftar pada bisnis Anda.', v_item.product_id using errcode = 'P0002';
    end if;

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

  -- 5. Catat jejak audit pengeditan
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

-- 5. PERBARUI RPC VOID_SALE_ATOMIC: HANYA PULIHKAN STOK AKTUAL YANG TERPOTONG & NOLKAN SISA DEDUCTED
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
begin
  -- 1. Otorisasi ketat (Owner-only)
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

  -- 3. Kembalikan stok tepat sebesar stok aktual yang benar-benar terpotong saat penjualan
  for v_item in
    select id, product_id, quantity, branch_stock_deducted, global_stock_deducted
    from sale_items
    where sale_id = p_sale_id
    order by product_id
  loop
    v_branch_restore := greatest(coalesce(v_item.branch_stock_deducted, v_item.quantity), 0);
    v_global_restore := greatest(coalesce(v_item.global_stock_deducted, v_item.quantity), 0);

    if v_sale.branch_id is not null and v_branch_restore > 0 then
      update product_branch_stocks
      set stock = stock + v_branch_restore,
          updated_at = now()
      where product_id = v_item.product_id
        and branch_id = v_sale.branch_id;
    end if;

    if v_global_restore > 0 then
      update products
      set stock = stock + v_global_restore,
          updated_at = now()
      where id = v_item.product_id;
    end if;
  end loop;

  -- Tandai stok item telah dikembalikan penuh (0 tersisa) agar mustahil pulih dua kali
  update sale_items
  set branch_stock_deducted = 0,
      global_stock_deducted = 0
  where sale_id = p_sale_id;

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

  -- 5. Batalkan piutang terkait di tabel receivables
  update receivables
  set status = 'paid',
      notes = coalesce(notes, '') || ' [Dibatalkan / Void: ' || coalesce(p_reason, 'Transaksi dibatalkan') || ']',
      updated_at = now()
  where sale_id = p_sale_id and business_id = p_business_id;

  -- 6. Ubah status penjualan menjadi voided (TIDAK DIHAPUS DARI DATABASE)
  update sales
  set status = 'voided',
      voided_at = now(),
      voided_by = v_caller_id,
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

-- 6. PERKUAT RLS POLICIES: TOLAK UPDATE / DELETE ITEM PADA TRANSAKSI VOIDED SECARA LANGSUNG
drop policy if exists "update sales in tenant" on sales;
create policy "update sales in tenant" on sales
  for update
  using (
    business_id = auth_business_id()
    and (auth_is_owner() or branch_id = auth_branch_id())
    and coalesce(status, 'completed') <> 'voided'
  )
  with check (
    business_id = auth_business_id()
    and (auth_is_owner() or branch_id = auth_branch_id())
    and coalesce(status, 'completed') <> 'voided'
  );

drop policy if exists "delete sale_items via sale" on sale_items;
create policy "delete sale_items via sale" on sale_items
  for delete using (
    exists (
      select 1 from sales s
      where s.id = sale_items.sale_id
        and s.business_id = auth_business_id()
        and (auth_is_owner() or s.branch_id = auth_branch_id())
        and coalesce(s.status, 'completed') <> 'voided'
    )
  );

commit;

