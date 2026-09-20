-- Migration: Customer self-service order creation with manual shipping labels
--
-- 1. New columns on outbound_orders: category folder, label file, admin-seen marker
-- 2. Pallet quantity sync moved from the client into triggers (fixes: pallet
--    quantities were never restored when an order was deleted, and customers have
--    no write access to pallet_items so client-side sync silently no-ops for them)
-- 3. RLS so a customer can actually create an order (insert items, roll back header)
-- 4. shipping-labels storage bucket + policies
-- 5. Realtime on outbound_orders so admins get live new-order notifications

-- ─────────────────────────────────────────
-- 1. COLUMNS
-- ─────────────────────────────────────────
ALTER TABLE public.outbound_orders
  ADD COLUMN IF NOT EXISTS order_category    text,
  ADD COLUMN IF NOT EXISTS label_path        text,
  ADD COLUMN IF NOT EXISTS label_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_at         timestamptz;

COMMENT ON COLUMN public.outbound_orders.order_category IS
  'Free-text folder, scoped per customer. "T-Shirts" for customer A is a different folder to "T-Shirts" for customer B.';
COMMENT ON COLUMN public.outbound_orders.label_path IS
  'Object path in the shipping-labels storage bucket: {customer_id}/{filename}';
COMMENT ON COLUMN public.outbound_orders.viewed_at IS
  'Set when an admin first opens the order. NULL = unread in the admin notification badge.';

-- Customer folder list and admin category filter both read this
CREATE INDEX IF NOT EXISTS idx_outbound_orders_customer_category
  ON public.outbound_orders(customer_id, order_category);

-- Admin unread badge counts rows where this is null
CREATE INDEX IF NOT EXISTS idx_outbound_orders_unviewed
  ON public.outbound_orders(created_at) WHERE viewed_at IS NULL;

-- ─────────────────────────────────────────
-- 2. PALLET SYNC TRIGGERS
-- Mirrors the inventory_items triggers in 20251103121500. security definer so it
-- works for customer-created orders too.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_pallet_on_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  inv_id     uuid;
  target_pallet uuid;
  delta      integer;   -- quantity to add back to the pallet (negative = pick)
  remaining  integer;
begin
  inv_id := coalesce(NEW.inventory_item_id, OLD.inventory_item_id);

  if TG_OP = 'INSERT' then
    delta := -NEW.quantity;
  elsif TG_OP = 'DELETE' then
    delta := OLD.quantity;
  else
    delta := coalesce(OLD.quantity, 0) - coalesce(NEW.quantity, 0);
  end if;

  if delta = 0 then
    return coalesce(NEW, OLD);
  end if;

  select pallet_id into target_pallet from public.inventory_items where id = inv_id;
  if target_pallet is null then
    return coalesce(NEW, OLD);
  end if;

  update public.pallet_items
  set quantity = greatest(0, quantity + delta)
  where pallet_id = target_pallet and inventory_item_id = inv_id;

  select coalesce(sum(quantity), 0) into remaining
  from public.pallet_items where pallet_id = target_pallet;

  -- ponytail: same two-state rule the client used before. A fully restored pallet
  -- stays 'partially_picked' rather than going back to 'in_storage'; add a
  -- received-quantity comparison here if that distinction starts to matter.
  update public.pallets
  set status = case when remaining <= 0 then 'empty' else 'partially_picked' end
  where id = target_pallet;

  return coalesce(NEW, OLD);
end;
$$;

DROP TRIGGER IF EXISTS trg_outbound_order_items_pallet_sync_ins ON public.outbound_order_items;
DROP TRIGGER IF EXISTS trg_outbound_order_items_pallet_sync_upd ON public.outbound_order_items;
DROP TRIGGER IF EXISTS trg_outbound_order_items_pallet_sync_del ON public.outbound_order_items;

CREATE TRIGGER trg_outbound_order_items_pallet_sync_ins
AFTER INSERT ON public.outbound_order_items
FOR EACH ROW EXECUTE FUNCTION public.sync_pallet_on_order_item();

CREATE TRIGGER trg_outbound_order_items_pallet_sync_upd
AFTER UPDATE OF quantity ON public.outbound_order_items
FOR EACH ROW EXECUTE FUNCTION public.sync_pallet_on_order_item();

CREATE TRIGGER trg_outbound_order_items_pallet_sync_del
AFTER DELETE ON public.outbound_order_items
FOR EACH ROW EXECUTE FUNCTION public.sync_pallet_on_order_item();

REVOKE ALL ON FUNCTION public.sync_pallet_on_order_item FROM public;
GRANT EXECUTE ON FUNCTION public.sync_pallet_on_order_item TO authenticated;

-- ─────────────────────────────────────────
-- 3. RLS FOR CUSTOMER ORDER CREATION
-- Customers already had INSERT on outbound_orders but nothing on
-- outbound_order_items, so creation failed at the second step.
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "Customers can insert items for own orders" ON public.outbound_order_items;
CREATE POLICY "Customers can insert items for own orders"
ON public.outbound_order_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.outbound_orders o
    WHERE o.id = outbound_order_id
      AND o.customer_id = public.get_user_customer_id(auth.uid())
  )
);

-- Needed by createOrder()'s rollback path: if the item insert fails the header is
-- deleted so no empty order is left behind. Restricted to still-pending orders.
DROP POLICY IF EXISTS "Customers can delete own pending orders" ON public.outbound_orders;
CREATE POLICY "Customers can delete own pending orders"
ON public.outbound_orders
FOR DELETE
TO authenticated
USING (
  customer_id = public.get_user_customer_id(auth.uid())
  AND status = 'pending'
);

-- ─────────────────────────────────────────
-- 4. SHIPPING LABEL STORAGE
-- Path convention: {customer_id}/{filename}
-- ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('shipping-labels', 'shipping-labels', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins can manage all shipping label files" ON storage.objects;
CREATE POLICY "Admins can manage all shipping label files"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'shipping-labels'
  AND public.has_role(auth.uid(), 'super_admin'::app_role)
);

DROP POLICY IF EXISTS "Customers can view own shipping label files" ON storage.objects;
CREATE POLICY "Customers can view own shipping label files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'shipping-labels'
  AND (storage.foldername(name))[1] = public.get_user_customer_id(auth.uid())::text
);

DROP POLICY IF EXISTS "Customers can upload own shipping label files" ON storage.objects;
CREATE POLICY "Customers can upload own shipping label files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shipping-labels'
  AND (storage.foldername(name))[1] = public.get_user_customer_id(auth.uid())::text
);

-- ─────────────────────────────────────────
-- 5. REALTIME — admin new-order notifications
-- ─────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.outbound_orders;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN RAISE NOTICE 'supabase_realtime publication not found; skipping';
END $$;

-- ─────────────────────────────────────────
-- 6. VERIFY
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outbound_orders' AND column_name = 'label_path'
  ) THEN
    RAISE EXCEPTION 'Migration failed: outbound_orders.label_path not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'shipping-labels') THEN
    RAISE EXCEPTION 'Migration failed: shipping-labels bucket not created';
  END IF;
  RAISE NOTICE 'Customer order creation migration completed successfully.';
END $$;
