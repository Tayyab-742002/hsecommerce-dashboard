-- Migration: deleting a customer also deletes their logins
--
-- Deleting a customer cascaded their user_roles row and nulled profiles.customer_id,
-- but left the auth.users row behind. Two consequences:
--   * the person could still authenticate (landing nowhere, but still)
--   * their email stayed reserved, so re-adding the same customer later failed
--     with "user already registered"
--
-- The trigger is BEFORE DELETE on purpose: the user_roles rows that link a login
-- to this customer are removed by the foreign key cascade, so by AFTER DELETE
-- there is nothing left to look the logins up by.
--
-- Deleting from auth.users cascades to auth.identities, auth.sessions,
-- public.profiles and public.user_roles, so no orphans remain.

CREATE OR REPLACE FUNCTION public.delete_customer_auth_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Scoped to customer_admin: an admin account mistakenly linked to a customer
  -- must never be removed by deleting that customer.
  DELETE FROM auth.users
  WHERE id IN (
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.customer_id = OLD.id
      AND ur.role = 'customer_admin'::app_role
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_delete_auth_users ON public.customers;
CREATE TRIGGER trg_customers_delete_auth_users
BEFORE DELETE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.delete_customer_auth_users();

REVOKE ALL ON FUNCTION public.delete_customer_auth_users FROM public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_customers_delete_auth_users'
  ) THEN
    RAISE EXCEPTION 'Migration failed: customer auth cleanup trigger not created';
  END IF;
  RAISE NOTICE 'Customer deletion now removes the linked logins.';
END $$;
