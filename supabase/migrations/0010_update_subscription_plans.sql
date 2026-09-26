-- Update subscription plans with new pricing and features
-- Standard (149k), Business (249k), Pro (499k) - all 28 days duration

-- First, delete existing plans
DELETE FROM subscriptions;
delete from subscription_plans;

-- Insert new plans with updated pricing and features
insert into subscription_plans (code, name, price, max_branches) values
  ('standard', 'Standard', 149000, 3),
  ('business', 'Business', 249000, 5),
  ('pro', 'Pro', 499000, null); -- unlimited branches

-- Add subscription_plan_id to businesses table to track which plan they subscribed to
alter table businesses add column if not exists subscription_plan_id uuid references subscription_plans(id);

-- Add subscription_expires_at to businesses table
alter table businesses add column if not exists subscription_expires_at timestamptz;

-- Update subscriptions table - add updated_at if not exists
alter table subscriptions add column if not exists updated_at timestamptz not null default now();

-- Update payment_transactions table indexes for better performance
create index if not exists idx_payment_tx_order on payment_transactions (midtrans_order_id);
create index if not exists idx_subscriptions_business on subscriptions (business_id);
