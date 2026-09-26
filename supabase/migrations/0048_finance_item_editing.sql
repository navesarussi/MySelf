-- Finance item editing: category metadata, splits, fixed-expense unlinks, soft delete.

CREATE TABLE IF NOT EXISTS myself.finance_categories (
  name text PRIMARY KEY,
  default_type text CHECK (default_type IN ('fixed', 'variable', 'savings', 'income')),
  weekly_budget numeric(14, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS myself.finance_transaction_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_txn_id uuid NOT NULL REFERENCES myself.finance_transactions(id) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  category text,
  expense_type text CHECK (expense_type IN ('fixed', 'variable', 'savings')),
  kind text NOT NULL DEFAULT 'expense' CHECK (kind IN ('income', 'expense')),
  note text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_splits_parent ON myself.finance_transaction_splits(parent_txn_id);

CREATE TABLE IF NOT EXISTS myself.finance_fixed_expense_unlinks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES myself.finance_merchant_rules(id) ON DELETE CASCADE,
  merchant_key text NOT NULL,
  txn_id uuid NOT NULL REFERENCES myself.finance_transactions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (txn_id, merchant_key)
);

CREATE INDEX IF NOT EXISTS idx_finance_unlinks_rule ON myself.finance_fixed_expense_unlinks(rule_id);
CREATE INDEX IF NOT EXISTS idx_finance_unlinks_merchant ON myself.finance_fixed_expense_unlinks(merchant_key);

ALTER TABLE myself.finance_transactions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_finance_txn_not_deleted ON myself.finance_transactions(deleted_at)
  WHERE deleted_at IS NULL;
