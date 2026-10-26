-- ============ M1: permissions ============
INSERT INTO public.permissions (key, group_name, description, is_transactional) VALUES
  ('orders.create',      'Transaksi', 'Membuat pesanan (checkout)', true),
  ('orders.cancel',      'Transaksi', 'Membatalkan pesanan', true),
  ('payments.reconcile', 'Transaksi', 'Rekonsiliasi pembayaran', true),
  ('refunds.reject',     'Transaksi', 'Menolak permintaan refund', true),
  ('refunds.process',    'Transaksi', 'Memproses dan menyelesaikan refund', true),
  ('tasks.assign',       'Operasional', 'Menugaskan task operasional', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('customer','orders.create'),
  ('customer','orders.cancel'),
  ('admin','orders.cancel'),
  ('admin','refunds.reject'),
  ('admin','tasks.assign'),
  ('finance','payments.reconcile'),
  ('finance','refunds.process'),
  ('admin','payments.reconcile'),
  ('admin','refunds.process')
ON CONFLICT DO NOTHING;

-- ============ Penomoran ============
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.payment_number_seq;

CREATE OR REPLACE FUNCTION public.next_order_number()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'EBS-' || to_char(now() AT TIME ZONE 'Asia/Makassar','YYYYMMDD') || '-' ||
         lpad(nextval('public.order_number_seq')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'INV-' || to_char(now() AT TIME ZONE 'Asia/Makassar','YYYYMMDD') || '-' ||
         lpad(nextval('public.invoice_number_seq')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION public.next_payment_number()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'PAY-' || to_char(now() AT TIME ZONE 'Asia/Makassar','YYYYMMDD') || '-' ||
         lpad(nextval('public.payment_number_seq')::text, 6, '0');
$$;

REVOKE EXECUTE ON FUNCTION public.next_order_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_payment_number() FROM PUBLIC, anon, authenticated;

-- ============ M2: orders ============
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL DEFAULT public.next_order_number(),
  user_id uuid NOT NULL,
  order_type text NOT NULL CHECK (order_type IN ('digital_product','service')),
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN (
    'draft','awaiting_payment','payment_under_review','paid','waiting_assignment','assigned',
    'waiting_customer_data','queued','in_progress','waiting_customer_review','completed',
    'cancelled','refund_requested','refund_processing','refunded','disputed')),
  currency text NOT NULL DEFAULT 'IDR',
  subtotal bigint NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total bigint NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  admin_fee bigint NOT NULL DEFAULT 0 CHECK (admin_fee >= 0),
  total bigint NOT NULL DEFAULT 0 CHECK (total >= 0),
  customer_note text,
  internal_note text,
  cancellation_reason text,
  expired_at timestamptz,
  paid_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_number)
);
CREATE INDEX idx_orders_user_status ON public.orders (user_id, status);
CREATE INDEX idx_orders_status_expired ON public.orders (status, expired_at);
CREATE INDEX idx_orders_created ON public.orders (created_at DESC);

GRANT SELECT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_select_own ON public.orders FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY orders_select_staff ON public.orders FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'orders.view'));

CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ order_items ============
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('digital_product','service','addon','fee')),
  product_id uuid REFERENCES public.digital_products(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  package_id uuid REFERENCES public.service_packages(id) ON DELETE SET NULL,
  addon_id uuid REFERENCES public.service_addons(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  sku_snapshot text,
  unit_price bigint NOT NULL CHECK (unit_price >= 0),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  discount bigint NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total bigint NOT NULL CHECK (total >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON public.order_items (order_id);

GRANT SELECT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_items_select_own ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid()));
CREATE POLICY order_items_select_staff ON public.order_items FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'orders.view'));

-- ============ service_order_details ============
CREATE TABLE public.service_order_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  package_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  addons_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  requirements_note text,
  estimated_days integer NOT NULL DEFAULT 3 CHECK (estimated_days >= 0),
  revision_allowance integer NOT NULL DEFAULT 1 CHECK (revision_allowance >= 0),
  customer_deadline timestamptz,
  internal_deadline timestamptz,
  requirements_complete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_order_details TO authenticated;
