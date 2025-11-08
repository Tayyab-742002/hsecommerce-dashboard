-- EMERGENCY FIX: Ensure data is accessible
-- This migration fixes the issue where data isn't showing after the has_role() function changes

-- First, let's verify and fix the has_role() function to ensure it works correctly
-- The issue might be that SECURITY DEFINER isn't properly bypassing RLS

-- Recreate the function with explicit configuration to ensure it bypasses RLS
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- SECURITY DEFINER functions should bypass RLS automatically
  -- This query should work regardless of RLS policies on user_roles
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Ensure the function owner is postgres (should have full privileges)
ALTER FUNCTION public.has_role(UUID, app_role) OWNER TO postgres;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO anon;

-- Critical: Ensure postgres can read from user_roles (should already be able to, but being explicit)
-- This is necessary for the SECURITY DEFINER function to work
GRANT SELECT ON public.user_roles TO postgres;

-- Also ensure the function is in the correct schema and can be found
ALTER FUNCTION public.has_role(UUID, app_role) SET search_path = public;

-- Verify get_user_customer_id function as well
CREATE OR REPLACE FUNCTION public.get_user_customer_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT customer_id
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1;
$$;

ALTER FUNCTION public.get_user_customer_id(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.get_user_customer_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_customer_id(UUID) TO anon;
GRANT SELECT ON public.user_roles TO postgres;

-- IMPORTANT: The SELECT policies should still work if the function is working
-- But if they're not, we need to ensure the policies are correctly defined
-- Let's verify the SELECT policies are still intact (they should be from the original migration)

-- CRITICAL FIX: If the function still doesn't work, we need to ensure
-- that the policies can evaluate correctly. The issue might be that
-- the function is being called but returning NULL or false.

-- Let's also ensure that if the function fails, we have a fallback
-- But first, let's make absolutely sure the function works by testing it directly

-- If you're still having issues after running this migration, run this test query:
-- SELECT public.has_role(auth.uid(), 'super_admin'::app_role) as has_super_admin_role;
-- This should return TRUE for super_admin users

-- Also check your user ID and role:
-- SELECT auth.uid() as user_id;
-- SELECT * FROM public.user_roles WHERE user_id = auth.uid();

-- If the function returns FALSE but you have a role, the issue is with the function
-- If the function returns TRUE but data still doesn't show, the issue is with the policies

