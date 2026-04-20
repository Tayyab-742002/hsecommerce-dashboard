-- Migration: Add pallet management
-- Creates pallets and pallet_items tables, links inventory_items to pallets

-- ─────────────────────────────────────────
-- 1. PALLETS TABLE
-- ─────────────────────────────────────────
CREATE TABLE public.pallets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pallet_number     text UNIQUE NOT NULL,
  container_number  text,                          -- optional, free text
  customer_id       uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  warehouse_id      uuid NOT NULL REFERENCES public.warehouses(id),
  location          text,                          -- free text e.g. "Row B, Bay 3"
  status            text NOT NULL DEFAULT 'in_storage'
                    CHECK (status IN ('receiving','in_storage','partially_picked','empty','damaged')),
  condition         text NOT NULL DEFAULT 'good'
                    CHECK (condition IN ('good','damaged','water_damaged')),
  notes             text,
  received_date     timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- 2. PALLET_ITEMS TABLE
-- ─────────────────────────────────────────
CREATE TABLE public.pallet_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pallet_id           uuid NOT NULL REFERENCES public.pallets(id) ON DELETE CASCADE,
  inventory_item_id   uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity            integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pallet_id, inventory_item_id)
);

-- ─────────────────────────────────────────
-- 3. LINK INVENTORY_ITEMS TO PALLETS
-- ─────────────────────────────────────────
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS pallet_id uuid REFERENCES public.pallets(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────
-- 4. UPDATED_AT TRIGGER FOR PALLETS
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_pallets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pallets_updated_at
  BEFORE UPDATE ON public.pallets
  FOR EACH ROW EXECUTE FUNCTION public.handle_pallets_updated_at();

-- ─────────────────────────────────────────
-- 5. ROW LEVEL SECURITY
-- ─────────────────────────────────────────
ALTER TABLE public.pallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pallet_items ENABLE ROW LEVEL SECURITY;

-- PALLETS — admins manage all, customers see their own
CREATE POLICY "Admins can manage all pallets"
ON public.pallets
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Customers can view own pallets"
ON public.pallets
FOR SELECT
TO authenticated
USING (
  customer_id = public.get_user_customer_id(auth.uid())
);

-- PALLET_ITEMS — admins manage all, customers see items on their pallets
CREATE POLICY "Admins can manage all pallet items"
ON public.pallet_items
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Customers can view own pallet items"
ON public.pallet_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pallets
    WHERE pallets.id = pallet_items.pallet_id
      AND pallets.customer_id = public.get_user_customer_id(auth.uid())
  )
);

-- ─────────────────────────────────────────
-- 6. INDEXES FOR QUERY PERFORMANCE
-- ─────────────────────────────────────────
CREATE INDEX idx_pallets_customer_id    ON public.pallets(customer_id);
CREATE INDEX idx_pallets_warehouse_id   ON public.pallets(warehouse_id);
CREATE INDEX idx_pallets_status         ON public.pallets(status);
CREATE INDEX idx_pallet_items_pallet_id ON public.pallet_items(pallet_id);
CREATE INDEX idx_inventory_items_pallet ON public.inventory_items(pallet_id);

-- ─────────────────────────────────────────
-- 7. VERIFY
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pallets') THEN
    RAISE EXCEPTION 'Migration failed: pallets table not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pallet_items') THEN
    RAISE EXCEPTION 'Migration failed: pallet_items table not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_items' AND column_name = 'pallet_id'
  ) THEN
    RAISE EXCEPTION 'Migration failed: pallet_id column not added to inventory_items';
  END IF;
  RAISE NOTICE 'Pallet migration completed successfully.';
END $$;
