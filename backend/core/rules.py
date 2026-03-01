import json
from pathlib import Path
from typing import List, Dict, Any

from core.db import get_client, DEMO_USER_ID

DATA_PATH = Path(__file__).parent.parent / "data"


def _seed_if_empty() -> None:
    """Seed default rules from rules.json if the demo user has none."""
    db = get_client()
    existing = db.table("rules").select("id").eq("user_id", DEMO_USER_ID).execute()
    if existing.data:
        return
    with open(DATA_PATH / "rules.json") as f:
        defaults = json.load(f)
    rows = [
        {
            "user_id":  DEMO_USER_ID,
            "name":     r["name"],
            "prompt":   r["prompt"],
            "type":     r["type"],
            "priority": r["priority"],
            "active":   r.get("active", True),
        }
        for r in defaults
    ]
    db.table("rules").insert(rows).execute()


def load_rules() -> List[Dict[str, Any]]:
    _seed_if_empty()
    db = get_client()
    return (
        db.table("rules")
        .select("*")
        .eq("user_id", DEMO_USER_ID)
        .order("priority")
        .execute()
        .data
    )


def get_active_rules() -> List[Dict[str, Any]]:
    _seed_if_empty()
    db = get_client()
    return (
        db.table("rules")
        .select("*")
        .eq("user_id", DEMO_USER_ID)
        .eq("active", True)
        .order("priority")
        .execute()
        .data
    )


def add_rule(name: str, prompt: str, rule_type: str = "soft", priority: int = 5) -> Dict[str, Any]:
    db = get_client()
    res = db.table("rules").insert({
        "user_id":  DEMO_USER_ID,
        "name":     name,
        "prompt":   prompt,
        "type":     rule_type,
        "priority": priority,
        "active":   True,
    }).execute()
    return res.data[0]


def toggle_rule(rule_id: str, active: bool) -> Dict[str, Any]:
    db = get_client()
    res = (
        db.table("rules")
        .update({"active": active})
        .eq("id", rule_id)
        .eq("user_id", DEMO_USER_ID)
        .execute()
    )
    if not res.data:
        raise ValueError(f"Rule '{rule_id}' not found")
    return res.data[0]


def delete_rule(rule_id: str) -> None:
    db = get_client()
    db.table("rules").delete().eq("id", rule_id).eq("user_id", DEMO_USER_ID).execute()
