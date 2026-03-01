import json
import math
from pathlib import Path
from typing import List, Dict, Any

from .portfolio import get_portfolio_with_values

DATA_PATH = Path(__file__).parent.parent / "data"


def load_qqq_weights() -> List[Dict[str, Any]]:
    with open(DATA_PATH / "qqq_weights.json") as f:
        return json.load(f)["holdings"]


def calculate_drift() -> Dict[str, Any]:
    """Compare portfolio weights against QQQ targets, return drift per holding."""
    portfolio = get_portfolio_with_values()
    qqq       = load_qqq_weights()
    qqq_map   = {h["ticker"]: round(h["weight"] * 100, 2) for h in qqq}

    drift_rows: List[Dict[str, Any]] = []
    for h in portfolio["holdings"]:
        ticker         = h["ticker"]
        cur_w          = h["weight"]
        tgt_w          = qqq_map.get(ticker, 0.0)
        drift          = round(cur_w - tgt_w, 2)
        drift_rows.append({
            "ticker":          ticker,
            "current_weight":  cur_w,
            "target_weight":   tgt_w,
            "drift":           drift,
            "drift_direction": "over" if drift > 0.5 else ("under" if drift < -0.5 else "aligned"),
        })

    # Alignment score: weighted overlap between portfolio and QQQ
    port_map = {h["ticker"]: h["weight"] / 100 for h in portfolio["holdings"]}
    overlap  = sum(min(port_map.get(h["ticker"], 0.0), h["weight"]) for h in qqq)
    alignment_score = round(overlap * 100, 1)

    total_abs_drift = round(sum(abs(r["drift"]) for r in drift_rows), 2)

    return {
        "alignment_score": alignment_score,
        "drift_summary": {
            "total_absolute_drift":     total_abs_drift,
            "holdings_over_weight":     sum(1 for r in drift_rows if r["drift"] > 2),
            "holdings_under_weight":    sum(1 for r in drift_rows if r["drift"] < -2),
            "holdings_aligned":         sum(1 for r in drift_rows if r["drift_direction"] == "aligned"),
        },
        "holdings": sorted(drift_rows, key=lambda x: abs(x["drift"]), reverse=True),
    }


def get_sector_exposure() -> List[Dict[str, Any]]:
    """Return sector allocation of the portfolio."""
    portfolio     = get_portfolio_with_values()
    sector_totals: Dict[str, float] = {}
    for h in portfolio["holdings"]:
        s = h.get("sector", "Unknown")
        sector_totals[s] = sector_totals.get(s, 0.0) + h["weight"]
    return [
        {"sector": s, "weight": round(w, 2)}
        for s, w in sorted(sector_totals.items(), key=lambda x: x[1], reverse=True)
    ]


