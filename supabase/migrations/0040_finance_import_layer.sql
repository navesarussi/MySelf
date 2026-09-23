-- Phase-1 finance import layer: accounts, import batches, transaction provenance.
-- Auth is enforced in Next.js API routes (service-role client); RLS enabled with
-- no policies matches other sensitive myself.* tables.

CREATE TABLE IF NOT EXISTS myself.finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  source text NOT NULL CHECK (source IN ('leumi', 'cal', 'max', 'excel', 'manual')),
  label text NOT NULL,
  currency text NOT NULL DEFAULT 'ILS',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_accounts_user_source_idx
  ON myself.finance_accounts (user_id, source);

CREATE TABLE IF NOT EXISTS myself.finance_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  source text NOT NULL CHECK (source IN ('leumi', 'cal', 'max', 'excel', 'manual')),
  account_id uuid REFERENCES myself.finance_accounts (id) ON DELETE SET NULL,
  filename text NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed', 'partial')),
  row_counts jsonb NOT NULL DEFAULT '{"imported":0,"skipped":0,"errors":0}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS finance_import_batches_user_created_idx
  ON myself.finance_import_batches (user_id, created_at DESC);

ALTER TABLE myself.finance_transactions
  ADD COLUMN IF NOT EXISTS user_id text,
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES myself.finance_accounts (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES myself.finance_import_batches (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS raw jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS finance_transactions_user_source_ref_idx
  ON myself.finance_transactions (user_id, source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_transactions_import_batch_idx
  ON myself.finance_transactions (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

ALTER TABLE myself.finance_transactions
  DROP CONSTRAINT IF EXISTS finance_transactions_source_check;

ALTER TABLE myself.finance_transactions
  ADD CONSTRAINT finance_transactions_source_check
  CHECK (source IN ('leumi', 'apple_pay', 'manual', 'max', 'visa_cal', 'excel'));

ALTER TABLE myself.finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE myself.finance_import_batches ENABLE ROW LEVEL SECURITY;
