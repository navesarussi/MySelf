-- Cal / credit-card installments + explicit merchant/currency on transactions.

ALTER TABLE myself.finance_transactions
  ADD COLUMN IF NOT EXISTS installment_index smallint CHECK (installment_index IS NULL OR installment_index >= 1),
  ADD COLUMN IF NOT EXISTS installment_total smallint CHECK (installment_total IS NULL OR installment_total >= 1),
  ADD COLUMN IF NOT EXISTS installment_label text;

CREATE INDEX IF NOT EXISTS finance_transactions_installment_idx
  ON myself.finance_transactions (installment_index, installment_total)
  WHERE installment_index IS NOT NULL;
