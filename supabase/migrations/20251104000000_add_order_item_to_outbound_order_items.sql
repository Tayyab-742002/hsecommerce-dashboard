-- Add order_item field to outbound_order_items table
-- This field stores the item_name at the time of order creation

ALTER TABLE public.outbound_order_items
ADD COLUMN order_item VARCHAR(255);

-- Add comment to document the field
COMMENT ON COLUMN public.outbound_order_items.order_item IS 'Stores the item_name at the time of order creation for historical reference';

