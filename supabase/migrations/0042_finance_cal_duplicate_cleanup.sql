-- One-shot cleanup: remove Cal PDF OCR garbage duplicate rows when a clean sibling
-- exists (same txn_date, amount, source). Idempotent — safe to re-run.

-- 1) Delete garbage clones when a clean row exists for the same charge.
DELETE FROM myself.finance_transactions AS garbage
WHERE garbage.source = 'visa_cal'
  AND (
    garbage.merchant ~* 'לא\s*הוראת\s*קבע'
    OR garbage.merchant ~* 'לאהוראתקבע'
    OR garbage.description ~* 'לא\s*הוראת\s*קבע'
    OR garbage.description ~* 'לאהוראתקבע'
  )
  AND EXISTS (
    SELECT 1
    FROM myself.finance_transactions AS clean
    WHERE clean.id <> garbage.id
      AND clean.source = garbage.source
      AND clean.txn_date = garbage.txn_date
      AND clean.amount = garbage.amount
      AND NOT (
        clean.merchant ~* 'לא\s*הוראת\s*קבע'
        OR clean.merchant ~* 'לאהוראתקבע'
        OR clean.description ~* 'לא\s*הוראת\s*קבע'
        OR clean.description ~* 'לאהוראתקבע'
      )
  );

-- 2) Collapse pure-garbage twins (no clean sibling): keep the oldest row per charge.
DELETE FROM myself.finance_transactions AS garbage
WHERE garbage.source = 'visa_cal'
  AND (
    garbage.merchant ~* 'לא\s*הוראת\s*קבע'
    OR garbage.merchant ~* 'לאהוראתקבע'
    OR garbage.description ~* 'לא\s*הוראת\s*קבע'
    OR garbage.description ~* 'לאהוראתקבע'
  )
  AND garbage.id NOT IN (
    SELECT DISTINCT ON (txn_date, amount, source)
      id
    FROM myself.finance_transactions
    WHERE source = 'visa_cal'
      AND (
        merchant ~* 'לא\s*הוראת\s*קבע'
        OR merchant ~* 'לאהוראתקבע'
        OR description ~* 'לא\s*הוראת\s*קבע'
        OR description ~* 'לאהוראתקבע'
      )
    ORDER BY txn_date, amount, source, created_at ASC, id ASC
  );
