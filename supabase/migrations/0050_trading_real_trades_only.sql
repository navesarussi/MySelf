-- Trading: only real trades on the Alpaca demo account.
--
-- The journal mixed three kinds of rows: trades Alpaca executed, intraday
-- trades the simulator filled on its own because the coin is not listed at
-- Alpaca (86 closed + 5 open, 2026-09-14 → 26), and the daily-trend
-- DETERMINISTIC/SHADOW baseline (12). The simulated rows counted toward the
-- account's equity, its daily/weekly halts and its open-position caps as if
-- they were money. From now on nothing is simulated; the old rows move to an
-- archive table — kept, not deleted, and out of every account read path.

-- Set once a trade's P&L and R were recomputed from Alpaca's fills (lib/trading/broker/settle.ts).
alter table myself.trading_trades add column if not exists broker_settled_at timestamptz;

create table if not exists myself.trading_trades_archive (like myself.trading_trades including all);
alter table myself.trading_trades_archive add column if not exists archived_at timestamptz not null default now();
alter table myself.trading_trades_archive add column if not exists archive_reason text;
alter table myself.trading_trades_archive enable row level security;

-- Lessons keep their text; they just stop pointing at a trade that is no longer in the journal.
update myself.trading_lessons
set trade_id = null
where trade_id in (
  select id from myself.trading_trades
  where broker is null or execution <> 'PAPER' or track <> 'AGENT'
);

with moved as (
  delete from myself.trading_trades
  where broker is null or execution <> 'PAPER' or track <> 'AGENT'
  returning *
)
insert into myself.trading_trades_archive
select moved.*, now(), case when moved.execution = 'SHADOW' or moved.track <> 'AGENT' then 'shadow_baseline' else 'simulated_not_at_broker' end
from moved;
