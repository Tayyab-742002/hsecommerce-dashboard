Diagnostic query to test if has_role() function works correctly
Run this in Supabase SQL Editor to verify the function is working

This query should return true for super_admin users
Replace 'YOUR_USER_ID' with your actual user ID from auth.users
SELECT public.has_role('YOUR_USER_ID'::uuid, 'super_admin'::app_role);

Test query to check if the function can read from user_roles
This should show all user roles (since function is SECURITY DEFINER)
SELECT user_id, role FROM public.user_roles;

Verify function exists and is SECURITY DEFINER
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'has_role';

