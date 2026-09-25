-- Store foreign-currency original amounts separately; amount column holds ILS for totals.

ALTER TABLE myself.finance_transactions
  ADD COLUMN IF NOT EXISTS original_amount numeric(14, 2),
  ADD COLUMN IF NOT EXISTS amount_ils numeric(14, 2),
  ADD COLUMN IF NOT EXISTS ils_estimated boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN myself.finance_transactions.original_amount IS
  'Charge amount in original currency (e.g. USD) when currency != ILS';
COMMENT ON COLUMN myself.finance_transactions.amount_ils IS
  'ILS equivalent used for cashflow totals; mirrors amount for ILS rows';
COMMENT ON COLUMN myself.finance_transactions.ils_estimated IS
  'True when amount_ils was computed from FX table rather than statement ILS charge';
