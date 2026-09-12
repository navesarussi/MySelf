-- Finance merchant rules + expense_type/is_internal + source extension.

CREATE TABLE IF NOT EXISTS myself.finance_merchant_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_key text NOT NULL UNIQUE,
  category text,
  expense_type text CHECK (expense_type IN ('fixed', 'variable')),
  kind text CHECK (kind IN ('income', 'expense')),
  default_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_merchant_rules_merchant_key_idx
  ON myself.finance_merchant_rules (merchant_key);

ALTER TABLE myself.finance_transactions
  ADD COLUMN IF NOT EXISTS expense_type text CHECK (expense_type IN ('fixed', 'variable')),
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

-- Allow 'max' and 'visa_cal' sources alongside 'leumi', 'apple_pay', 'manual'
ALTER TABLE myself.finance_transactions
  DROP CONSTRAINT IF EXISTS finance_transactions_source_check;

ALTER TABLE myself.finance_transactions
  ADD CONSTRAINT finance_transactions_source_check
  CHECK (source IN ('leumi', 'apple_pay', 'manual', 'max', 'visa_cal'));
