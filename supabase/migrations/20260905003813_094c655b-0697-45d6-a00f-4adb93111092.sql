CREATE TABLE public.product_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.digital_products(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.product_inquiry_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES public.product_inquiries(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role text NOT NULL DEFAULT 'customer' CHECK (sender_role IN ('customer','staff','system')),
  body text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_inquiries_user ON public.product_inquiries(user_id, last_message_at DESC);
CREATE INDEX idx_product_inquiries_product ON public.product_inquiries(product_id);
CREATE INDEX idx_product_inquiry_messages_inquiry ON public.product_inquiry_messages(inquiry_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.product_inquiries TO authenticated;
GRANT ALL ON public.product_inquiries TO service_role;
GRANT SELECT, INSERT ON public.product_inquiry_messages TO authenticated;
GRANT ALL ON public.product_inquiry_messages TO service_role;

ALTER TABLE public.product_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_inquiry_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or staff can read inquiries" ON public.product_inquiries
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "Users create own inquiries" ON public.product_inquiries
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner or staff update inquiries" ON public.product_inquiries
  FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "Owner or staff read messages" ON public.product_inquiry_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.product_inquiries i WHERE i.id = inquiry_id
      AND (i.user_id = auth.uid() OR public.is_staff(auth.uid())))
  );
CREATE POLICY "Owner or staff send messages" ON public.product_inquiry_messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.product_inquiries i WHERE i.id = inquiry_id
      AND (i.user_id = auth.uid() OR public.is_staff(auth.uid())))
  );

CREATE OR REPLACE FUNCTION public.touch_product_inquiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.product_inquiries
     SET last_message_at = now(),
         updated_at = now(),
         status = CASE WHEN status = 'closed' THEN status
                       WHEN NEW.sender_role = 'staff' THEN 'answered'
                       ELSE 'open' END
   WHERE id = NEW.inquiry_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_product_inquiry() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_touch_product_inquiry
AFTER INSERT ON public.product_inquiry_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_product_inquiry();

CREATE TRIGGER trg_product_inquiries_updated_at
BEFORE UPDATE ON public.product_inquiries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();