-- Add total_quantity field to inventory_items table
-- This field stores the total quantity received for the item

ALTER TABLE public.inventory_items
ADD COLUMN total_quantity INT DEFAULT 0;

-- Add comment to document the field
COMMENT ON COLUMN public.inventory_items.total_quantity IS 'Total quantity received for this inventory item (never decreases, unlike quantity which can decrease due to orders)';

-- Set default total_quantity for existing records to match their current quantity
UPDATE public.inventory_items
SET total_quantity = quantity
WHERE total_quantity IS NULL OR total_quantity = 0;

