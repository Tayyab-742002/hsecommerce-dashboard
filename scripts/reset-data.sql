-- =====================================================================
-- DATA RESET — deletes every customer and all their data.
--
-- This is NOT a migration. It lives in scripts/ deliberately so it never
-- runs as part of `supabase db push`. Paste it into the Supabase SQL editor
-- and run it by hand.
--
-- KEPT:     super_admin logins and their passwords, profiles and roles
--           warehouses, company_settings (invoice letterhead + bank details)
-- DELETED:  customers and their logins, inventory, pallets, orders, order
--           items, invoices, invoice numbering, uploaded labels and invoice
--           PDFs
--
-- REQUIRES the 20260926000000 migration, whose trigger removes each
-- customer's auth.users row. Without it the logins survive the reset and
-- their email addresses stay reserved.
--
-- There is no undo. Take a backup first:
--   Supabase dashboard → Database → Backups
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- STEP 1 — DRY RUN. Run this block on its own first and read the output.
-- Nothing below is deleted until you run STEP 2.
-- ─────────────────────────────────────────────────────────────────────
SELECT 'customers to delete'        AS what, count(*) AS rows FROM public.customers
UNION ALL SELECT 'inventory items',  count(*) FROM public.inventory_items
UNION ALL SELECT 'pallets',          count(*) FROM public.pallets
UNION ALL SELECT 'orders',           count(*) FROM public.outbound_orders
UNION ALL SELECT 'invoices',         count(*) FROM public.invoices
UNION ALL SELECT 'stored files',     count(*) FROM storage.objects
            WHERE bucket_id IN ('shipping-labels', 'invoices')
UNION ALL SELECT 'ADMIN logins kept', count(*) FROM public.user_roles
            WHERE role = 'super_admin'::app_role
UNION ALL SELECT 'customer logins to delete', count(*) FROM public.user_roles
            WHERE role = 'customer_admin'::app_role;

-- Logins with no role at all. These are NOT touched by this script, because
-- one of them could be your own admin account before its role was assigned.
-- Review the list; delete any you recognise as stale by hand.
SELECT u.id, u.email, u.created_at, 'no role — left alone' AS note
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
ORDER BY u.created_at;

-- Confirm the admins that will survive — check your own account is listed
SELECT u.email, r.role, u.last_sign_in_at
FROM auth.users u
JOIN public.user_roles r ON r.user_id = u.id
WHERE r.role = 'super_admin'::app_role
ORDER BY u.email;


-- ─────────────────────────────────────────────────────────────────────
-- STEP 2 — THE RESET. Run everything below once you are happy with STEP 1.
-- Wrapped in a transaction: any error rolls the whole thing back.
-- ─────────────────────────────────────────────────────────────────────
BEGIN;

-- Invoices first. invoices.customer_id is ON DELETE RESTRICT — financial
-- records are meant to outlive a customer — so customers cannot be deleted
-- while any invoice references them.
DELETE FROM public.invoice_lines;
DELETE FROM public.invoices;
DELETE FROM public.invoice_counters;  -- numbering restarts at INV-<year>-0001

-- Order and stock data. Most of this would cascade from customers, but being
-- explicit keeps the intent readable and the row counts visible.
DELETE FROM public.outbound_order_items;
DELETE FROM public.outbound_orders;
DELETE FROM public.pallet_items;
DELETE FROM public.pallets;
DELETE FROM public.inventory_items;

-- Tables from the shipping-integration work, which exist on this database
-- even though the current branch does not use them.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_order_imports',
    'platform_sku_mappings',
    'shipping_labels',
    'customer_integration_secrets',
    'customer_integrations',
    'oauth_states'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Customers. The 20260926000000 trigger deletes each customer's auth.users
-- row, which in turn cascades their profile and role.
DELETE FROM public.customers;

-- Any customer login that somehow outlived its customer row.
DELETE FROM auth.users u
WHERE EXISTS (
  SELECT 1 FROM public.user_roles r
  WHERE r.user_id = u.id AND r.role = 'customer_admin'::app_role
);

-- Uploaded label and invoice files.
DELETE FROM storage.objects
WHERE bucket_id IN ('shipping-labels', 'invoices');

-- Keeping warehouses and company_settings: they are configuration, not
-- customer data, and orders cannot be created without a warehouse.
-- To wipe those too, uncomment:
-- DELETE FROM public.warehouses;
-- UPDATE public.company_settings SET bank_name = NULL, account_name = NULL,
--        account_number = NULL, sort_code = NULL WHERE id = 1;

-- Refuse to commit if the reset would leave you locked out.
DO $$
DECLARE
  admins integer;
BEGIN
  SELECT count(*) INTO admins
  FROM public.user_roles WHERE role = 'super_admin'::app_role;

  IF admins = 0 THEN
    RAISE EXCEPTION 'Aborting: no super_admin would be left to log in with';
  END IF;

  RAISE NOTICE 'Reset complete. % admin login(s) kept.', admins;
END $$;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────
-- STEP 3 — verify. Every count should be 0 except the admins.
-- ─────────────────────────────────────────────────────────────────────
SELECT 'customers' AS what, count(*) AS rows FROM public.customers
UNION ALL SELECT 'inventory items', count(*) FROM public.inventory_items
UNION ALL SELECT 'orders',          count(*) FROM public.outbound_orders
UNION ALL SELECT 'invoices',        count(*) FROM public.invoices
UNION ALL SELECT 'stored files',    count(*) FROM storage.objects
            WHERE bucket_id IN ('shipping-labels', 'invoices')
UNION ALL SELECT 'admins kept',     count(*) FROM public.user_roles
            WHERE role = 'super_admin'::app_role
UNION ALL SELECT 'warehouses kept', count(*) FROM public.warehouses;