def generate_rebalance_orders(aggressiveness: float = 0.5) -> Dict[str, Any]:
    """Generate buy/sell orders to reduce drift toward QQQ targets.

    All orders are whole shares only.  Two-pass approach:
      Pass 1 — floor fractional delta to whole shares for every ticker.
      Pass 2 — for tickers that floored to 0, promote to 1 share if we're
               ≥50% of the way toward the next share (greedy rounding-up).
    """
    aggressiveness = max(0.0, min(1.0, aggressiveness))
    portfolio      = get_portfolio_with_values()
    drift_data     = calculate_drift()
    total_value    = portfolio["total_value"]
    price_map      = {h["ticker"]: h["current_price"] for h in portfolio["holdings"]}
    shares_owned   = {h["ticker"]: h["shares"]        for h in portfolio["holdings"]}

    # ── Pass 1: build candidates with fractional shares floored to whole ──────
    candidates: List[Dict[str, Any]] = []
    for row in drift_data["holdings"]:
        ticker = row["ticker"]
        drift  = row["drift"]
        cur_w  = row["current_weight"]
        tgt_w  = row["target_weight"]

        if abs(drift) < 1.0:   # skip negligible drift
            continue
        if tgt_w == 0.0:       # no QQQ target → skip
            continue

        price = price_map.get(ticker, 0.0)
        if price == 0.0:
            continue

        # Ideal dollar move: close aggressiveness% of the gap
        new_w_pct   = cur_w - drift * aggressiveness
        delta_value = (new_w_pct - cur_w) / 100 * total_value   # neg=sell, pos=buy

        direction    = -1 if delta_value < 0 else 1
        ideal_shares = abs(delta_value) / price                  # fractional
        floored      = math.floor(ideal_shares)                  # whole, toward 0
        fractional   = ideal_shares - floored                    # leftover (0‥1)

        candidates.append({
            "ticker":         ticker,
            "direction":      direction,
            "price":          price,
            "floored":        floored,
            "fractional":     fractional,
            "current_weight": cur_w,
            "target_weight":  tgt_w,
            "drift":          drift,
        })

    # ── Pass 2: promote zeros that are ≥50% of the way to next share ─────────
    for c in candidates:
        if c["floored"] == 0 and c["fractional"] >= 0.5:
            c["floored"] = 1

    # ── Build final orders ────────────────────────────────────────────────────
    orders: List[Dict[str, Any]] = []
    for c in candidates:
        whole_shares = c["floored"]
        if whole_shares == 0:
            continue

        # Never sell more shares than owned
        if c["direction"] == -1:
            owned = int(shares_owned.get(c["ticker"], 0))
            whole_shares = min(whole_shares, owned)
            if whole_shares == 0:
                continue

        estimated_value = round(whole_shares * c["price"], 2)
        orders.append({
            "ticker":          c["ticker"],
            "action":          "SELL" if c["direction"] == -1 else "BUY",
            "shares":          whole_shares,
            "estimated_value": estimated_value,
            "current_weight":  c["current_weight"],
            "target_weight":   c["target_weight"],
            "reason":          f"Drift {c['drift']:+.1f}% from QQQ target ({c['target_weight']:.1f}%)",
        })

    projected = min(drift_data["alignment_score"] + aggressiveness * 20, 95.0)

    # ── Cash feasibility check ────────────────────────────────────────────────
    # Sells happen first and replenish cash; check if remaining cash covers buys.
    current_cash  = portfolio["cash_balance"]
    sell_proceeds = sum(o["estimated_value"] for o in orders if o["action"] == "SELL")
    available_cash = round(current_cash + sell_proceeds, 2)
    required_cash  = round(sum(o["estimated_value"] for o in orders if o["action"] == "BUY"), 2)
    cash_shortfall = round(max(0.0, required_cash - available_cash), 2)

    # Greedily mark BUY orders as funded/unfunded (largest first already sorted)
    remaining = available_cash
    for o in orders:
        if o["action"] == "SELL":
            o["funded"] = True
            continue
        if remaining >= o["estimated_value"]:
            o["funded"] = True
            remaining = round(remaining - o["estimated_value"], 2)
        else:
            o["funded"] = False

    buy_orders  = [o for o in orders if o["action"] == "BUY"]
    sell_orders = [o for o in orders if o["action"] == "SELL"]
    total_buy_value  = round(sum(o["estimated_value"] for o in buy_orders), 2)
    total_sell_value = round(sum(o["estimated_value"] for o in sell_orders), 2)
    funded_buy_value = round(sum(o["estimated_value"] for o in buy_orders if o["funded"]), 2)

    return {
        "orders": sorted(orders, key=lambda x: x["estimated_value"], reverse=True),
        "summary": {
            "total_orders":     len(orders),
            "buys":             len(buy_orders),
            "sells":            len(sell_orders),
            "total_buy_value":  total_buy_value,
            "total_sell_value": total_sell_value,
            "funded_buy_value": funded_buy_value,
        },
        "cash": {
            "current_balance": current_cash,
            "sell_proceeds":   round(sell_proceeds, 2),
            "available":       available_cash,
            "required":        required_cash,
            "shortfall":       cash_shortfall,
            "sufficient":      cash_shortfall == 0.0,
        },
        "current_alignment":   drift_data["alignment_score"],
        "projected_alignment": round(projected, 1),
        "aggressiveness":      aggressiveness,
    }
