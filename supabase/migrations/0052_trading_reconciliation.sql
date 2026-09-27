-- Phase 1 broker/journal reconciliation: flag rows created or closed by the
-- reconcile pass so they are excluded from strategy P&L and gate metrics.
alter table myself.trading_trades add column if not exists reconciliation_kind text;

create index if not exists trading_trades_reconciliation_kind_idx
  on myself.trading_trades (reconciliation_kind)
  where reconciliation_kind is not null;

comment on column myself.trading_trades.reconciliation_kind is
  'Set by broker reconciliation: orphan_close, journal_flat, journal_flat_unknown, qty_sync. Null = normal strategy trade.';
