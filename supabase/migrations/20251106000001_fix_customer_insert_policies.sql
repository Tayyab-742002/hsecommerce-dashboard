-- Fix customer INSERT policy to use public.has_role() explicitly
-- This ensures the function is found and called correctly
-- 
-- IMPORTANT: This migration fixes policies that were missing the 'public.' schema prefix
-- which can cause function resolution issues in Supabase

-- Drop the existing policy
DROP POLICY IF EXISTS "Admins can insert customers" ON public.customers;

-- Recreate with explicit public schema prefix
CREATE POLICY "Admins can insert customers" 
ON public.customers 
FOR INSERT 
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role) OR 
  public.has_role(auth.uid(), 'warehouse_manager'::app_role) OR 
  public.has_role(auth.uid(), 'warehouse_staff'::app_role)
);

-- Also fix UPDATE and DELETE policies for consistency
DROP POLICY IF EXISTS "Admins can update customers" ON public.customers;
CREATE POLICY "Admins can update customers" 
ON public.customers 
FOR UPDATE 
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role) OR 
  public.has_role(auth.uid(), 'warehouse_manager'::app_role) OR 
  public.has_role(auth.uid(), 'warehouse_staff'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete customers" ON public.customers;
CREATE POLICY "Admins can delete customers" 
ON public.customers 
FOR DELETE 
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role) OR 
  public.has_role(auth.uid(), 'warehouse_manager'::app_role) OR 
  public.has_role(auth.uid(), 'warehouse_staff'::app_role)
);

-- Fix order items policies as well
DROP POLICY IF EXISTS "Admins can insert order items" ON public.outbound_order_items;
CREATE POLICY "Admins can insert order items" 
ON public.outbound_order_items 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.outbound_orders 
    WHERE id = outbound_order_id 
    AND (
      public.has_role(auth.uid(), 'super_admin'::app_role) OR 
      public.has_role(auth.uid(), 'warehouse_manager'::app_role) OR 
      public.has_role(auth.uid(), 'warehouse_staff'::app_role)
    )
  )
);

DROP POLICY IF EXISTS "Admins can update order items" ON public.outbound_order_items;
CREATE POLICY "Admins can update order items" 
ON public.outbound_order_items 
FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.outbound_orders 
    WHERE id = outbound_order_id 
    AND (
      public.has_role(auth.uid(), 'super_admin'::app_role) OR 
      public.has_role(auth.uid(), 'warehouse_manager'::app_role) OR 
      public.has_role(auth.uid(), 'warehouse_staff'::app_role)
    )
  )
);

DROP POLICY IF EXISTS "Admins can delete order items" ON public.outbound_order_items;
CREATE POLICY "Admins can delete order items" 
ON public.outbound_order_items 
FOR DELETE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.outbound_orders 
    WHERE id = outbound_order_id 
    AND (
      public.has_role(auth.uid(), 'super_admin'::app_role) OR 
      public.has_role(auth.uid(), 'warehouse_manager'::app_role) OR 
      public.has_role(auth.uid(), 'warehouse_staff'::app_role)
    )
  )
);

