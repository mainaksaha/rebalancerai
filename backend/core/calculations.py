import json
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
    """Generate buy/sell orders to reduce drift toward QQQ targets."""
    aggressiveness = max(0.0, min(1.0, aggressiveness))
    portfolio      = get_portfolio_with_values()
    drift_data     = calculate_drift()
    total_value    = portfolio["total_value"]
    price_map      = {h["ticker"]: h["current_price"] for h in portfolio["holdings"]}

    orders: List[Dict[str, Any]] = []
    for row in drift_data["holdings"]:
        ticker  = row["ticker"]
        drift   = row["drift"]
        cur_w   = row["current_weight"]
        tgt_w   = row["target_weight"]

        if abs(drift) < 1.0:      # skip negligible drift
            continue
        if tgt_w == 0.0:          # no QQQ target → skip
            continue

        # Move aggressiveness% of the way toward target
        new_w_pct    = cur_w - drift * aggressiveness
        cur_value    = cur_w / 100 * total_value
        new_value    = new_w_pct / 100 * total_value
        delta_value  = new_value - cur_value

        price        = price_map.get(ticker, 0.0)
        if price == 0.0:
            continue
        delta_shares = delta_value / price

        if abs(delta_shares) < 0.05:
            continue

        orders.append({
            "ticker":          ticker,
            "action":          "SELL" if delta_shares < 0 else "BUY",
            "shares":          round(abs(delta_shares), 3),
            "estimated_value": round(abs(delta_value), 2),
            "current_weight":  cur_w,
            "target_weight":   tgt_w,
            "reason":          f"Drift {drift:+.1f}% from QQQ target ({tgt_w:.1f}%)",
        })

    projected = min(drift_data["alignment_score"] + aggressiveness * 20, 95.0)

    return {
        "orders": sorted(orders, key=lambda x: x["estimated_value"], reverse=True),
        "summary": {
            "total_orders":    len(orders),
            "buys":            sum(1 for o in orders if o["action"] == "BUY"),
            "sells":           sum(1 for o in orders if o["action"] == "SELL"),
            "total_buy_value": round(sum(o["estimated_value"] for o in orders if o["action"] == "BUY"), 2),
            "total_sell_value":round(sum(o["estimated_value"] for o in orders if o["action"] == "SELL"), 2),
        },
        "current_alignment":   drift_data["alignment_score"],
        "projected_alignment": round(projected, 1),
        "aggressiveness":      aggressiveness,
    }
