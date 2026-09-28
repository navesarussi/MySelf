-- book_series: one sorted pass per symbol batch (avoids six separate array_agg sorts spilling work_mem).
-- Reconcile data fix: clear wrongful qty_sync tags on open trades; restore SYRE size.

create index if not exists trading_daily_bars_symbol_t_asc_idx
  on myself.trading_daily_bars (symbol, t);

create or replace function myself.book_series(p_symbols text[], p_since date)
returns table (symbol text, t date[], o double precision[], h double precision[], l double precision[], c double precision[], v double precision[])
language sql
stable
set search_path = ''
as $$
  select s.symbol,
         array_agg(s.t order by s.t),
         array_agg(s.o order by s.t),
         array_agg(s.h order by s.t),
         array_agg(s.l order by s.t),
         array_agg(s.c order by s.t),
         array_agg(s.v order by s.t)
  from (
    select b.symbol, b.t, b.o, b.h, b.l, b.c, b.v
    from myself.trading_daily_bars b
    where b.symbol = any (p_symbols) and b.t >= p_since
    order by b.symbol, b.t
  ) s
  group by s.symbol
$$;

revoke all on function myself.book_series(text[], date) from public, anon, authenticated;
grant execute on function myself.book_series(text[], date) to service_role;

-- qty_sync was applied to open book trades during partial entry fills — exclude them from P&L wrongly.
update myself.trading_trades
set reconciliation_kind = null,
    updated_at = now()
where reconciliation_kind = 'qty_sync'
  and state in ('OPEN', 'RISK_FREE', 'PENDING');

-- SYRE: journal drifted to 14 while broker and remaining_size stayed 26.
update myself.trading_trades
set position_size = 26,
    remaining_size = 26,
    sim_state = jsonb_set(
      jsonb_set(sim_state, '{size}', '26'::jsonb),
      '{initial_size}', '26'::jsonb
    ),
    updated_at = now()
where symbol = 'SYRE'
  and state in ('OPEN', 'RISK_FREE')
  and position_size = 14
  and remaining_size = 26;
