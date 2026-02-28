import json
from pathlib import Path
from typing import List, Dict, Any

# ── Mock Prices (static for prototype) ───────────────────────────────────────
MOCK_PRICES: Dict[str, float] = {
    "AAPL": 187.44,
    "MSFT": 415.26,
    "NVDA": 875.39,
    "GOOGL": 175.82,
    "TSLA": 175.11,
    "META": 503.42,
    "AMD":  167.58,
    "AMZN": 185.48,
}

SECTOR_MAP: Dict[str, str] = {
    "AAPL":  "Technology",
    "MSFT":  "Technology",
    "NVDA":  "Technology",
    "GOOGL": "Communication Services",
    "TSLA":  "Consumer Discretionary",
    "META":  "Communication Services",
    "AMD":   "Technology",
    "AMZN":  "Consumer Discretionary",
}

DATA_PATH = Path(__file__).parent.parent / "data"


def load_portfolio() -> Dict[str, Any]:
    with open(DATA_PATH / "portfolio.json") as f:
        return json.load(f)


def get_portfolio_with_values() -> Dict[str, Any]:
    """Return the full portfolio enriched with current prices, weights, and P&L."""
    raw = load_portfolio()
    cash = raw.get("cash_balance", 0.0)

    enriched: List[Dict[str, Any]] = []
    for h in raw["holdings"]:
        ticker = h["ticker"]
        price  = MOCK_PRICES.get(ticker, 0.0)
        shares = h["shares"]
        value  = round(price * shares, 2)
        cost   = h["avg_cost"]
        enriched.append({
            "ticker":         ticker,
            "shares":         shares,
            "avg_cost":       cost,
            "current_price":  price,
            "value":          value,
            "sector":         SECTOR_MAP.get(ticker, "Unknown"),
            "unrealized_pnl": round((price - cost) * shares, 2),
            "pnl_pct":        round((price / cost - 1) * 100, 2) if cost else 0.0,
        })

    total_equity = sum(h["value"] for h in enriched)
    total_value  = round(total_equity + cash, 2)

    for h in enriched:
        h["weight"] = round(h["value"] / total_value * 100, 2) if total_value else 0.0

    return {
        "holdings":     enriched,
        "total_equity": round(total_equity, 2),
        "cash_balance": cash,
        "total_value":  total_value,
    }
