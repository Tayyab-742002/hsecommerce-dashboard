-- Migration: admin order overview
--
-- The admin orders tab now picks a customer first, then shows that customer's
-- orders grouped into category folders. Both screens need counts across every
-- order, which a paginated page of rows cannot provide — so they are aggregated
-- in the database.
--
-- SECURITY INVOKER (the default) keeps row level security in force: an admin
-- sees every customer, a customer_admin calling these would see only their own.

-- ─────────────────────────────────────────
-- 1. CUSTOMER PICKER
-- One row per customer, including customers with no orders yet, ordered so the
-- ones waiting on the admin come first.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_customer_order_stats()
RETURNS TABLE (
  customer_id     uuid,
  customer_code   text,
  customer_name   text,
  contact_person  text,
  total_orders    bigint,
  unread_orders   bigint,
  pending_orders  bigint,
  last_order_at   timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    c.id,
    c.customer_code::text,
    coalesce(c.company_name, c.contact_person)::text,
    c.contact_person::text,
    count(o.id),
    count(o.id) FILTER (WHERE o.viewed_at IS NULL),
    count(o.id) FILTER (WHERE o.status = 'pending'),
    max(o.created_at)
  FROM public.customers c
  LEFT JOIN public.outbound_orders o ON o.customer_id = c.id
  GROUP BY c.id, c.customer_code, c.company_name, c.contact_person
  ORDER BY count(o.id) FILTER (WHERE o.viewed_at IS NULL) DESC,
           coalesce(c.company_name, c.contact_person);
$$;

-- ─────────────────────────────────────────
-- 2. CATEGORY FOLDERS FOR ONE CUSTOMER
-- '' is the folder for orders with no category.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.customer_order_category_stats(p_customer_id uuid)
RETURNS TABLE (
  order_category text,
  order_count    bigint,
  unread_count   bigint,
  label_count    bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    coalesce(o.order_category, ''),
    count(*),
    count(*) FILTER (WHERE o.viewed_at IS NULL),
    count(*) FILTER (WHERE o.label_path IS NOT NULL)
  FROM public.outbound_orders o
  WHERE o.customer_id = p_customer_id
  GROUP BY 1
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.admin_customer_order_stats FROM public;
REVOKE ALL ON FUNCTION public.customer_order_category_stats FROM public;
GRANT EXECUTE ON FUNCTION public.admin_customer_order_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_order_category_stats TO authenticated;

-- Orders are listed unread-first, so index the unread set per customer
CREATE INDEX IF NOT EXISTS idx_outbound_orders_customer_unviewed
  ON public.outbound_orders(customer_id, created_at DESC)
  WHERE viewed_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'admin_customer_order_stats'
  ) THEN
    RAISE EXCEPTION 'Migration failed: admin_customer_order_stats not created';
  END IF;
  RAISE NOTICE 'Admin order overview migration completed successfully.';
END $$;
