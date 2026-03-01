# RebalancerAI — Rebalancing Logic

**Source file:** `backend/core/calculations.py`

---

## Overview

The rebalancing engine compares your portfolio's current weights against the QQQ ETF's
target weights and generates buy/sell orders to close the gap.  All orders are expressed
in **whole shares only** — fractional shares are never produced.

---

## Step 1 — Drift Calculation (`calculate_drift`)

For each holding, drift is simply the difference between the portfolio's current weight
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

The alignment score measures how much of your portfolio's weight overlaps with QQQ,
using a weighted-overlap formula:

```
alignment_score = Σ  min(portfolio_weight[ticker], qqq_weight[ticker])  × 100
                 all QQQ tickers
```

A score of 100 means perfect replication of QQQ.  A score of 0 means no overlap at all.

---

## Step 2 — Rebalance Order Generation (`generate_rebalance_orders`)

### Inputs

| Parameter | Range | Description |
|-----------|-------|-------------|
| `aggressiveness` | 0.0 – 1.0 | How far to move toward target in one rebalance |

### Filters — tickers that are skipped

1. `abs(drift) < 1.0%` — negligible drift, not worth trading
2. `target_weight == 0.0` — ticker has no QQQ target (not in benchmark)
3. `current_price == 0.0` — price unavailable

### Dollar delta calculation

For each remaining ticker, the ideal dollar move is:

```
new_weight_pct  = current_weight_pct - drift × aggressiveness
delta_value     = (new_weight_pct - current_weight_pct) / 100 × total_portfolio_value
```

- `delta_value < 0` → **SELL** (over-weight, reduce position)
- `delta_value > 0` → **BUY**  (under-weight, add to position)

At `aggressiveness = 0.5` each position moves **50% of the way** toward its target
in a single rebalance.  At `aggressiveness = 1.0` it moves all the way.

### Pass 1 — Floor to whole shares

```
ideal_shares = abs(delta_value) / current_price   # fractional
floored      = floor(ideal_shares)                # whole, rounded toward 0
fractional   = ideal_shares - floored             # leftover fraction (0 to <1)
```

Flooring is always conservative — we never overshoot the target.

### Pass 2 — Greedy round-up for near-zero positions

After flooring, a ticker with a small delta may land at 0 shares and be silently dropped.
To avoid this, any ticker that floored to **0 but has `fractional ≥ 0.5`** is promoted to
**1 share**:

```
if floored == 0 and fractional >= 0.5:
    floored = 1
```

This ensures positions that are nearly a full share away from target still get a trade.

### Sell guard

A SELL order is capped at the number of shares actually owned:

```
whole_shares = min(whole_shares, shares_owned[ticker])
```

If the cap brings the order to 0 shares it is dropped entirely.

### Projected alignment

The projected alignment after executing the plan is estimated as:

```
projected = min(current_alignment + aggressiveness × 20, 95.0)
```

This is a heuristic approximation.  Maximum projected alignment is capped at 95% because
perfect replication of QQQ is not possible with a small number of holdings.

---

## Example Walkthrough

Assume total portfolio value = **$50,000**, TSLA current weight = **19.4%**, QQQ target = **3.5%**, price = **$402**.

```
drift          = 19.4 - 3.5 = +15.9%   (over-weight → SELL)
aggressiveness = 0.50

new_weight_pct = 19.4 - 15.9 × 0.5 = 11.45%
delta_value    = (11.45 - 19.4) / 100 × 50,000 = -$3,975

ideal_shares   = 3,975 / 402 = 9.89
floored        = 9      (floor toward 0)
fractional     = 0.89

Pass 2:        floored != 0, so no promotion needed

→  SELL 9 TSLA @ $402 = $3,618
```

---

## Data Sources

| Data | Source | Update frequency |
|------|--------|-----------------|
| Current prices | yfinance (live) | 60-second TTL cache |
| QQQ target weights | `backend/data/qqq_weights.json` | Manual update |
| Portfolio holdings | Supabase `holdings` table | Real-time |

---

## Limitations & Future Improvements

- **Projected alignment is a heuristic** — it does not re-run the full drift calculation
  after simulating the orders.
- **No cash constraint** — buy orders are generated without checking whether the
  portfolio has enough cash to fund them.
- **No tax awareness** — sell orders do not consider cost basis or tax lots.
- **QQQ weights are static** — they must be manually refreshed when QQQ rebalances.
