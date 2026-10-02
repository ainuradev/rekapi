-- ================================================================
-- 0011: Make subscription plan limits fully DB-driven
-- Adds configurable feature flags and limits to subscription_plans
-- so nothing is hard-coded in application code.
-- ================================================================

alter table subscription_plans
    add column if not exists max_employees int default null,            -- null = unlimited
    add column if not exists can_advanced_reports boolean not null default false,
    add column if not exists can_api_access boolean not null default false,
    add column if not exists duration_days int not null default 28,
    add column if not exists description text,
    add column if not exists features jsonb;  -- array of strings for UI display

-- Populate existing 3 plans
update subscription_plans set
    max_employees     = null,
    can_advanced_reports = false,
    can_api_access    = false,
    duration_days     = 28,
    description       = 'Cocok untuk bisnis dengan 1 cabang',
    features          = '["Semua fitur kasir POS","Maksimal 1 cabang","Laporan harian & mingguan","Export CSV","Support standar"]'::jsonb
where code = 'standard';

update subscription_plans set
    max_employees     = null,
    can_advanced_reports = true,
    can_api_access    = false,
    duration_days     = 28,
    description       = 'Untuk bisnis yang mulai berkembang',
    features          = '["Semua fitur Standard","Maksimal 3 cabang","Laporan advanced & HPP","Export Excel","Support prioritas"]'::jsonb
where code = 'business';

update subscription_plans set
    max_employees     = null,
    can_advanced_reports = true,
    can_api_access    = true,
    duration_days     = 28,
    description       = 'Skala besar tanpa batas cabang',
    features          = '["Semua fitur Business","Cabang tidak terbatas","Akses API","Support prioritas 24/7"]'::jsonb
where code = 'pro';
