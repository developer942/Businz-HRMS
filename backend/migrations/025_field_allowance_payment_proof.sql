BEGIN;

ALTER TABLE public.field_allowance_distributions
  ADD COLUMN IF NOT EXISTS payment_proof_path TEXT;

COMMIT;
