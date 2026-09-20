-- Migration: track where an order came from (manual entry vs. a platform
-- import) so labels arriving via a client's native store-connector inside
-- their courier account can be matched by the platform's own order
-- number/id, not just H&S's order_number.

-- ─────────────────────────────────────────
-- 1. SOURCE TRACKING COLUMNS
-- ─────────────────────────────────────────
ALTER TABLE public.outbound_orders
  ADD COLUMN source              text NOT NULL DEFAULT 'manual'
                                 CHECK (source IN ('manual','platform_import')),
  ADD COLUMN source_platform     text CHECK (source_platform IN ('shopify','etsy','ebay','amazon')),
  ADD COLUMN source_order_id     text,
  ADD COLUMN source_order_number text;

-- Stored, queryable normalization (mirrors platform_sku_mappings' pattern)
-- so matching code can do a plain .eq() instead of a functional-index
-- expression PostgREST can't express directly.
ALTER TABLE public.outbound_orders
  ADD COLUMN source_order_number_normalized text
    GENERATED ALWAYS AS (lower(btrim(ltrim(source_order_number, '#')))) STORED;

CREATE UNIQUE INDEX idx_outbound_orders_source_unique
  ON public.outbound_orders (customer_id, source_platform, source_order_id)
  WHERE source_order_id IS NOT NULL;

CREATE INDEX idx_outbound_orders_source_number
  ON public.outbound_orders (customer_id, source_order_number_normalized)
  WHERE source_order_number IS NOT NULL;

-- ─────────────────────────────────────────
-- 2. WIDEN DELIVERY COLUMNS
-- Real platform address/phone data (e.g. long international phone formats,
-- long city/state names) will overflow these narrow VARCHAR limits and
-- abort an import with a raw Postgres error. Widening is purely additive —
-- it doesn't touch existing data or any application code.
-- ─────────────────────────────────────────
ALTER TABLE public.outbound_orders
  ALTER COLUMN delivery_address_line1 TYPE text,
  ALTER COLUMN delivery_address_line2 TYPE text,
  ALTER COLUMN delivery_city          TYPE text,
  ALTER COLUMN delivery_state         TYPE text,
  ALTER COLUMN delivery_postal_code   TYPE text,
  ALTER COLUMN delivery_country       TYPE text,
  ALTER COLUMN delivery_contact_name  TYPE text,
  ALTER COLUMN delivery_contact_phone TYPE text;

-- ─────────────────────────────────────────
-- 3. VERIFY
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outbound_orders' AND column_name = 'source_order_number'
  ) THEN
    RAISE EXCEPTION 'Migration failed: source_order_number column not added';
  END IF;
  RAISE NOTICE 'Outbound order source migration completed successfully.';
END $$;
