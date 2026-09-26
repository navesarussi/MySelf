-- Finance merchant display cleanup (companion to scripts/finance/normalize-merchant-display.ts).
-- Strips leading Cal OCR "לא הוראת קבע" noise from display_name where stored verbatim.

UPDATE myself.finance_merchant_rules
SET
  display_name = trim(regexp_replace(display_name, '^(?:לא\s*)?(?:הוראת\s+קבע\s*)+', '', 'i')),
  updated_at = now()
WHERE display_name ~* '^(?:לא\s*)?(?:הוראת\s+קבע)';

UPDATE myself.finance_merchant_rules
SET
  merchant_key = trim(regexp_replace(merchant_key, '^(?:לא\s*)?(?:הוראת\s+קבע\s*)+', '', 'i')),
  updated_at = now()
WHERE merchant_key ~* '^(?:לא\s*)?(?:הוראת\s+קבע)';
