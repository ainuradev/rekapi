-- =========================================================
-- UMKM OS — Reporting Views & Trial Expiry Job
-- =========================================================

-- ---------- VIEW: laba kotor per transaksi penjualan ----------
-- Dipakai sebagai basis semua rekap (harian/mingguan/bulanan).
create or replace view v_sale_profit as
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
group by s.id, s.business_id, s.branch_id, s.transaction_date, s.channel, s.payment_method, s.total;

-- ---------- VIEW: rekap harian per cabang ----------
create or replace view v_daily_recap as
select
  business_id,
  branch_id,
  date(transaction_date) as tanggal,
  sum(omzet) as omzet,
  sum(hpp) as hpp,
  sum(laba_kotor) as laba_kotor
from v_sale_profit
group by business_id, branch_id, date(transaction_date);

-- Catatan: pengeluaran (expenses + purchases non-HPP) dijumlahkan terpisah
-- di layer aplikasi/query laporan, lalu dikurangkan dari laba_kotor untuk
-- dapat laba/rugi operasional final. Contoh query di layer Next.js:
--
--   laba_rugi_final = sum(v_daily_recap.laba_kotor)
--                    - sum(expenses.amount where category != pembelian-terkait)
--
-- (purchases sudah otomatis masuk cost_price di sale_items via HPP snapshot,
--  jadi jangan dijumlahkan dua kali dengan expenses kategori bahan baku)

-- =========================================================
-- TRIAL EXPIRY — via pg_cron (aktifkan extension dulu di Supabase dashboard)
-- =========================================================
create extension if not exists pg_cron;

create or replace function expire_trials()
returns void
language plpgsql
security definer
as $$
begin
  update businesses
  set subscription_status = 'expired'
  where subscription_status = 'trial'
    and trial_ends_at < now();

  update subscriptions
  set status = 'expired'
  where status = 'trial'
    and expires_at < now();
end;
$$;

-- Jalankan tiap jam
select cron.schedule(
  'expire-trials-hourly',
  '0 * * * *',
  $$select expire_trials();$$
);