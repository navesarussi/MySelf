-- Personal finance: transactions from Leumi scraper + Apple Pay Shortcuts ingest.

CREATE TABLE IF NOT EXISTS myself.finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('leumi', 'apple_pay', 'manual')),
  external_key text NOT NULL UNIQUE,
  txn_date date NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  kind text NOT NULL DEFAULT 'expense' CHECK (kind IN ('income', 'expense')),
  currency text NOT NULL DEFAULT 'ILS',
  description text NOT NULL DEFAULT '',
  merchant text,
  account_number text,
  card_name text,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed')),
  category text,
  purpose_note text,
  needs_categorization boolean NOT NULL DEFAULT true,
  categorized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_transactions_txn_date_idx
  ON myself.finance_transactions (txn_date DESC);

CREATE INDEX IF NOT EXISTS finance_transactions_needs_cat_idx
  ON myself.finance_transactions (needs_categorization, txn_date DESC)
  WHERE needs_categorization = true;

ALTER TABLE myself.notification_preferences
  ADD COLUMN IF NOT EXISTS finance boolean NOT NULL DEFAULT true;
