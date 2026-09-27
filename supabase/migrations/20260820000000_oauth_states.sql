-- Migration: short-lived OAuth handshake state for redirect-based
-- providers (Etsy first; eBay reuses the same table later). A row here is
-- the *only* thing the callback trusts to know which customer/provider is
-- being connected — the callback itself is unauthenticated (the browser
-- arrives from the provider's redirect with no session), so this table is
-- the security boundary, not the query string.

CREATE TABLE public.oauth_states (
  state         text PRIMARY KEY,
  provider      text NOT NULL CHECK (provider IN ('etsy','ebay')),
  customer_id   uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  code_verifier text,
  app_origin    text NOT NULL,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  consumed_at   timestamptz,
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Zero policies on purpose — service-role only, same posture as
-- customer_integration_secrets. Nothing here should ever be readable via
-- the anon/authenticated roles.
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oauth_states FROM anon, authenticated;

CREATE INDEX idx_oauth_states_expires_at ON public.oauth_states(expires_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'oauth_states') THEN
    RAISE EXCEPTION 'Migration failed: oauth_states table not created';
  END IF;
  RAISE NOTICE 'OAuth states migration completed successfully.';
END $$;
