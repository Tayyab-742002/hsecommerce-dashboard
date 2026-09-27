-- Migration: invoicing
--
-- Monthly invoices per customer. An invoice is a draft until it is issued; at
-- that moment it takes a number, its lines are frozen and its PDF is stored.
--
-- Two deliberate choices:
--   * invoice_lines keep source_id as a plain uuid with no foreign key. Deleting
--     an order must never rewrite an invoice that has already been sent, so the
--     line text is a snapshot, not a join.
--   * an issued invoice is never edited or deleted, only voided. Corrections are
--     made by voiding and reissuing.
--
-- VAT columns exist but default to 0: the business is not VAT registered today,
-- and this way switching it on later is a settings change, not a migration.

-- ─────────────────────────────────────────
-- 1. COMPANY SETTINGS (single row)
-- Supplies the invoice letterhead and payment details.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_settings (
  id                 smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name       text NOT NULL DEFAULT 'H&S E-commerce',
  address_line1      text,
  address_line2      text,
  city               text,
  postal_code        text,
  country            text DEFAULT 'United Kingdom',
  email              text,
  phone              text,
  company_number     text,
  vat_registered     boolean NOT NULL DEFAULT false,
  vat_number         text,
  vat_rate           numeric(5,2) NOT NULL DEFAULT 0,
  bank_name          text,
  account_name       text,
  sort_code          text,
  account_number     text,
  payment_terms_days integer NOT NULL DEFAULT 14,
  invoice_footer     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.company_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────
-- 2. INVOICES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number    text UNIQUE,              -- assigned on issue, not on draft
  customer_id       uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','paid','void')),
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  issue_date        date,
  due_date          date,
  subtotal          numeric(12,2) NOT NULL DEFAULT 0,
  vat_rate          numeric(5,2)  NOT NULL DEFAULT 0,
  vat_amount        numeric(12,2) NOT NULL DEFAULT 0,
  total             numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid       numeric(12,2) NOT NULL DEFAULT 0,
  paid_at           timestamptz,
  payment_method    text,
  payment_reference text,
  notes             text,
  pdf_path          text,
  sent_at           timestamptz,
  viewed_at         timestamptz,               -- customer opened it; drives the badge
  voided_at         timestamptz,
  void_reason       text,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

-- source_id is intentionally NOT a foreign key: an issued invoice must survive
-- the deletion of the order or pallet it was built from.
CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  line_no     integer NOT NULL DEFAULT 1,
  description text NOT NULL,
  quantity    numeric(12,2) NOT NULL DEFAULT 1,
  unit_price  numeric(12,2) NOT NULL DEFAULT 0,
  amount      numeric(12,2) NOT NULL DEFAULT 0,
  source_type text NOT NULL DEFAULT 'manual'
              CHECK (source_type IN ('order','storage','manual')),
  source_id   uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer     ON public.invoices(customer_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status       ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_unviewed     ON public.invoices(customer_id)
  WHERE viewed_at IS NULL AND status <> 'draft';
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON public.invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_source  ON public.invoice_lines(source_type, source_id);

CREATE OR REPLACE FUNCTION public.handle_invoices_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_updated_at ON public.invoices;
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_invoices_updated_at();

DROP TRIGGER IF EXISTS company_settings_updated_at ON public.company_settings;
CREATE TRIGGER company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_invoices_updated_at();

-- ─────────────────────────────────────────
-- 3. NUMBERING
-- Per-year counter under a row lock, so two admins issuing at the same moment
-- cannot take the same number. A plain sequence would not reset each year.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_counters (
  year    integer PRIMARY KEY,
  last_no integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer := extract(year FROM now())::integer;
  v_no   integer;
BEGIN
  INSERT INTO public.invoice_counters (year, last_no)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_no = public.invoice_counters.last_no + 1
  RETURNING last_no INTO v_no;

  RETURN 'INV-' || v_year || '-' || lpad(v_no::text, 4, '0');
END;
$$;

-- ─────────────────────────────────────────
-- 4. BUILDING A DRAFT
-- Everything billable in the period that is not already on a live invoice.
-- Orders are billed on their dispatch date, and only once work has started —
-- pending and cancelled orders are never picked up automatically.
-- Pallet storage is billed in the month the pallet was received, so a flat
-- storage charge cannot be billed twice.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invoice_candidates(
  p_customer_id uuid,
  p_from        date,
  p_to          date
)
RETURNS TABLE (
  source_type text,
  source_id   uuid,
  occurred_on date,
  description text,
  quantity    numeric,
  unit_price  numeric,
  amount      numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    'order',
    o.id,
    o.requested_date,
    o.order_number || ' · ' || to_char(o.requested_date, 'DD Mon') ||
      ' · ' || o.total_items || ' items, ' || o.total_quantity || ' units' ||
      coalesce(' · ' || o.order_category, ''),
    1::numeric,
    coalesce(o.total_charges, 0),
    coalesce(o.total_charges, 0)
  FROM public.outbound_orders o
  WHERE o.customer_id = p_customer_id
    AND o.requested_date BETWEEN p_from AND p_to
    AND o.status IN ('packed','ready','in_transit','delivered','completed')
    AND NOT EXISTS (
      SELECT 1 FROM public.invoice_lines l
      JOIN public.invoices i ON i.id = l.invoice_id
      WHERE l.source_type = 'order' AND l.source_id = o.id
        AND i.status <> 'void'
    )

  UNION ALL

  SELECT
    'storage',
    p.id,
    p.received_date::date,
    'Pallet storage · ' || p.pallet_number || ' · ' ||
      to_char(p.received_date, 'Mon YYYY'),
    1::numeric,
    p.storage_charges,
    p.storage_charges
  FROM public.pallets p
  WHERE p.customer_id = p_customer_id
    AND p.received_date::date BETWEEN p_from AND p_to
    AND p.storage_charges > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.invoice_lines l
      JOIN public.invoices i ON i.id = l.invoice_id
      WHERE l.source_type = 'storage' AND l.source_id = p.id
        AND i.status <> 'void'
    )

  ORDER BY 3, 4;
$$;

-- ─────────────────────────────────────────
-- 5. CUSTOMER READ RECEIPT
-- Customers have no UPDATE rights on invoices, so opening one goes through a
-- function that touches only viewed_at.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_invoice_viewed(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.invoices
     SET viewed_at = now()
   WHERE id = p_invoice_id
     AND viewed_at IS NULL
     AND status <> 'draft'
     AND customer_id = public.get_user_customer_id(auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.next_invoice_number FROM public;
REVOKE ALL ON FUNCTION public.invoice_candidates FROM public;
REVOKE ALL ON FUNCTION public.mark_invoice_viewed FROM public;
GRANT EXECUTE ON FUNCTION public.next_invoice_number TO authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_candidates TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_invoice_viewed TO authenticated;

-- ─────────────────────────────────────────
-- 6. ROW LEVEL SECURITY
-- ─────────────────────────────────────────
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage company settings" ON public.company_settings;
CREATE POLICY "Admins manage company settings"
ON public.company_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Admins manage invoices" ON public.invoices;
CREATE POLICY "Admins manage invoices"
ON public.invoices FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Customers never see drafts — only what has actually been issued to them
DROP POLICY IF EXISTS "Customers view own issued invoices" ON public.invoices;
CREATE POLICY "Customers view own issued invoices"
ON public.invoices FOR SELECT TO authenticated
USING (
  customer_id = public.get_user_customer_id(auth.uid())
  AND status <> 'draft'
);

DROP POLICY IF EXISTS "Admins manage invoice lines" ON public.invoice_lines;
CREATE POLICY "Admins manage invoice lines"
ON public.invoice_lines FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Customers view own invoice lines" ON public.invoice_lines;
CREATE POLICY "Customers view own invoice lines"
ON public.invoice_lines FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_id
      AND i.customer_id = public.get_user_customer_id(auth.uid())
      AND i.status <> 'draft'
  )
);

-- invoice_counters has RLS on with no policies: only next_invoice_number()
-- (security definer) may touch it.

-- ─────────────────────────────────────────
-- 7. INVOICE PDF STORAGE
-- Path convention: {customer_id}/{invoice_number}.pdf
-- ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins manage all invoice files" ON storage.objects;
CREATE POLICY "Admins manage all invoice files"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'invoices'
  AND public.has_role(auth.uid(), 'super_admin'::app_role)
);

DROP POLICY IF EXISTS "Customers view own invoice files" ON storage.objects;
CREATE POLICY "Customers view own invoice files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'invoices'
  AND (storage.foldername(name))[1] = public.get_user_customer_id(auth.uid())::text
);

-- ─────────────────────────────────────────
-- 8. VERIFY
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
    RAISE EXCEPTION 'Migration failed: invoices table not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'invoices') THEN
    RAISE EXCEPTION 'Migration failed: invoices bucket not created';
  END IF;
  RAISE NOTICE 'Invoicing migration completed successfully.';
END $$;
