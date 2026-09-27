-- Fix book_last_bars statement timeouts on STOCKS book_pass.
--
-- Root cause: book_last_bars() did DISTINCT ON (symbol) ORDER BY symbol, t DESC over the
-- full trading_daily_bars table (~2k symbols × ~430 days ≈ 860k rows). The only helper
-- index was (t). The TS client paginated with PostgREST .range(), which re-ran that full
-- scan on every page (2× per tick for ~2k symbols).
--
-- Fix: index (symbol, t desc) for latest-bar lookups, and rewrite the RPC to accept the
-- caller's symbol list and fetch each symbol's latest bar via a lateral index seek.

create index if not exists trading_daily_bars_symbol_t_desc_idx
  on myself.trading_daily_bars (symbol, t desc);

drop function if exists myself.book_last_bars();

create or replace function myself.book_last_bars(p_symbols text[])
returns table (symbol text, t date, c double precision)
language sql
stable
set search_path = ''
as $$
  select s.symbol, b.t, b.c
  from unnest(p_symbols) as s(symbol)
  cross join lateral (
    select t, c
    from myself.trading_daily_bars
    where symbol = s.symbol
    order by t desc
    limit 1
  ) b
$$;

revoke all on function myself.book_last_bars(text[]) from public, anon, authenticated;
grant execute on function myself.book_last_bars(text[]) to service_role;
