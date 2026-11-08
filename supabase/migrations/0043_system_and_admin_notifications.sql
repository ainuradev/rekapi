-- Migration 0043: System & Super Admin Broadcast Notifications
-- 1. Table public.system_notifications
CREATE TABLE IF NOT EXISTS public.system_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  category text NOT NULL DEFAULT 'announcement',
  action_url text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Check constraint on category
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_notifications_category_check'
  ) THEN
    ALTER TABLE public.system_notifications
      ADD CONSTRAINT system_notifications_category_check
      CHECK (category IN ('announcement', 'subscription', 'maintenance', 'promo', 'feature', 'system'));
  END IF;
END $$;

-- 2. Table public.notification_reads
CREATE TABLE IF NOT EXISTS public.notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.system_notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_reads_unique_user_notif UNIQUE(notification_id, user_id)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_system_notifications_business_id ON public.system_notifications(business_id);
CREATE INDEX IF NOT EXISTS idx_system_notifications_created_at ON public.system_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_reads_user_id ON public.notification_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_reads_notif_user ON public.notification_reads(notification_id, user_id);

-- 4. Enable RLS
ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for system_notifications
DROP POLICY IF EXISTS "system_notifications_select" ON public.system_notifications;
CREATE POLICY "system_notifications_select"
  ON public.system_notifications
  FOR SELECT
  TO authenticated
  USING (
    business_id IS NULL 
    OR business_id IN (
      SELECT business_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "system_notifications_admin_all" ON public.system_notifications;
CREATE POLICY "system_notifications_admin_all"
  ON public.system_notifications
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt() ->> 'email') IN ('admin@rekapi.id', 'owner-a@rekapi-staging.test', 'admin@rekapi.com', 'admin@rekapin.com')
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') IN ('admin@rekapi.id', 'owner-a@rekapi-staging.test', 'admin@rekapi.com', 'admin@rekapin.com')
  );

-- 6. RLS Policies for notification_reads
DROP POLICY IF EXISTS "notification_reads_select" ON public.notification_reads;
CREATE POLICY "notification_reads_select"
  ON public.notification_reads
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_reads_insert" ON public.notification_reads;
CREATE POLICY "notification_reads_insert"
  ON public.notification_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_reads_delete" ON public.notification_reads;
CREATE POLICY "notification_reads_delete"
  ON public.notification_reads
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

