-- Migration: let a shipping label be swapped without granting UPDATE on orders
--
-- Customers have no UPDATE policy on outbound_orders on purpose — row level
-- security can't restrict *which columns* a policy allows, so a broad policy
-- would also let them edit their own charges. This SECURITY DEFINER function is
-- the narrow alternative: it touches only the two label columns, and only for
-- an order the caller is allowed to change.
--
-- Returns the previous label path so the caller can delete the orphaned file.

CREATE OR REPLACE FUNCTION public.replace_order_label(
  p_order_id   uuid,
  p_label_path text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_status      text;
  v_old_path    text;
BEGIN
  SELECT customer_id, status, label_path
    INTO v_customer_id, v_status, v_old_path
    FROM public.outbound_orders
   WHERE id = p_order_id;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Order not found' USING errcode = '22023';
  END IF;

  -- Admins may replace a label at any point in the order's life. A customer may
  -- only fix their own order while it is still pending — once the warehouse has
  -- started picking, the label they are working from must not change underneath.
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    IF v_customer_id IS DISTINCT FROM public.get_user_customer_id(auth.uid()) THEN
      RAISE EXCEPTION 'Not allowed to change this order' USING errcode = '42501';
    END IF;

    IF v_status <> 'pending' THEN
      RAISE EXCEPTION 'The label can only be changed while the order is pending'
        USING errcode = '22023';
    END IF;
  END IF;

  UPDATE public.outbound_orders
     SET label_path        = p_label_path,
         label_uploaded_at = now()
   WHERE id = p_order_id;

  RETURN v_old_path;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_order_label FROM public;
GRANT EXECUTE ON FUNCTION public.replace_order_label TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'replace_order_label') THEN
    RAISE EXCEPTION 'Migration failed: replace_order_label not created';
  END IF;
  RAISE NOTICE 'Replace order label migration completed successfully.';
END $$;
