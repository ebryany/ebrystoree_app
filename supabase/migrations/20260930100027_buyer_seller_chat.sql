-- Prompt 17: Chat Pembeli-Penjual
-- Adds store_id to product_inquiries so sellers can read/reply to inquiries
-- about their own products. Adds 'seller' sender_role.

-- 1. Add store_id column
ALTER TABLE public.product_inquiries
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_inquiries_store
  ON public.product_inquiries(store_id, last_message_at DESC);

-- 2. Backfill store_id from product_id → digital_products.store_id
UPDATE public.product_inquiries pi
   SET store_id = dp.store_id
  FROM public.digital_products dp
 WHERE pi.product_id = dp.id
   AND pi.store_id IS NULL
   AND dp.store_id IS NOT NULL;

-- 3. Add 'seller' to sender_role CHECK on product_inquiry_messages
-- Drop old constraint first, then add new one.
ALTER TABLE public.product_inquiry_messages
  DROP CONSTRAINT IF EXISTS product_inquiry_messages_sender_role_check;
ALTER TABLE public.product_inquiry_messages
  ADD CONSTRAINT product_inquiry_messages_sender_role_check
  CHECK (sender_role IN ('customer', 'staff', 'seller', 'system'));

-- 4. RLS: seller can read inquiries for their store
CREATE POLICY "Seller reads own store inquiries"
  ON public.product_inquiries
  FOR SELECT TO authenticated
  USING (store_id = public.my_store_id());

-- 5. RLS: seller can update inquiries for their store (status changes)
CREATE POLICY "Seller updates own store inquiries"
  ON public.product_inquiries
  FOR UPDATE TO authenticated
  USING (store_id = public.my_store_id())
  WITH CHECK (store_id = public.my_store_id());

-- 6. RLS: seller can read messages in their store's inquiries
CREATE POLICY "Seller reads own store inquiry messages"
  ON public.product_inquiry_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.product_inquiries i
       WHERE i.id = inquiry_id
         AND i.store_id = public.my_store_id()
    )
  );

-- 7. RLS: seller can send messages in their store's inquiries
CREATE POLICY "Seller sends messages in own store inquiries"
  ON public.product_inquiry_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.product_inquiries i
       WHERE i.id = inquiry_id
         AND i.store_id = public.my_store_id()
    )
  );

-- 8. Update touch trigger to handle 'seller' role same as 'staff'
CREATE OR REPLACE FUNCTION public.touch_product_inquiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.product_inquiries
     SET last_message_at = now(),
         updated_at = now(),
         status = CASE WHEN status = 'closed' THEN status
                       WHEN NEW.sender_role IN ('staff', 'seller') THEN 'answered'
                       ELSE 'open' END
   WHERE id = NEW.inquiry_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_product_inquiry() FROM PUBLIC, anon, authenticated;

-- 9. Auto-fill store_id on new inquiries via trigger
CREATE OR REPLACE FUNCTION public.fill_inquiry_store_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND NEW.store_id IS NULL THEN
    SELECT dp.store_id INTO NEW.store_id
      FROM public.digital_products dp
     WHERE dp.id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fill_inquiry_store_id() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_fill_inquiry_store_id
BEFORE INSERT ON public.product_inquiries
FOR EACH ROW EXECUTE FUNCTION public.fill_inquiry_store_id();
