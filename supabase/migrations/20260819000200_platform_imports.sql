-- Migration: SKU mapping + staged order-import queue for platform
-- integrations (Shopify/Etsy/eBay/Amazon). inventory_items.sku is nullable,
-- unconstrained, and legitimately duplicated across intake batches (a new
-- row is created per batch; item_code, not sku, is the real key) — so a
-- platform order line can never be auto-resolved to one inventory_items
-- row safely. Admin approves each SKU mapping once; after that it's
-- automatic. Every fetched order is staged first so a sync is always safe
-- to re-run and nothing is ever partially imported.

-- ─────────────────────────────────────────
-- 1. PLATFORM_SKU_MAPPINGS
-- ─────────────────────────────────────────
CREATE TABLE public.platform_sku_mappings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id             uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  platform                text NOT NULL CHECK (platform IN ('shopify','etsy','ebay','amazon')),
  platform_sku            text,
  platform_sku_normalized text GENERATED ALWAYS AS (lower(btrim(platform_sku))) STORED,
  platform_variant_id     text,
  inventory_item_id       uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  units_per_platform_unit integer NOT NULL DEFAULT 1 CHECK (units_per_platform_unit > 0),
  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (platform_sku IS NOT NULL OR platform_variant_id IS NOT NULL)
);

CREATE UNIQUE INDEX idx_sku_map_by_sku ON public.platform_sku_mappings
  (customer_id, platform, platform_sku_normalized) WHERE platform_sku IS NOT NULL;
CREATE UNIQUE INDEX idx_sku_map_by_variant ON public.platform_sku_mappings
  (customer_id, platform, platform_variant_id)
  WHERE platform_sku IS NULL AND platform_variant_id IS NOT NULL;

CREATE TRIGGER platform_sku_mappings_updated_at
  BEFORE UPDATE ON public.platform_sku_mappings
  FOR EACH ROW EXECUTE FUNCTION public.handle_shipping_labels_updated_at();

-- ─────────────────────────────────────────
-- 2. PLATFORM_ORDER_IMPORTS
-- ─────────────────────────────────────────
CREATE TABLE public.platform_order_imports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  integration_id        uuid REFERENCES public.customer_integrations(id) ON DELETE SET NULL,
  platform              text NOT NULL CHECK (platform IN ('shopify','etsy','ebay','amazon')),
  platform_order_id     text NOT NULL,
  platform_order_number text,
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','imported','needs_mapping','insufficient_stock','failed','ignored')),
  failure_reason        text,
  unresolved_lines      jsonb,
  outbound_order_id     uuid REFERENCES public.outbound_orders(id) ON DELETE SET NULL,
  raw_payload           jsonb NOT NULL,
  attempts              integer NOT NULL DEFAULT 0,
  last_attempt_at       timestamptz,
  imported_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, customer_id, platform_order_id)
);

CREATE TRIGGER platform_order_imports_updated_at
  BEFORE UPDATE ON public.platform_order_imports
  FOR EACH ROW EXECUTE FUNCTION public.handle_shipping_labels_updated_at();

-- ─────────────────────────────────────────
-- 3. ROW LEVEL SECURITY
-- ─────────────────────────────────────────
ALTER TABLE public.platform_sku_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_order_imports ENABLE ROW LEVEL SECURITY;

-- SKU mappings — admins manage all, customers can see their own (useful for
-- them to sanity-check what's mapped, they never write to it).
CREATE POLICY "Admins can manage all sku mappings"
ON public.platform_sku_mappings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Customers can view own sku mappings"
ON public.platform_sku_mappings
FOR SELECT
TO authenticated
USING (
  customer_id = public.get_user_customer_id(auth.uid())
);

-- Order imports — admin only. raw_payload holds end-consumer PII
-- (name/address/phone), never exposed to the customer_admin role.
CREATE POLICY "Admins can manage all order imports"
ON public.platform_order_imports
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ─────────────────────────────────────────
-- 4. INDEXES FOR QUERY PERFORMANCE
-- ─────────────────────────────────────────
CREATE INDEX idx_sku_mappings_customer_id  ON public.platform_sku_mappings(customer_id);
CREATE INDEX idx_order_imports_customer_id ON public.platform_order_imports(customer_id);
CREATE INDEX idx_order_imports_status      ON public.platform_order_imports(status);

-- ─────────────────────────────────────────
-- 5. VERIFY
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_sku_mappings') THEN
    RAISE EXCEPTION 'Migration failed: platform_sku_mappings table not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_order_imports') THEN
    RAISE EXCEPTION 'Migration failed: platform_order_imports table not created';
  END IF;
  RAISE NOTICE 'Platform imports migration completed successfully.';
END $$;
