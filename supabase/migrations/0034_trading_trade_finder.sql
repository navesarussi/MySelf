-- "Search trade" button + wider intraday universe (2026-09-14, testing phase, paper only).
-- trading_intraday_universe: rebuilt daily from liquidity (Binance crypto ≥ $10M/day; Alpaca-listed stocks ≥ $50M/day, ATR ≥ 1.5%, top 150).
-- trading_proposals: short-lived agent trade plans; "enter now" consumes one (status PROPOSED → ENTERED).

CREATE TABLE IF NOT EXISTS myself.trading_intraday_universe (
  symbol text PRIMARY KEY,
  asset_class text NOT NULL CHECK (asset_class IN ('STOCK', 'CRYPTO_MAJOR', 'CRYPTO_ALT')),
  provider_symbol text NOT NULL,
  dollar_volume numeric NOT NULL DEFAULT 0,
  atr_pct numeric,
  price numeric NOT NULL DEFAULT 0,
  broker_tradable boolean NOT NULL DEFAULT false,
  rank integer NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE myself.trading_intraday_universe ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS myself.trading_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'ENTERED', 'EXPIRED')),
  symbol text NOT NULL,
  payload jsonb NOT NULL,
  trade_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trading_proposals_created_idx ON myself.trading_proposals (created_at DESC);
ALTER TABLE myself.trading_proposals ENABLE ROW LEVEL SECURITY;

ALTER TABLE myself.trading_settings ADD COLUMN IF NOT EXISTS last_intraday_universe_date date;
