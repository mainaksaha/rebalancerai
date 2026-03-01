import json
from pathlib import Path
from typing import List, Dict, Any

from core.db import get_client, DEMO_USER_ID
from core.prices import get_prices

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


# ── Internal helpers ──────────────────────────────────────────────────────────

def _get_or_create_portfolio() -> Dict[str, Any]:
    """Get (or lazily create + seed) the demo user's portfolio row."""
    db = get_client()
    res = db.table("portfolios").select("*").eq("user_id", DEMO_USER_ID).execute()
    if res.data:
        return res.data[0]

    # First run — create portfolio row then seed default holdings
    row = db.table("portfolios").insert({
        "user_id":      DEMO_USER_ID,
        "name":         "My Portfolio",
        "cash_balance": 5000.0,
    }).execute()
    portfolio = row.data[0]
    _seed_holdings(portfolio["id"])
    return portfolio


def _seed_holdings(portfolio_id: str) -> None:
    """Seed default holdings from portfolio.json on first run."""
    with open(DATA_PATH / "portfolio.json") as f:
        data = json.load(f)
    db = get_client()
    rows = [
        {
            "portfolio_id": portfolio_id,
            "user_id":      DEMO_USER_ID,
            "ticker":       h["ticker"],
            "shares":       h["shares"],
            "avg_cost":     h["avg_cost"],
        }
        for h in data["holdings"]
    ]
    if rows:
        db.table("holdings").insert(rows).execute()


# ── Public read API ───────────────────────────────────────────────────────────

def load_portfolio() -> Dict[str, Any]:
    """Load portfolio + holdings from Supabase."""
    portfolio = _get_or_create_portfolio()
    db = get_client()
    rows = (
        db.table("holdings")
        .select("*")
        .eq("portfolio_id", portfolio["id"])
        .order("ticker")
        .execute()
        .data
    )
    return {
        "portfolio_id": portfolio["id"],
        "holdings": [
            {
                "ticker":   h["ticker"],
                "shares":   float(h["shares"]),
                "avg_cost": float(h["avg_cost"]),
            }
            for h in rows
        ],
        "cash_balance": float(portfolio["cash_balance"]),
    }


def get_portfolio_with_values() -> Dict[str, Any]:
    """Return full portfolio enriched with live prices, weights, and P&L."""
    raw  = load_portfolio()
    cash = raw["cash_balance"]

    tickers = [h["ticker"] for h in raw["holdings"]]
    prices  = get_prices(tickers)

    enriched: List[Dict[str, Any]] = []
    for h in raw["holdings"]:
        ticker = h["ticker"]
        price  = prices.get(ticker, 0.0)
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


# ── Holdings CRUD ─────────────────────────────────────────────────────────────

def add_holding(ticker: str, shares: float, avg_cost: float) -> Dict[str, Any]:
    portfolio = _get_or_create_portfolio()
    db = get_client()
    res = db.table("holdings").insert({
        "portfolio_id": portfolio["id"],
        "user_id":      DEMO_USER_ID,
        "ticker":       ticker.upper().strip(),
        "shares":       shares,
        "avg_cost":     avg_cost,
    }).execute()
    return res.data[0]


def update_holding(ticker: str, shares: float, avg_cost: float) -> Dict[str, Any]:
    portfolio = _get_or_create_portfolio()
    db = get_client()
    res = (
        db.table("holdings")
        .update({"shares": shares, "avg_cost": avg_cost})
        .eq("portfolio_id", portfolio["id"])
        .eq("ticker", ticker.upper().strip())
        .execute()
    )
    if not res.data:
        raise ValueError(f"Holding '{ticker}' not found")
    return res.data[0]


def delete_holding(ticker: str) -> None:
    portfolio = _get_or_create_portfolio()
    db = get_client()
    (
        db.table("holdings")
        .delete()
        .eq("portfolio_id", portfolio["id"])
        .eq("ticker", ticker.upper().strip())
        .execute()
    )


def update_cash(cash_balance: float) -> None:
    db = get_client()
    db.table("portfolios").update({"cash_balance": cash_balance}).eq("user_id", DEMO_USER_ID).execute()
