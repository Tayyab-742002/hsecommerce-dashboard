-- Migration: Shipping label management (Phase 0 foundation)
-- Creates customer_integrations (courier/platform connections), customer_integration_secrets
-- (credentials, service-role only), and shipping_labels (label records, API or manual upload).

-- ─────────────────────────────────────────
-- 1. CUSTOMER_INTEGRATIONS TABLE
-- ─────────────────────────────────────────
CREATE TABLE public.customer_integrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('royal_mail')),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','connected','error','disconnected')),
  last_synced_at  timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, provider)
);

-- ─────────────────────────────────────────
-- 2. CUSTOMER_INTEGRATION_SECRETS TABLE
-- No RLS policies are created for this table on purpose — it is default-deny for
-- both `authenticated` and `anon`. Only edge functions using the service-role key
-- can read or write credentials. The app must never expose this table to clients.
-- ─────────────────────────────────────────
CREATE TABLE public.customer_integration_secrets (
  integration_id  uuid PRIMARY KEY REFERENCES public.customer_integrations(id) ON DELETE CASCADE,
  api_key         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- 3. SHIPPING_LABELS TABLE
-- customer_id is stored directly (not just derived via outbound_order_id) because a
-- label can arrive from a courier before it has been matched to an order.
-- ─────────────────────────────────────────
CREATE TABLE public.shipping_labels (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  outbound_order_id  uuid REFERENCES public.outbound_orders(id) ON DELETE SET NULL,
  source             text NOT NULL CHECK (source IN ('api','manual_upload')),
  provider           text,
  external_reference text,
  tracking_number    text,
  label_file_path    text,
  label_format       text NOT NULL DEFAULT 'pdf' CHECK (label_format IN ('pdf','zpl','png')),
  status             text NOT NULL DEFAULT 'pending_match'
                     CHECK (status IN ('pending_match','received','printed','dispatched','failed')),
  matched_at         timestamptz,
  matched_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  raw_payload        jsonb,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_reference)
);

-- ─────────────────────────────────────────
-- 4. UPDATED_AT TRIGGERS (reuses the pattern from pallets)
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_shipping_labels_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER customer_integrations_updated_at
  BEFORE UPDATE ON public.customer_integrations
  FOR EACH ROW EXECUTE FUNCTION public.handle_shipping_labels_updated_at();

CREATE TRIGGER customer_integration_secrets_updated_at
  BEFORE UPDATE ON public.customer_integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.handle_shipping_labels_updated_at();

CREATE TRIGGER shipping_labels_updated_at
  BEFORE UPDATE ON public.shipping_labels
  FOR EACH ROW EXECUTE FUNCTION public.handle_shipping_labels_updated_at();

-- ─────────────────────────────────────────
-- 5. ROW LEVEL SECURITY
-- ─────────────────────────────────────────
ALTER TABLE public.customer_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_integration_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_labels ENABLE ROW LEVEL SECURITY;

-- CUSTOMER_INTEGRATIONS — admins manage all, customers can view (not edit) their own
-- connection status. Credentials never live on this table, so this is safe to expose.
CREATE POLICY "Admins can manage all customer integrations"
ON public.customer_integrations
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Customers can view own integrations"
ON public.customer_integrations
FOR SELECT
TO authenticated
USING (
  customer_id = public.get_user_customer_id(auth.uid())
);

-- CUSTOMER_INTEGRATION_SECRETS — intentionally no policies for authenticated/anon.
-- RLS is enabled with zero grants, so only the service-role key (edge functions) can
-- read or write rows here.

-- SHIPPING_LABELS — admins manage all, customers see their own labels
CREATE POLICY "Admins can manage all shipping labels"
ON public.shipping_labels
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Customers can view own shipping labels"
ON public.shipping_labels
FOR SELECT
TO authenticated
USING (
  customer_id = public.get_user_customer_id(auth.uid())
);

-- ─────────────────────────────────────────
-- 6. STORAGE BUCKET FOR LABEL FILES
-- Path convention: {customer_id}/{outbound_order_id-or-"unmatched"}/{filename}
-- ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('shipping-labels', 'shipping-labels', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins can manage all shipping label files"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'shipping-labels'
  AND public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Customers can view own shipping label files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'shipping-labels'
  AND (storage.foldername(name))[1] = public.get_user_customer_id(auth.uid())::text
);

-- ─────────────────────────────────────────
-- 7. INDEXES FOR QUERY PERFORMANCE
-- ─────────────────────────────────────────
CREATE INDEX idx_customer_integrations_customer_id ON public.customer_integrations(customer_id);
CREATE INDEX idx_shipping_labels_customer_id        ON public.shipping_labels(customer_id);
CREATE INDEX idx_shipping_labels_order_id           ON public.shipping_labels(outbound_order_id);
CREATE INDEX idx_shipping_labels_status             ON public.shipping_labels(status);

-- ─────────────────────────────────────────
-- 8. VERIFY
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_integrations') THEN
    RAISE EXCEPTION 'Migration failed: customer_integrations table not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_integration_secrets') THEN
    RAISE EXCEPTION 'Migration failed: customer_integration_secrets table not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shipping_labels') THEN
    RAISE EXCEPTION 'Migration failed: shipping_labels table not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'shipping-labels') THEN
    RAISE EXCEPTION 'Migration failed: shipping-labels storage bucket not created';
  END IF;
  RAISE NOTICE 'Shipping label migration completed successfully.';
END $$;
