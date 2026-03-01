# RebalancerAI — Rebalancing Logic

**Source files:**
- `backend/core/calculations.py` — drift, cash check, order generation
- `backend/core/execution.py` — mock order execution, history persistence

---

## Step 1 — Drift Calculation (`calculate_drift`)

For each holding, drift is the difference between the portfolio's current weight
and QQQ's target weight:

```
drift = current_weight_pct - target_weight_pct
```

| Value | Meaning |
|-------|---------|
| `drift > +0.5%` | Over-weight vs QQQ |
| `drift < -0.5%` | Under-weight vs QQQ |
| `-0.5% ≤ drift ≤ +0.5%` | Aligned |

### Alignment Score

Measures how much of the portfolio's weight overlaps with QQQ (weighted overlap):

```
alignment_score = Σ  min(portfolio_weight[ticker], qqq_weight[ticker])  × 100
                 all QQQ tickers
```

A score of 100 = perfect QQQ replication. Capped at 95% in projection (perfect
replication is impossible with a small number of holdings).

---

## Step 2 — Order Generation (`generate_rebalance_orders`)

### Inputs

| Parameter | Range | Description |
|-----------|-------|-------------|
| `aggressiveness` | 0.0 – 1.0 | How far to move toward target in one rebalance |

### Filters — tickers skipped

1. `abs(drift) < 1.0%` — negligible drift, not worth trading
2. `target_weight == 0.0` — ticker not in QQQ benchmark
3. `current_price == 0.0` — price unavailable

### Dollar delta calculation

```
new_weight_pct  = current_weight_pct - drift × aggressiveness
delta_value     = (new_weight_pct - current_weight_pct) / 100 × total_portfolio_value
```

- `delta_value < 0` → **SELL** (over-weight, reduce position)
- `delta_value > 0` → **BUY**  (under-weight, add to position)

At `aggressiveness = 0.5` each position moves **50% of the way** toward its target.
At `aggressiveness = 1.0` it closes the full gap in one rebalance.

### Pass 1 — Floor to whole shares

All orders are **whole shares only** — fractional shares are never produced.

```
ideal_shares = abs(delta_value) / current_price   # fractional
floored      = floor(ideal_shares)                # whole, rounded toward zero
fractional   = ideal_shares - floored             # leftover (0 to <1)
```

Flooring is conservative — we never overshoot the target.

### Pass 2 — Greedy round-up for near-zero positions

Any ticker that floored to **0 but has `fractional ≥ 0.5`** is promoted to **1 share**:

```
if floored == 0 and fractional >= 0.5:
    floored = 1
```

This ensures positions that are nearly a full share away from target still get a trade
rather than being silently dropped.

### Sell guard

A SELL order is capped at shares actually owned:

```
whole_shares = min(whole_shares, shares_owned[ticker])
```

---

## Step 3 — Cash Feasibility Check (at plan time)

Before returning the plan to the UI, a cash check is performed **immediately at plan
generation** — the user is warned upfront, not at execution time.

```
sell_proceeds  = Σ estimated_value for all SELL orders
available_cash = current_cash_balance + sell_proceeds
required_cash  = Σ estimated_value for all BUY orders
shortfall      = max(0, required_cash - available_cash)
```

BUY orders are then greedy-marked funded/unfunded (sorted by value, largest first):

```
remaining = available_cash
for each BUY order (largest first):
    if remaining >= order.estimated_value:
        order.funded = True
        remaining   -= order.estimated_value
    else:
        order.funded = False        # ⚠ shown in amber in the UI
```

SELL orders are always `funded = True`.

The UI displays:
- ✅ Green banner if `shortfall == 0`
- ⚠️ Amber banner with shortfall amount if cash is insufficient
- Unfunded BUY rows are dimmed with "⚠ No cash" status badge
- The Execute button only sends funded orders

---

## Step 4 — Execution (`execute_rebalance_plan`)

Only `funded=True` orders are executed. For each order:

### BUY
```
cost      = shares × price
new_shares   = old_shares + shares
new_avg_cost = (old_shares × old_avg_cost + shares × price) / new_shares
cash         = cash - cost
```

If the ticker has no existing holding, a new holding row is created.

### SELL
```
proceeds   = shares × price
new_shares = old_shares - shares   # if ≤ 0, holding is deleted
cash       = cash + proceeds
```

Sell quantity is capped at shares owned (extra safety guard beyond the plan-time check).

### After execution

- Updated cash balance written to `portfolios` table
- Execution record written to `rebalance_history` table:
  - `orders` (JSONB) — full list of executed orders
  - `alignment_before` / `alignment_after` (projected)
  - `aggressiveness`
  - `executed_at` timestamp

---

## Cash Deposit

Users can add cash via **Settings → + Deposit**:

```
POST /portfolio/deposit  { amount: float }
new_balance = current_cash + amount
```

This increases available cash for future rebalances.

---

## Example Walkthrough

Portfolio: $50,000 total, $7,500 cash. TSLA: 20 shares @ $402, weight 19.4%, QQQ target 3.5%.

**Plan generation (50% aggressiveness):**
```
drift          = 19.4 - 3.5 = +15.9%  (SELL)
new_weight_pct = 19.4 - 15.9 × 0.5 = 11.45%
delta_value    = (11.45 - 19.4) / 100 × 50,000 = -$3,975

ideal_shares   = 3,975 / 402 = 9.89
floored        = 9
fractional     = 0.89   → Pass 2 not triggered (floored > 0)

→ SELL 9 TSLA @ $402 = $3,618  (funded ✓)
```

**Cash check:**
```
sell_proceeds  = $3,618 + … (other sells) = $8,912
available_cash = $7,500 + $8,912 = $16,412
required_cash  = $1,537  (buys)
shortfall      = 0  → ✅ Sufficient cash
```

---

## Data Sources

| Data | Source | Update frequency |
|------|--------|-----------------|
| Current prices | yfinance (live) | 60-second TTL cache |
| QQQ target weights | `backend/data/qqq_weights.json` | Manual update |
| Portfolio holdings | Supabase `holdings` table | Real-time |
| Cash balance | Supabase `portfolios.cash_balance` | Updated on execution/deposit |
| Execution history | Supabase `rebalance_history` table | Appended on each execution |

---

## Known Limitations

- **Projected alignment is a heuristic** — `current_alignment + aggressiveness × 20`, capped at 95%. Does not re-run drift after simulating orders.
- **No tax awareness** — sell orders ignore cost basis and tax lots.
- **QQQ weights are static** — must be manually refreshed when QQQ rebalances.
- **No partial-share rounding across tickers** — each ticker is rounded independently; residual cash from flooring is not reallocated.
- **Mock execution only** — no real brokerage connection; portfolio state is updated in Supabase as if trades were filled at the plan's estimated price.
