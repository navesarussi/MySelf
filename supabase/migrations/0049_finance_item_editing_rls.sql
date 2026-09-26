-- RLS on finance item-editing tables (0048). Service role only — same posture as 0042/0047.

alter table myself.finance_categories enable row level security;
alter table myself.finance_transaction_splits enable row level security;
alter table myself.finance_fixed_expense_unlinks enable row level security;
