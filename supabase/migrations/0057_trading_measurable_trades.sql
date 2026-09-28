-- Trading phase 2: mark exit-price confirmation and backfill from settlement state.
--
-- Strategy metrics exclude manual closes whose exit was estimated (no broker fill)
-- or never confirmed. broker_settled_at already means both entry and exit fills
-- were read from Alpaca/Binance activity; this column captures the manual-close
-- cases settle has not reached yet.

alter table myself.trading_trades add column if not exists exit_price_confirmed boolean;

comment on column myself.trading_trades.exit_price_confirmed is
  'True when the exit price came from a broker fill (flatten or settle). False for estimated manual closes. Null while pending settlement.';

-- Broker-settled rows: both sides confirmed from order fills.
update myself.trading_trades
set exit_price_confirmed = true
where broker_settled_at is not null
  and exit_price_confirmed is distinct from true;

-- Reconciliation rows stay excluded via reconciliation_kind — leave exit_price_confirmed null.

-- Closed manual exits without settlement: estimated or unconfirmed at the journal.
update myself.trading_trades
set exit_price_confirmed = false
where broker_settled_at is null
  and state = 'CLOSED'
  and reconciliation_kind is null
  and exit_reason = 'MANUAL'
  and exit_price_confirmed is null;

-- Other closed broker trades still waiting for settle: leave null (not yet measurable).
