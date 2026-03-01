"""
Order execution engine — mock-executes rebalance orders and persists results.

Flow for each order:
  BUY  → shares += n, weighted avg_cost updated, cash -= n × price
  SELL → shares -= n (delete holding if reaches 0), cash += n × price

After all orders, writes an execution record to rebalance_history.
"""

from datetime import datetime, timezone
from typing import List, Dict, Any

from .db import get_client, DEMO_USER_ID
from .portfolio import _get_or_create_portfolio


def execute_rebalance_plan(
    orders: List[Dict[str, Any]],
    aggressiveness: float,
    alignment_before: float,
    projected_alignment: float,
) -> Dict[str, Any]:
    """
    Execute a list of whole-share buy/sell orders against the Supabase portfolio.

    Only processes orders where funded=True (caller should filter, but we
    double-check here anyway).

    Returns an execution summary dict.
    """
    db        = get_client()
    portfolio = _get_or_create_portfolio()
    port_id   = portfolio["id"]
    cash      = float(portfolio["cash_balance"])

    executed: List[Dict[str, Any]] = []
    skipped:  List[Dict[str, Any]] = []

    for order in orders:
        # Skip unfunded orders
        if not order.get("funded", True):
            skipped.append(order)
            continue

        ticker     = order["ticker"]
        action     = order["action"]
        shares_qty = int(order["shares"])
        price      = float(order["estimated_value"]) / shares_qty  # recover unit price

        # Load current holding
        res = (
            db.table("holdings")
            .select("*")
            .eq("portfolio_id", port_id)
            .eq("ticker", ticker)
            .execute()
        )
        holding = res.data[0] if res.data else None

        if action == "BUY":
            cost = round(shares_qty * price, 2)
            if cash < cost:
                # Safety guard (should not happen if funded flag is correct)
                skipped.append({**order, "skip_reason": "insufficient cash at execution"})
                continue

            if holding:
                old_shares   = float(holding["shares"])
                old_avg_cost = float(holding["avg_cost"])
                new_shares   = old_shares + shares_qty
                new_avg_cost = round(
                    (old_shares * old_avg_cost + shares_qty * price) / new_shares, 4
                )
                db.table("holdings").update({
                    "shares":   new_shares,
                    "avg_cost": new_avg_cost,
                }).eq("id", holding["id"]).execute()
            else:
                # New position — add holding
                db.table("holdings").insert({
                    "portfolio_id": port_id,
                    "user_id":      DEMO_USER_ID,
                    "ticker":       ticker,
                    "shares":       shares_qty,
                    "avg_cost":     round(price, 4),
                }).execute()

            cash = round(cash - cost, 2)

        elif action == "SELL":
            if not holding:
                skipped.append({**order, "skip_reason": "holding not found"})
                continue

            old_shares = float(holding["shares"])
            sell_qty   = min(shares_qty, int(old_shares))   # never sell more than owned
            proceeds   = round(sell_qty * price, 2)
            new_shares = round(old_shares - sell_qty, 4)

            if new_shares <= 0:
                db.table("holdings").delete().eq("id", holding["id"]).execute()
            else:
                db.table("holdings").update({"shares": new_shares}).eq("id", holding["id"]).execute()

            cash = round(cash + proceeds, 2)

        executed.append({**order, "executed_price": round(price, 2)})

    # Persist updated cash balance
    db.table("portfolios").update({"cash_balance": cash}).eq("id", port_id).execute()

    # Write execution record to rebalance_history
    record = {
        "user_id":         DEMO_USER_ID,
        "orders":          executed,
        "aggressiveness":  aggressiveness,
        "alignment_before": alignment_before,
        "alignment_after": projected_alignment,
    }
    hist = db.table("rebalance_history").insert(record).execute()
    history_id = hist.data[0]["id"] if hist.data else None

    buy_executed  = [o for o in executed if o["action"] == "BUY"]
    sell_executed = [o for o in executed if o["action"] == "SELL"]

    return {
        "id":               history_id,
        "executed_at":      datetime.now(timezone.utc).isoformat(),
        "orders_executed":  len(executed),
        "orders_skipped":   len(skipped),
        "buys":             len(buy_executed),
        "sells":            len(sell_executed),
        "total_buy_value":  round(sum(o["estimated_value"] for o in buy_executed), 2),
        "total_sell_value": round(sum(o["estimated_value"] for o in sell_executed), 2),
        "new_cash_balance": cash,
        "alignment_before": alignment_before,
        "alignment_after":  projected_alignment,
        "skipped":          skipped,
    }


def get_rebalance_history() -> List[Dict[str, Any]]:
    """Return all past rebalance executions for the demo user, newest first."""
    db  = get_client()
    res = (
        db.table("rebalance_history")
        .select("*")
        .eq("user_id", DEMO_USER_ID)
        .order("executed_at", desc=True)
        .execute()
    )
    return res.data or []
