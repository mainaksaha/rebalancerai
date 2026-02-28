import json
import uuid
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any

DATA_PATH = Path(__file__).parent.parent / "data"
RULES_FILE = DATA_PATH / "rules.json"


def load_rules() -> List[Dict[str, Any]]:
    with open(RULES_FILE) as f:
        return json.load(f)


def save_rules(rules: List[Dict[str, Any]]) -> None:
    with open(RULES_FILE, "w") as f:
        json.dump(rules, f, indent=2)


def get_active_rules() -> List[Dict[str, Any]]:
    return [r for r in load_rules() if r.get("active", True)]


def add_rule(name: str, prompt: str, rule_type: str = "soft", priority: int = 5) -> Dict[str, Any]:
    rules = load_rules()
    new_rule: Dict[str, Any] = {
        "id":         f"rule-{uuid.uuid4().hex[:8]}",
        "name":       name,
        "prompt":     prompt,
        "type":       rule_type,
        "priority":   priority,
        "active":     True,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    rules.append(new_rule)
    save_rules(rules)
    return new_rule


def toggle_rule(rule_id: str, active: bool) -> Dict[str, Any]:
    rules = load_rules()
    for rule in rules:
        if rule["id"] == rule_id:
            rule["active"] = active
            save_rules(rules)
            return rule
    raise ValueError(f"Rule '{rule_id}' not found")


def delete_rule(rule_id: str) -> None:
    rules = load_rules()
    rules = [r for r in rules if r["id"] != rule_id]
    save_rules(rules)
