-- Migration: allow customers (and admins, already covered) to upload a
-- shipping label themselves for one of their own orders — the manual
-- fallback for any client/courier/platform we don't have an API
-- integration for. No new tables: shipping_labels and the shipping-labels
-- bucket already support this (source='manual_upload' has existed since
-- the original migration), this only adds the missing INSERT grants.

-- Customers may insert a manual-upload label row for their own order —
-- scoped to their own customer_id AND to an order that actually belongs
-- to them (not just any outbound_order_id they might guess/paste).
CREATE POLICY "Customers can upload labels for own orders"
ON public.shipping_labels
FOR INSERT
TO authenticated
WITH CHECK (
  source = 'manual_upload'
  AND customer_id = public.get_user_customer_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.outbound_orders
    WHERE outbound_orders.id = shipping_labels.outbound_order_id
      AND outbound_orders.customer_id = shipping_labels.customer_id
  )
);

-- Storage: customers may upload (but not overwrite/delete) files under
-- their own customer_id prefix — matches the path convention already used
-- by the API-sourced labels ({customer_id}/{order_id}/filename).
CREATE POLICY "Customers can upload own shipping label files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shipping-labels'
  AND (storage.foldername(name))[1] = public.get_user_customer_id(auth.uid())::text
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shipping_labels' AND policyname = 'Customers can upload labels for own orders'
  ) THEN
    RAISE EXCEPTION 'Migration failed: customer upload policy not created';
  END IF;
  RAISE NOTICE 'Manual label upload migration completed successfully.';
END $$;
