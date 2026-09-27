-- Multi-strategy book (lib/trading/book/**): every liquid asset at Alpaca, crypto and stocks.
--
-- trading_book_universe: rebuilt daily from Alpaca's tradable list + recent liquidity (price ≥ $10,
-- ≥ $20M/day for stocks and ETFs; crypto listed at Alpaca with a liquid Binance market).
-- trading_daily_bars: split-adjusted daily bars kept incrementally — ~2,000 stocks × a year of history
-- is too much to pull from the data API on every pass, but one new bar per symbol a day is two requests.

create table if not exists myself.trading_book_universe (
  symbol text primary key,
  asset_class text not null check (asset_class in ('STOCK', 'CRYPTO_MAJOR', 'CRYPTO_ALT')),
  grp text not null check (grp in ('STOCKS', 'ETF', 'CRYPTO')),
  provider_symbol text not null,
  name text,
  dollar_volume numeric not null default 0,
  price numeric,
  enabled boolean not null default true,
  refreshed_at timestamptz not null default now()
);
alter table myself.trading_book_universe enable row level security;
create index if not exists trading_book_universe_grp_idx on myself.trading_book_universe (grp) where enabled;

create table if not exists myself.trading_daily_bars (
  symbol text not null,
  t date not null,
  o double precision not null,
  h double precision not null,
  l double precision not null,
  c double precision not null,
  v double precision not null default 0,
  primary key (symbol, t)
);
alter table myself.trading_daily_bars enable row level security;
create index if not exists trading_daily_bars_t_idx on myself.trading_daily_bars (t);

-- Last daily bar each group was processed for (idempotent passes) + backfill bookkeeping.
alter table myself.trading_settings add column if not exists book_state jsonb not null default '{}'::jsonb;

-- One row per symbol with its series packed as arrays: a pass reads a year of bars for every stock in a
-- handful of calls instead of paging through half a million rows.
create or replace function myself.book_series(p_symbols text[], p_since date)
returns table (symbol text, t date[], o double precision[], h double precision[], l double precision[], c double precision[], v double precision[])
language sql
stable
set search_path = ''
as $$
  select b.symbol,
         array_agg(b.t order by b.t),
         array_agg(b.o order by b.t),
         array_agg(b.h order by b.t),
         array_agg(b.l order by b.t),
         array_agg(b.c order by b.t),
         array_agg(b.v order by b.t)
  from myself.trading_daily_bars b
  where b.symbol = any (p_symbols) and b.t >= p_since
  group by b.symbol
$$;

-- Latest stored bar per symbol (what the incremental sync appends after).
create or replace function myself.book_last_bars()
returns table (symbol text, t date, c double precision)
language sql
stable
set search_path = ''
as $$
  select distinct on (b.symbol) b.symbol, b.t, b.c
  from myself.trading_daily_bars b
  order by b.symbol, b.t desc
$$;

revoke all on function myself.book_series(text[], date) from public, anon, authenticated;
revoke all on function myself.book_last_bars() from public, anon, authenticated;
grant execute on function myself.book_series(text[], date) to service_role;
grant execute on function myself.book_last_bars() to service_role;
