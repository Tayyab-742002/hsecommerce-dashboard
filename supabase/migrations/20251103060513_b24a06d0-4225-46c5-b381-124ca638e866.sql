-- Add INSERT, UPDATE, DELETE policies for customers table (admins only)
CREATE POLICY "Admins can insert customers" 
ON public.customers 
FOR INSERT 
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'warehouse_manager'::app_role) OR 
  has_role(auth.uid(), 'warehouse_staff'::app_role)
);

CREATE POLICY "Admins can update customers" 
ON public.customers 
FOR UPDATE 
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'warehouse_manager'::app_role) OR 
  has_role(auth.uid(), 'warehouse_staff'::app_role)
);

CREATE POLICY "Admins can delete customers" 
ON public.customers 
FOR DELETE 
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'warehouse_manager'::app_role) OR 
  has_role(auth.uid(), 'warehouse_staff'::app_role)
);

-- Add INSERT, UPDATE, DELETE policies for outbound_order_items table
CREATE POLICY "Admins can insert order items" 
ON public.outbound_order_items 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM outbound_orders 
    WHERE id = outbound_order_id 
    AND (
      has_role(auth.uid(), 'super_admin'::app_role) OR 
      has_role(auth.uid(), 'warehouse_manager'::app_role) OR 
      has_role(auth.uid(), 'warehouse_staff'::app_role)
    )
  )
);

CREATE POLICY "Admins can update order items" 
ON public.outbound_order_items 
FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM outbound_orders 
    WHERE id = outbound_order_id 
    AND (
      has_role(auth.uid(), 'super_admin'::app_role) OR 
      has_role(auth.uid(), 'warehouse_manager'::app_role) OR 
      has_role(auth.uid(), 'warehouse_staff'::app_role)
    )
  )
);

CREATE POLICY "Admins can delete order items" 
ON public.outbound_order_items 
FOR DELETE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM outbound_orders 
    WHERE id = outbound_order_id 
    AND (
      has_role(auth.uid(), 'super_admin'::app_role) OR 
      has_role(auth.uid(), 'warehouse_manager'::app_role) OR 
      has_role(auth.uid(), 'warehouse_staff'::app_role)
    )
  )
);