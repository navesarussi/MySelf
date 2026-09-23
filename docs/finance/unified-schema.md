# Finance unified schema (Phase-1 import → analysis bot)

Short contract for downstream consumers (New Bot, agents, exports). Amounts use **positive `amount` + `kind`** (`income` | `expense`); signed value = `kind === "income" ? +amount : -amount`.

## Enums

| Field | Values |
|---|---|
| `finance_accounts.source` | `leumi`, `cal`, `max`, `excel`, `manual` |
| `finance_import_batches.source` | same as accounts |
| `finance_import_batches.status` | `processing`, `completed`, `failed`, `partial` |
| `finance_transactions.source` | `leumi`, `visa_cal` (Cal), `max`, `excel`, `manual`, `apple_pay` |

## `finance_accounts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | text | Session email or `owner` (legacy token) |
| `source` | enum | Import source |
| `label` | text | e.g. `Cal Visa Leumi`, `Bank Leumi` |
| `currency` | text | Default `ILS` |
| `metadata` | jsonb | Leumi annual snapshot, card mask, limits |

## `finance_import_batches`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | text | Owner |
| `source` | enum | Detected or user-selected |
| `account_id` | uuid? | Linked account |
| `filename` | text | Original upload name |
| `status` | enum | Batch outcome |
| `row_counts` | jsonb | `{ imported, skipped, errors }` |
| `errors` | jsonb | `[{ line?, message }]` |

## `finance_transactions` (existing table + import columns)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | text? | Set on file import |
| `account_id` | uuid? | FK → `finance_accounts` |
| `import_batch_id` | uuid? | FK → `finance_import_batches` |
| `source_ref` | text? | Dedupe key `(user_id, source_ref)` |
| `raw` | jsonb? | Parser debug payload |
| `txn_date` | date | Booked date (`booked_at` in bot docs) |
| `amount` | numeric | Always **positive** |
| `kind` | text | `income` \| `expense` |
| `description` | text | |
| `merchant` | text? | Normalized payee |
| `category` | text? | Nullable until categorized |
| `source` | text | Provider id (see enum) |
| `external_key` | text | Global dedupe (same as `source_ref` for imports) |

## Bot read query (suggested)

```sql
SELECT
  t.id,
  t.txn_date AS booked_at,
  CASE WHEN t.kind = 'income' THEN t.amount ELSE -t.amount END AS signed_amount,
  t.amount,
  t.kind,
  t.currency,
  t.description,
  t.merchant,
  t.category,
  t.source,
  a.label AS account_label,
  a.source AS account_source,
  b.filename AS import_filename
FROM myself.finance_transactions t
LEFT JOIN myself.finance_accounts a ON a.id = t.account_id
LEFT JOIN myself.finance_import_batches b ON b.id = t.import_batch_id
WHERE t.user_id = $1
ORDER BY t.txn_date DESC, t.created_at DESC;
```

## Out of scope (Phase-1)

- Bank / Cal / Max passwords, cookies, or browser scraping
- Automatic scheduled sync from credentials in env or Git
