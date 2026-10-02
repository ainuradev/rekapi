-- ================================================================
-- 0012: Add 'pending' to subscription_status enum
-- Fix: subscription records created during payment should use
-- 'pending' instead of 'trial' to avoid being expired by cron.
-- ================================================================

-- Add 'pending' value to the subscription_status enum
alter type subscription_status add value if not exists 'pending';
