-- Migration: seed the real company and bank details used on invoices
--
-- Every field keeps whatever is already there: coalesce(nullif(x,''), …) only
-- fills blanks, so re-running this never clobbers something edited in Settings.
-- company_name is special-cased because the table ships with a placeholder
-- default rather than a blank.

UPDATE public.company_settings
SET
  company_name = CASE
    WHEN coalesce(company_name, '') IN ('', 'H&S E-commerce')
      THEN 'H & S E-commerce Ltd'
    ELSE company_name
  END,
  address_line1  = coalesce(nullif(address_line1, ''),  'Unit 1, Office 1, George Street West'),
  city           = coalesce(nullif(city, ''),           'Blackburn'),
  postal_code    = coalesce(nullif(postal_code, ''),    'BB2 1PQ'),
  country        = coalesce(nullif(country, ''),        'United Kingdom'),
  email          = coalesce(nullif(email, ''),          'handsecommerce@gmail.com'),
  phone          = coalesce(nullif(phone, ''),          '+44 7955 426807'),
  account_name   = coalesce(nullif(account_name, ''),   'H & S ECOMMERCE LTD'),
  account_number = coalesce(nullif(account_number, ''), '56887399'),
  sort_code      = coalesce(nullif(sort_code, ''),      '040003'),
  bank_name      = coalesce(nullif(bank_name, ''),      'Monzo Business')
WHERE id = 1;

DO $$
DECLARE
  v_account text;
BEGIN
  SELECT account_number INTO v_account FROM public.company_settings WHERE id = 1;
  IF v_account IS NULL OR v_account = '' THEN
    RAISE EXCEPTION 'Migration failed: bank details not set';
  END IF;
  RAISE NOTICE 'Company details seeded.';
END $$;
