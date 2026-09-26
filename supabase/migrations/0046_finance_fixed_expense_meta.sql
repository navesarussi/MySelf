-- Fixed-expense metadata on merchant rules (planned amount, charge cadence, pause).

ALTER TABLE myself.finance_merchant_rules
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS planned_amount numeric(14, 2) CHECK (planned_amount IS NULL OR planned_amount >= 0),
  ADD COLUMN IF NOT EXISTS charge_day int CHECK (charge_day IS NULL OR (charge_day >= 1 AND charge_day <= 31)),
  ADD COLUMN IF NOT EXISTS frequency text CHECK (frequency IS NULL OR frequency IN ('monthly', 'weekly', 'yearly')),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
