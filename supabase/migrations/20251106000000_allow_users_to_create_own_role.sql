-- Fix: Ensure has_role() function can properly read from user_roles table
-- even when RLS is enabled. SECURITY DEFINER functions should bypass RLS,
-- but we need to ensure proper configuration.

-- Use CREATE OR REPLACE to update the functions without dropping them
-- This preserves the dependencies (RLS policies) that reference these functions

-- Recreate has_role function with explicit SECURITY DEFINER
-- This function runs with the privileges of the function owner (postgres)
-- and will bypass RLS policies on the user_roles table
-- Note: Using SQL language to match original, and CREATE OR REPLACE to preserve dependencies
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- SECURITY DEFINER functions run as the function owner (postgres)
  -- and automatically bypass RLS, so this query will work regardless
  -- of RLS policies on user_roles
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Grant execute permission to authenticated users and anon (if needed)
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO anon;

-- Recreate get_user_customer_id function
CREATE OR REPLACE FUNCTION public.get_user_customer_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- SECURITY DEFINER functions run as the function owner (postgres)
  -- and automatically bypass RLS
  SELECT customer_id
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_customer_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_customer_id(UUID) TO anon;

-- Ensure the functions are owned by postgres (they should be by default)
-- This ensures they have full privileges to bypass RLS
-- Note: In Supabase, functions are typically owned by postgres, but we explicitly set it
ALTER FUNCTION public.has_role(UUID, app_role) OWNER TO postgres;
ALTER FUNCTION public.get_user_customer_id(UUID) OWNER TO postgres;

-- Critical: Verify that SECURITY DEFINER functions bypass RLS
-- In PostgreSQL, SECURITY DEFINER functions run with the privileges of the function owner
-- and should automatically bypass RLS. However, if this is not working, we may need
-- to check Supabase-specific configuration or use a service role key for admin operations.

-- Alternative approach: If the function still doesn't work, we might need to
-- grant the postgres role (function owner) explicit SELECT permission on user_roles
-- However, this should not be necessary as the function owner should have full access
GRANT SELECT ON public.user_roles TO postgres;

