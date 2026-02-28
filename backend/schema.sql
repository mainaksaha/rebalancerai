-- RebalancerAI Database Schema

CREATE TABLE IF NOT EXISTS portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Portfolio',
  cash_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  shares DECIMAL(12,4) NOT NULL,
  avg_cost DECIMAL(12,4) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(portfolio_id, ticker)
);

CREATE TABLE IF NOT EXISTS rebalance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  orders JSONB NOT NULL,
  aggressiveness DECIMAL(3,2) NOT NULL,
  alignment_before DECIMAL(5,2),
  alignment_after DECIMAL(5,2)
);

CREATE TABLE IF NOT EXISTS rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('hard', 'soft')),
  priority INTEGER NOT NULL DEFAULT 5,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rebalance_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own portfolios" ON portfolios FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own holdings" ON holdings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own history" ON rebalance_history FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own rules" ON rules FOR ALL USING (auth.uid() = user_id);
