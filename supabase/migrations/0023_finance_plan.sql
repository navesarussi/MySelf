-- Monthly cash-flow plan (Riseup-style): fixed / variable / planned / savings lines.

CREATE TABLE IF NOT EXISTS myself.finance_month_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL UNIQUE CHECK (month ~ '^\d{4}-\d{2}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS myself.finance_plan_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES myself.finance_month_plans(id) ON DELETE CASCADE,
  line_type text NOT NULL CHECK (line_type IN ('income', 'fixed', 'variable', 'planned', 'savings')),
  name text NOT NULL,
  category text,
  planned_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (planned_amount >= 0),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_plan_lines_plan_idx
  ON myself.finance_plan_lines (plan_id, line_type, sort_order);
