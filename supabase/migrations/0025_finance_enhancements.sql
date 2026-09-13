-- Custom categories, savings expense type, txn time, weekly budget override.

ALTER TABLE myself.finance_transactions
  ADD COLUMN IF NOT EXISTS txn_time time;

ALTER TABLE myself.finance_transactions
  DROP CONSTRAINT IF EXISTS finance_transactions_expense_type_check;

ALTER TABLE myself.finance_transactions
  ADD CONSTRAINT finance_transactions_expense_type_check
  CHECK (expense_type IS NULL OR expense_type IN ('fixed', 'variable', 'savings'));

ALTER TABLE myself.finance_merchant_rules
  DROP CONSTRAINT IF EXISTS finance_merchant_rules_expense_type_check;

ALTER TABLE myself.finance_merchant_rules
  ADD CONSTRAINT finance_merchant_rules_expense_type_check
  CHECK (expense_type IS NULL OR expense_type IN ('fixed', 'variable', 'savings'));

ALTER TABLE myself.finance_month_plans
  ADD COLUMN IF NOT EXISTS weekly_budget_override numeric(14, 2) CHECK (weekly_budget_override IS NULL OR weekly_budget_override >= 0);
