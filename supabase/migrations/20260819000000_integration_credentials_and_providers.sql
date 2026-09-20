-- Migration: widen integration credential storage and provider list for
-- multi-platform integrations (Shopify/Etsy/eBay/Amazon join Royal Mail).
-- Non-breaking: existing Royal Mail rows are backfilled, and the legacy
-- api_key column is left in place (nullable) for one release so the
-- currently-deployed edge functions keep working until the new ones ship.

-- ─────────────────────────────────────────
-- 1. WIDEN PROVIDER LIST
-- ─────────────────────────────────────────
ALTER TABLE public.customer_integrations
  DROP CONSTRAINT customer_integrations_provider_check;
ALTER TABLE public.customer_integrations
  ADD CONSTRAINT customer_integrations_provider_check
  CHECK (provider IN ('royal_mail','shopify','etsy','ebay','amazon'));

-- ─────────────────────────────────────────
-- 2. NON-SECRET CONNECTION METADATA + IMPORT SETTINGS
-- config holds things like shop domain/id, granted scopes, warehouse
-- defaults — safe for the owning customer to read.
-- ─────────────────────────────────────────
ALTER TABLE public.customer_integrations
  ADD COLUMN config                 jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN import_orders          boolean NOT NULL DEFAULT false,
  ADD COLUMN import_labels          boolean NOT NULL DEFAULT true,
  ADD COLUMN default_warehouse_id   uuid REFERENCES public.warehouses(id),
  ADD COLUMN default_pick_pack_rate numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN orders_last_synced_at  timestamptz,
  ADD COLUMN syncing_since          timestamptz;

COMMENT ON COLUMN public.customer_integrations.last_synced_at IS
  'Cursor for LABEL sync only. Order import uses orders_last_synced_at.';
COMMENT ON COLUMN public.customer_integrations.syncing_since IS
  'Set while a sync run holds the claim on this integration; used to prevent overlapping runs.';

-- ─────────────────────────────────────────
-- 3. FLEXIBLE SECRET STORAGE
-- credentials holds whatever shape a provider needs (api_key, or
-- access_token/refresh_token for OAuth providers). Still service-role only
-- — no RLS policies are added for authenticated/anon, same as today.
-- ─────────────────────────────────────────
ALTER TABLE public.customer_integration_secrets
  ADD COLUMN credentials             jsonb,
  ADD COLUMN access_token_expires_at timestamptz,
  ADD COLUMN refresh_failed_at       timestamptz,
  ADD COLUMN refresh_error          text;

UPDATE public.customer_integration_secrets
   SET credentials = jsonb_build_object('api_key', api_key)
 WHERE credentials IS NULL AND api_key IS NOT NULL;

ALTER TABLE public.customer_integration_secrets
  ALTER COLUMN api_key DROP NOT NULL;

CREATE INDEX idx_integration_secrets_expiry
  ON public.customer_integration_secrets(access_token_expires_at)
  WHERE access_token_expires_at IS NOT NULL;

-- Defence in depth: RLS-with-zero-policies is already deny-by-default, but
-- explicitly revoking table grants means an accidental future
-- `CREATE POLICY ... FOR ALL` on this table still can't expose secrets to
-- anon/authenticated without also re-granting table privileges.
REVOKE ALL ON public.customer_integration_secrets FROM anon, authenticated;

-- ─────────────────────────────────────────
-- 4. VERIFY
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_integration_secrets' AND column_name = 'credentials'
  ) THEN
    RAISE EXCEPTION 'Migration failed: credentials column not added';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.customer_integration_secrets WHERE api_key IS NOT NULL AND credentials IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration failed: existing api_key rows were not backfilled into credentials';
  END IF;
  RAISE NOTICE 'Integration credentials/providers migration completed successfully.';
END $$;
