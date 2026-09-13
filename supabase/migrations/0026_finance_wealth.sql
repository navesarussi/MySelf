-- Wealth snapshots: pension, insurance, investments (manual / import / agent).

CREATE TABLE IF NOT EXISTS myself.finance_wealth_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('pension', 'insurance', 'investment', 'property', 'other')),
  name text NOT NULL,
  provider text,
  balance numeric(14, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency text NOT NULL DEFAULT 'ILS',
  notes text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'cover_import', 'har_bituach', 'agent')),
  as_of_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_wealth_items_category_idx
  ON myself.finance_wealth_items (category, updated_at DESC);
