-- Migration 0044: Fix RLS policy on public.system_notifications
-- Avoid querying auth.users directly in RLS policy (which causes 42501 permission denied for role authenticated).
-- Use auth.jwt() ->> 'email' instead.

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

-- Bersihkan notifikasi testing/dummy
DELETE FROM public.system_notifications
WHERE title IN ('askldhasd', 'langganan woi', 'temoek');


