-- Fund-grade phase 1 (docs/superpowers/specs/2026-09-30-trading-fund-grade-phase1-design.md).
--
-- trading_book_signals: every book signal of every pass and what happened to it (ENTERED or the block reason).
-- trading_nav_daily: the account's daily NAV from Alpaca portfolio history, cash flows split out, per-strategy
--   attribution (by_strategy, $) with an exact residual (unattributed), per-trade marks for the next day's delta.
-- trading_model_book: the research engine's book on the live universe (per group and bar) — live vs model.
-- trading_settings.health: the last health report (lib/trading/fund/health.ts).

create table if not exists myself.trading_book_signals (
  id bigint generated always as identity primary key,
  bar date not null,
  grp text not null,
  strategy text not null,
  symbol text not null,
  score double precision,
  entry double precision not null,
  stop double precision not null,
  target double precision,
  planned_size double precision,
  planned_risk_usd double precision,
  decision text not null,
  trade_id uuid,
  created_at timestamptz not null default now(),
  unique (bar, strategy, symbol)
);
alter table myself.trading_book_signals enable row level security;
create index if not exists trading_book_signals_bar_idx on myself.trading_book_signals (bar desc);
create index if not exists trading_book_signals_trade_idx on myself.trading_book_signals (trade_id) where trade_id is not null;

create table if not exists myself.trading_nav_daily (
  day date primary key,
  equity numeric(16, 2) not null,
  cash_flow numeric(16, 2) not null default 0,
  pnl numeric(16, 2) not null default 0,
  twr_return double precision not null default 0,
  nav_index double precision not null,
  peak_index double precision not null,
  drawdown double precision not null default 0,
  pre_book boolean not null default false,
  by_strategy jsonb,
  unattributed numeric(16, 2),
  marks jsonb,
  updated_at timestamptz not null default now()
);
alter table myself.trading_nav_daily enable row level security;

create table if not exists myself.trading_model_book (
  day date not null,
  grp text not null,
  day_return double precision not null,
  equity double precision not null,
  positions jsonb not null default '[]'::jsonb,
  trades jsonb not null default '[]'::jsonb,
  duration_ms integer,
  created_at timestamptz not null default now(),
  primary key (day, grp)
);
alter table myself.trading_model_book enable row level security;

alter table myself.trading_settings add column if not exists health jsonb;
