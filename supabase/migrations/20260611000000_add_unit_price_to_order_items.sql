-- Add per-item pricing to outbound order items
-- unit_price defaults to 0 so existing rows (priced via order-level handling charges) are unaffected

ALTER TABLE public.outbound_order_items
  ADD COLUMN IF NOT EXISTS unit_price numeric(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.outbound_order_items.unit_price IS 'Price per unit for this line item at time of order creation. Order total = sum(quantity * unit_price) + handling_charges + delivery_charges.';
