-- A quantity sync corrects a real strategy trade; it is not a reconciliation-created row. Flagging it
-- (reconciliation_kind = 'qty_sync') pushed live book positions out of the account view (2026-09-28).
update myself.trading_trades set reconciliation_kind = null where reconciliation_kind = 'qty_sync';

comment on column myself.trading_trades.reconciliation_kind is
  'Set by broker reconciliation: orphan_close (row created for a broker orphan), journal_flat (closed from fills), journal_flat_unknown (closed without fills). Null = normal strategy trade (quantity syncs are logged in events).';
