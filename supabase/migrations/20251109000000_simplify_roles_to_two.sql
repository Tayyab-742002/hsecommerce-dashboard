-- Migration: Simplify role system to only two roles
-- super_admin: Admin/warehouse users
-- customer_admin: Customer users
--
-- SIMPLIFIED VERSION: Only changes the enum (no role updates needed)

-- Step 1: Drop ALL policies that reference the role column or app_role type
-- This is necessary to allow the enum type to be modified

-- PROFILES table policies
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "super_admin can insert profiles" ON public.profiles;

-- USER_ROLES table policies  
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;
DROP POLICY IF EXISTS "super_admin can insert user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "super_admin can update user_roles" ON public.user_roles;

-- CUSTOMERS table policies
DROP POLICY IF EXISTS "Admins can delete customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can update customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can view all customers" ON public.customers;

-- INVENTORY_ITEMS table policies
DROP POLICY IF EXISTS "Admins can manage all inventory" ON public.inventory_items;

-- OUTBOUND_ORDER_ITEMS table policies
DROP POLICY IF EXISTS "Admins can delete order items" ON public.outbound_order_items;
DROP POLICY IF EXISTS "Admins can insert order items" ON public.outbound_order_items;
DROP POLICY IF EXISTS "Admins can update order items" ON public.outbound_order_items;
DROP POLICY IF EXISTS "Users can view order items for accessible orders" ON public.outbound_order_items;

-- OUTBOUND_ORDERS table policies
DROP POLICY IF EXISTS "Admins can manage all orders" ON public.outbound_orders;

-- WAREHOUSES table policies
DROP POLICY IF EXISTS "Admins can manage warehouses" ON public.warehouses;

-- Step 2: Now we can safely modify the enum
-- Create a temporary enum with only 2 values
CREATE TYPE app_role_new AS ENUM ('super_admin', 'customer_admin');

-- Alter the user_roles table to use the new enum
ALTER TABLE public.user_roles 
  ALTER COLUMN role TYPE app_role_new USING role::text::app_role_new;

-- Drop the old enum and rename the new one
DROP TYPE app_role CASCADE;
ALTER TYPE app_role_new RENAME TO app_role;

-- Step 3: Recreate all policies with simplified role checks

-- PROFILES table policies
CREATE POLICY "super_admin can insert profiles"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
      AND ur.role = 'super_admin'::app_role
  )
);

-- USER_ROLES table policies
CREATE POLICY "Admins can manage user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "super_admin can insert user_roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
      AND ur.role = 'super_admin'::app_role
  )
);

CREATE POLICY "super_admin can update user_roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
      AND ur.role = 'super_admin'::app_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
      AND ur.role = 'super_admin'::app_role
  )
);

-- CUSTOMERS table policies
CREATE POLICY "Admins can delete customers"
ON public.customers
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Admins can insert customers"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Admins can update customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Admins can view all customers"
ON public.customers
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- INVENTORY_ITEMS table policies
CREATE POLICY "Admins can manage all inventory"
ON public.inventory_items
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- OUTBOUND_ORDER_ITEMS table policies
CREATE POLICY "Admins can delete order items"
ON public.outbound_order_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.outbound_orders
    WHERE outbound_orders.id = outbound_order_items.outbound_order_id
      AND public.has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Admins can insert order items"
ON public.outbound_order_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.outbound_orders
    WHERE outbound_orders.id = outbound_order_items.outbound_order_id
      AND public.has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Admins can update order items"
ON public.outbound_order_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.outbound_orders
    WHERE outbound_orders.id = outbound_order_items.outbound_order_id
      AND public.has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Users can view order items for accessible orders"
ON public.outbound_order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.outbound_orders
    WHERE outbound_orders.id = outbound_order_items.outbound_order_id
      AND (
        public.has_role(auth.uid(), 'super_admin'::app_role)
        OR outbound_orders.customer_id = public.get_user_customer_id(auth.uid())
      )
  )
);

-- OUTBOUND_ORDERS table policies
CREATE POLICY "Admins can manage all orders"
ON public.outbound_orders
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- WAREHOUSES table policies
CREATE POLICY "Admins can manage warehouses"
ON public.warehouses
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- Step 4: Update the is_super_admin() function to use new role
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'::app_role
  );
$$;

-- Ensure proper ownership and grants
ALTER FUNCTION public.is_super_admin() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon;

-- Step 5: Add comment for documentation
COMMENT ON TYPE app_role IS 'Simplified role system: super_admin (admin/warehouse users), customer_admin (customer users)';

-- Step 6: Verify the migration
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM (SELECT unnest(enum_range(NULL::app_role))) AS roles) <> 2 THEN
    RAISE EXCEPTION 'Migration failed: app_role enum should have exactly 2 values';
  END IF;
  
  IF (SELECT COUNT(DISTINCT role) FROM public.user_roles WHERE role NOT IN ('super_admin', 'customer_admin')) > 0 THEN
    RAISE EXCEPTION 'Migration failed: Found invalid roles in user_roles table';
  END IF;
  
  RAISE NOTICE 'Migration completed successfully! Role system simplified to 2 roles.';
END $$;
