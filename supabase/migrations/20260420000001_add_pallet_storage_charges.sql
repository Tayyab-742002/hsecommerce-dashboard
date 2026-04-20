-- Add storage_charges field to pallets table
ALTER TABLE public.pallets
  ADD COLUMN IF NOT EXISTS storage_charges numeric(10, 2) NOT NULL DEFAULT 0;
