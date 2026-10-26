-- ============================================================================
-- Hubungkan: saat order menjadi 'paid', kredit pendapatan seller (idempoten).
--
-- Pendekatan trigger dipilih agar TIDAK perlu menulis ulang fungsi pembayaran
-- yang panjang & berisiko (verify_manual_payment / settle_gateway_payment).
--
-- Idempotensi dijamin oleh credit_seller_earnings() (idempotency_key unik).
-- Trigger hanya berjalan bila order bertransisi KE status 'paid'.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_credit_seller_on_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Hanya saat bertransisi masuk ke 'paid' (bukan update lain).
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    PERFORM public.credit_seller_earnings(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS orders_credit_seller_on_paid ON public.orders;
CREATE TRIGGER orders_credit_seller_on_paid
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_credit_seller_on_paid();
