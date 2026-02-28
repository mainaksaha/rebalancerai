import json
from typing import Any, Dict

from core.portfolio import get_portfolio_with_values
from core.rules import get_active_rules
from core.calculations import (
    calculate_drift,
    get_sector_exposure,
    generate_rebalance_orders,
    load_qqq_weights,
)


# ── Tool executor ─────────────────────────────────────────────────────────────

def execute_tool(tool_name: str, tool_input: Dict[str, Any]) -> str:
    """Dispatch a tool call and return the result as a JSON string."""
    try:
        if tool_name == "get_portfolio_state":
            result = get_portfolio_with_values()

        elif tool_name == "get_benchmark_weights":
            qqq    = load_qqq_weights()
            result = {"index": "QQQ", "top_holdings": qqq[:10], "total_shown": 10}

        elif tool_name == "calculate_portfolio_drift":
            result = calculate_drift()

        elif tool_name == "get_sector_exposure":
            result = get_sector_exposure()

        elif tool_name == "list_active_rules":
            result = get_active_rules()

        elif tool_name == "evaluate_rule":
            result = _evaluate_rule(str(tool_input.get("rule_id", "")))

        elif tool_name == "generate_rebalance_orders":
            agg    = float(tool_input.get("aggressiveness", 0.5))
            result = generate_rebalance_orders(agg)

        elif tool_name == "get_portfolio_summary":
            portfolio = get_portfolio_with_values()
            drift     = calculate_drift()
            result = {
                "total_value":    portfolio["total_value"],
                "total_equity":   portfolio["total_equity"],
                "cash_balance":   portfolio["cash_balance"],
                "num_holdings":   len(portfolio["holdings"]),
                "alignment_score":drift["alignment_score"],
                "cash_pct":       round(
                    portfolio["cash_balance"] / portfolio["total_value"] * 100, 1
                ) if portfolio["total_value"] else 0.0,
            }
        else:
            result = {"error": f"Unknown tool: {tool_name}"}

        return json.dumps(result, indent=2)

    except Exception as exc:
        return json.dumps({"error": str(exc)})


def _evaluate_rule(rule_id: str) -> Dict[str, Any]:
    rules = get_active_rules()
    rule  = next((r for r in rules if r["id"] == rule_id), None)
    if not rule:
        return {"error": f"Rule '{rule_id}' not found or not active"}

    portfolio = get_portfolio_with_values()
    sectors   = get_sector_exposure()
    violations: list[str] = []

    prompt_lower = rule["prompt"].lower()

    # Tech-sector cap heuristic
    if "technology" in prompt_lower and ("sector" in prompt_lower or "exposure" in prompt_lower):
        tech_w = next((s["weight"] for s in sectors if s["sector"] == "Technology"), 0.0)
        # Try to extract a percentage limit from the prompt (e.g. "40%")
        import re
        m = re.search(r"(\d+)\s*%", rule["prompt"])
        limit = float(m.group(1)) if m else 40.0
        if tech_w > limit:
            violations.append(f"Technology sector at {tech_w:.1f}% exceeds {limit:.0f}% limit")

    # Single-stock limit heuristic
    if "single" in prompt_lower or ("position" in prompt_lower and "%" in prompt_lower):
        import re
        m = re.search(r"(\d+)\s*%", rule["prompt"])
        limit = float(m.group(1)) if m else 8.0
        for h in portfolio["holdings"]:
            if h["weight"] > limit:
                violations.append(
                    f"{h['ticker']} at {h['weight']:.1f}% exceeds {limit:.0f}% single-stock limit"
                )

    # Cash buffer heuristic
    if "cash" in prompt_lower:
        import re
        m = re.search(r"(\d+)\s*%", rule["prompt"])
        limit = float(m.group(1)) if m else 3.0
        cash_pct = portfolio["cash_balance"] / portfolio["total_value"] * 100
        if cash_pct < limit:
            violations.append(f"Cash at {cash_pct:.1f}% is below {limit:.0f}% minimum")

    return {
        "rule_id":   rule_id,
        "rule_name": rule["name"],
        "satisfied": len(violations) == 0,
        "violations":violations,
        "message":   "Rule is satisfied" if not violations else f"{len(violations)} violation(s) found",
    }


# ── Tool schema definitions for Claude API ────────────────────────────────────

TOOLS = [
    {
        "name":        "get_portfolio_state",
        "description": (
            "Retrieve the complete portfolio: all holdings with their shares, "
            "current prices, values, portfolio weights, sector, and unrealized P&L."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name":        "get_benchmark_weights",
        "description": (
            "Get the QQQ (NASDAQ-100) benchmark's top-10 holdings and their "
            "target allocation weights. Use this to understand what the model "
            "portfolio should look like."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name":        "calculate_portfolio_drift",
        "description": (
            "Calculate how far each holding has drifted from its QQQ target weight. "
            "Returns an alignment score (0-100) and per-holding drift statistics."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name":        "get_sector_exposure",
        "description": "Return the current sector allocation breakdown of the portfolio.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name":        "list_active_rules",
        "description": (
            "Retrieve all currently active advisor rules — the constraints and "
            "preferences the rebalancer must respect."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name":        "evaluate_rule",
        "description": (
            "Check whether a specific advisor rule is currently satisfied by the portfolio. "
            "Returns satisfied status and any violations found."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "rule_id": {
                    "type":        "string",
                    "description": "The ID of the rule to evaluate (e.g. 'rule-1').",
                }
            },
            "required": ["rule_id"],
        },
    },
    {
        "name":        "generate_rebalance_orders",
        "description": (
            "Generate buy/sell orders to move the portfolio toward QQQ target weights. "
            "The aggressiveness parameter controls how much of the drift to close in one pass."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "aggressiveness": {
                    "type":        "number",
                    "description": (
                        "0.0 = minimal changes, 1.0 = fully rebalance to target. "
                        "Default 0.5."
                    ),
                }
            },
            "required": [],
        },
    },
    {
        "name":        "get_portfolio_summary",
        "description": (
            "Quick snapshot: total portfolio value, equity, cash, number of holdings, "
            "alignment score, and cash percentage."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
]
