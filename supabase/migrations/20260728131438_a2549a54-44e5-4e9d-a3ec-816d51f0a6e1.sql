CREATE SEQUENCE IF NOT EXISTS public.refund_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.task_number_seq;

CREATE OR REPLACE FUNCTION public.next_refund_number()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'RFD-' || to_char(now() AT TIME ZONE 'Asia/Makassar','YYYYMMDD') || '-' ||
         lpad(nextval('public.refund_number_seq')::text, 6, '0');
$$;
CREATE OR REPLACE FUNCTION public.next_task_number()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'TSK-' || lpad(nextval('public.task_number_seq')::text, 7, '0');
$$;
REVOKE EXECUTE ON FUNCTION public.next_refund_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_task_number() FROM PUBLIC, anon, authenticated;

-- ============ digital_entitlements ============
CREATE TABLE public.digital_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_item_id uuid NOT NULL UNIQUE REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.digital_products(id) ON DELETE RESTRICT,
  file_version text,
  download_limit integer NOT NULL DEFAULT 5 CHECK (download_limit > 0),
  download_count integer NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_entitlements_user ON public.digital_entitlements (user_id);
GRANT SELECT ON public.digital_entitlements TO authenticated;
GRANT ALL ON public.digital_entitlements TO service_role;
ALTER TABLE public.digital_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY entitlements_select_own ON public.digital_entitlements FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY entitlements_select_staff ON public.digital_entitlements FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'orders.view'));
CREATE TRIGGER entitlements_set_updated_at BEFORE UPDATE ON public.digital_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ download_logs ============
CREATE TABLE public.download_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES public.digital_entitlements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  file_id uuid REFERENCES public.digital_product_files(id) ON DELETE SET NULL,
  ip text,
  user_agent text,
  downloaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_download_logs_entitlement ON public.download_logs (entitlement_id);
GRANT SELECT ON public.download_logs TO authenticated;
GRANT ALL ON public.download_logs TO service_role;
ALTER TABLE public.download_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY download_logs_select_own ON public.download_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY download_logs_select_staff ON public.download_logs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'orders.view'));

-- ============ operator_assignments ============
CREATE TABLE public.operator_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL,
  assigned_by uuid,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','accepted','in_progress','completed','released','cancelled')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  deadline_at timestamptz,
  internal_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_assignment_active_per_order ON public.operator_assignments (order_id)
  WHERE status IN ('assigned','accepted','in_progress');
CREATE INDEX idx_assignment_operator ON public.operator_assignments (operator_id, status);
GRANT SELECT ON public.operator_assignments TO authenticated;
GRANT ALL ON public.operator_assignments TO service_role;
ALTER TABLE public.operator_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY assignment_select_operator ON public.operator_assignments FOR SELECT TO authenticated USING (operator_id = auth.uid());
CREATE POLICY assignment_select_customer ON public.operator_assignments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = operator_assignments.order_id AND o.user_id = auth.uid()));
CREATE POLICY assignment_select_staff ON public.operator_assignments FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'orders.view'));
CREATE TRIGGER assignment_set_updated_at BEFORE UPDATE ON public.operator_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ refunds ============
CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_number text NOT NULL DEFAULT public.next_refund_number(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','under_review','information_requested','approved','processing','completed','rejected','cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  decision_note text,
  processing_reference text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (refund_number)
);
CREATE UNIQUE INDEX idx_refund_active_per_order ON public.refunds (order_id)
  WHERE status IN ('requested','under_review','information_requested','approved','processing');
GRANT SELECT ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY refunds_select_own ON public.refunds FOR SELECT TO authenticated USING (customer_id = auth.uid());
CREATE POLICY refunds_select_staff ON public.refunds FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'refunds.view'));
CREATE TRIGGER refunds_set_updated_at BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ admin_tasks ============
CREATE TABLE public.admin_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_number text NOT NULL DEFAULT public.next_task_number(),
  task_type text NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','blocked','completed','cancelled')),
  assignee_id uuid,
  created_by uuid,
  due_at timestamptz,
  completed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_number)
);
CREATE UNIQUE INDEX idx_task_active_unique ON public.admin_tasks (task_type, source_type, source_id)
  WHERE status IN ('open','in_progress','blocked');
CREATE INDEX idx_tasks_status_priority ON public.admin_tasks (status, priority);
CREATE INDEX idx_tasks_assignee ON public.admin_tasks (assignee_id, status);
GRANT SELECT ON public.admin_tasks TO authenticated;
GRANT ALL ON public.admin_tasks TO service_role;
ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tasks_select_staff ON public.admin_tasks FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'tasks.view'));
CREATE POLICY tasks_select_assignee ON public.admin_tasks FOR SELECT TO authenticated USING (assignee_id = auth.uid());
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.admin_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ notifications ============
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  related_type text,
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_recipient ON public.notifications (recipient_id, read_at, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid());
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

-- ============ pengaturan transaksi ============
INSERT INTO public.system_settings (key, value, description, is_public) VALUES
  ('order_number_prefix', '"EBS"'::jsonb, 'Awalan nomor order', false),
  ('order_expiry_hours', '24'::jsonb, 'Batas waktu pembayaran order (jam)', true),
  ('refund_window_days', '7'::jsonb, 'Batas waktu pengajuan refund setelah lunas (hari)', true),
  ('auto_cancel_unpaid', 'true'::jsonb, 'Batalkan otomatis order yang tidak dibayar', false),
  ('manual_payment_instruction', '"Transfer sesuai nominal tepat, lalu unggah bukti pembayaran."'::jsonb, 'Instruksi pembayaran manual', true),
  ('manual_payment_active', 'true'::jsonb, 'Metode pembayaran manual aktif', true),
  ('payment_provider_mode', '"sandbox"'::jsonb, 'Mode payment gateway', false),
  ('proof_reupload_limit', '3'::jsonb, 'Batas unggah ulang bukti pembayaran', false)
ON CONFLICT (key) DO NOTHING;

UPDATE public.system_settings SET value = '"FEBRYANUS TAMBING"'::jsonb WHERE key = 'manual_payment_holder';
UPDATE public.system_settings SET value = '"manual"'::jsonb WHERE key = 'payment_provider';