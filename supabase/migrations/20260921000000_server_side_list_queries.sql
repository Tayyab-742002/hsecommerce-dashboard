-- Migration: support server-side paginated list pages
--
-- The list pages used to fetch every row and filter in the browser, which broke
-- silently past PostgREST's 1000-row response cap. Paging in the database needs
-- three things the client can no longer derive from a page of 25 rows:
--   1. the distinct filter options (category folders)
--   2. billing totals across all of a customer's orders
--   3. indexes so filtering and ILIKE search stay fast
--
-- All functions are SECURITY INVOKER (the default) so row level security still
-- applies: a customer_admin sees only their own rows, a super_admin sees all.

-- ─────────────────────────────────────────
-- 1. FILTER OPTIONS
-- ─────────────────────────────────────────

-- Order category folders, scoped per customer. The same folder name used by two
-- customers stays two rows, which is what the admin filter lists.
CREATE OR REPLACE FUNCTION public.order_category_options()
RETURNS TABLE (customer_id uuid, customer_name text, order_category text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT
    o.customer_id,
    coalesce(c.company_name, c.contact_person) AS customer_name,
    o.order_category
  FROM public.outbound_orders o
  JOIN public.customers c ON c.id = o.customer_id
  WHERE o.order_category IS NOT NULL
  ORDER BY 2, 3;
$$;

CREATE OR REPLACE FUNCTION public.inventory_category_options()
RETURNS TABLE (category text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT i.category
  FROM public.inventory_items i
  WHERE i.category IS NOT NULL AND i.category <> ''
  ORDER BY 1;
$$;

-- ─────────────────────────────────────────
-- 2. BILLING SUMMARY
-- Replaces fetching every order just to add up total_charges.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.customer_billing_summary(p_customer_id uuid)
RETURNS TABLE (total_charges numeric, monthly_charges numeric, total_orders bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    coalesce(sum(o.total_charges), 0),
    coalesce(sum(o.total_charges) FILTER (
      WHERE o.created_at >= date_trunc('month', now())
    ), 0),
    count(*)
  FROM public.outbound_orders o
  WHERE o.customer_id = p_customer_id;
$$;

REVOKE ALL ON FUNCTION public.order_category_options FROM public;
REVOKE ALL ON FUNCTION public.inventory_category_options FROM public;
REVOKE ALL ON FUNCTION public.customer_billing_summary FROM public;
GRANT EXECUTE ON FUNCTION public.order_category_options TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_category_options TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_billing_summary TO authenticated;

-- ─────────────────────────────────────────
-- 3. INDEXES FOR THE PAGED QUERIES
-- Every list sorts by created_at within a customer, so that is the leading pair.
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_outbound_orders_customer_created
  ON public.outbound_orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_orders_created
  ON public.outbound_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_orders_status
  ON public.outbound_orders(status);
CREATE INDEX IF NOT EXISTS idx_outbound_orders_requested_date
  ON public.outbound_orders(requested_date);

CREATE INDEX IF NOT EXISTS idx_inventory_items_customer_created
  ON public.inventory_items(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_items_status
  ON public.inventory_items(status);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category
  ON public.inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_items_received_date
  ON public.inventory_items(received_date);

CREATE INDEX IF NOT EXISTS idx_pallets_customer_created
  ON public.pallets(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pallets_status
  ON public.pallets(status);

CREATE INDEX IF NOT EXISTS idx_customers_created
  ON public.customers(created_at DESC);

-- ─────────────────────────────────────────
-- 4. TRIGRAM INDEXES FOR "CONTAINS" SEARCH
-- A btree index can't serve ILIKE '%term%'; pg_trgm can.
-- ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_outbound_orders_number_trgm
  ON public.outbound_orders USING gin (order_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_inventory_items_name_trgm
  ON public.inventory_items USING gin (item_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_inventory_items_code_trgm
  ON public.inventory_items USING gin (item_code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pallets_number_trgm
  ON public.pallets USING gin (pallet_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_company_trgm
  ON public.customers USING gin (company_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_contact_trgm
  ON public.customers USING gin (contact_person gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_code_trgm
  ON public.customers USING gin (customer_code gin_trgm_ops);

-- ─────────────────────────────────────────
-- 5. VERIFY
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'order_category_options'
  ) THEN
    RAISE EXCEPTION 'Migration failed: order_category_options not created';
  END IF;
  RAISE NOTICE 'Server-side list query migration completed successfully.';
END $$;