GRANT ALL ON public.service_order_details TO service_role;
ALTER TABLE public.service_order_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY sod_select_own ON public.service_order_details FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = service_order_details.order_id AND o.user_id = auth.uid()));
CREATE POLICY sod_select_staff ON public.service_order_details FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'orders.view'));
CREATE TRIGGER sod_set_updated_at BEFORE UPDATE ON public.service_order_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ invoices ============
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL DEFAULT public.next_invoice_number(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  billing_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  currency text NOT NULL DEFAULT 'IDR',
  subtotal bigint NOT NULL DEFAULT 0,
  discount bigint NOT NULL DEFAULT 0,
  admin_fee bigint NOT NULL DEFAULT 0,
  total bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('draft','issued','paid','cancelled','refunded')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_number)
);
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoices_select_own ON public.invoices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = invoices.order_id AND o.user_id = auth.uid()));
CREATE POLICY invoices_select_staff ON public.invoices FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'orders.view'));
CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ order_status_histories ============
CREATE TABLE public.order_status_histories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL,
  actor_id uuid,
  actor_type text NOT NULL DEFAULT 'system' CHECK (actor_type IN ('customer','admin','finance','operator','support','system')),
  public_note text,
  internal_note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_osh_order_created ON public.order_status_histories (order_id, created_at DESC);
GRANT SELECT ON public.order_status_histories TO authenticated;
GRANT ALL ON public.order_status_histories TO service_role;
ALTER TABLE public.order_status_histories ENABLE ROW LEVEL SECURITY;
CREATE POLICY osh_select_own ON public.order_status_histories FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_status_histories.order_id AND o.user_id = auth.uid()));
CREATE POLICY osh_select_staff ON public.order_status_histories FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'orders.view'));

-- ============ M3: payments ============
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL DEFAULT public.next_payment_number(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'manual',
  method text NOT NULL DEFAULT 'dana',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'draft','pending','waiting_payment','waiting_verification','paid','failed','expired',
    'rejected','cancelled','refund_requested','partially_refunded','refunded')),
  currency text NOT NULL DEFAULT 'IDR',
  expected_amount bigint NOT NULL CHECK (expected_amount >= 0),
  paid_amount bigint,
  external_transaction_id text,
  idempotency_key text NOT NULL,
  payment_url text,
  qr_reference text,
  reupload_count integer NOT NULL DEFAULT 0,
  expired_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_number),
  UNIQUE (idempotency_key)
);
CREATE UNIQUE INDEX idx_payments_provider_txn ON public.payments (provider, external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;
CREATE INDEX idx_payments_order ON public.payments (order_id);
CREATE INDEX idx_payments_status_expired ON public.payments (status, expired_at);

GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_select_own ON public.payments FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY payments_select_staff ON public.payments FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'payments.view'));
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ payment_events ============
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_event_id text NOT NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  payload_hash text,
  processing_status text NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received','processed','duplicate','rejected','failed')),
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_event_id)
);
CREATE INDEX idx_payment_events_payment ON public.payment_events (payment_id);
GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_events_select_staff ON public.payment_events FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'payments.view'));

-- ============ manual_payment_proofs ============
CREATE TABLE public.manual_payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  file_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  sender_name text,
  amount_claimed bigint,
  customer_note text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected','superseded')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_proofs_payment ON public.manual_payment_proofs (payment_id);
GRANT SELECT, INSERT ON public.manual_payment_proofs TO authenticated;
GRANT ALL ON public.manual_payment_proofs TO service_role;
ALTER TABLE public.manual_payment_proofs ENABLE ROW LEVEL SECURITY;
CREATE POLICY proofs_select_own ON public.manual_payment_proofs FOR SELECT TO authenticated
  USING (customer_id = auth.uid());
CREATE POLICY proofs_select_staff ON public.manual_payment_proofs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'payments.view'));
CREATE POLICY proofs_insert_own ON public.manual_payment_proofs FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.payments p WHERE p.id = manual_payment_proofs.payment_id AND p.user_id = auth.uid()));
CREATE TRIGGER proofs_set_updated_at BEFORE UPDATE ON public.manual_payment_proofs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ payment_verifications ============
CREATE TABLE public.payment_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  proof_id uuid REFERENCES public.manual_payment_proofs(id) ON DELETE SET NULL,
  verifier_id uuid NOT NULL,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved','rejected','reupload_requested')),
  reason text,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_verifications_payment ON public.payment_verifications (payment_id);
GRANT SELECT ON public.payment_verifications TO authenticated;
GRANT ALL ON public.payment_verifications TO service_role;
ALTER TABLE public.payment_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY verifications_select_own ON public.payment_verifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.payments p WHERE p.id = payment_verifications.payment_id AND p.user_id = auth.uid()));
CREATE POLICY verifications_select_staff ON public.payment_verifications FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'payments.view'));