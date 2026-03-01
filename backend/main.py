"""
RebalancerAI — FastAPI backend
Run with:  uvicorn main:app --reload --port 8000
"""

import sys
from pathlib import Path

# Make sure local packages are importable
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional

from agent.rebalancer import stream_agent_response
from core.portfolio import (
    get_portfolio_with_values, load_portfolio,
    add_holding, update_holding, delete_holding, update_cash,
)
from core.rules import load_rules, add_rule, toggle_rule, delete_rule
from core.calculations import calculate_drift, get_sector_exposure, generate_rebalance_orders
from core.execution import execute_rebalance_plan, get_rebalance_history

# ── App setup ──────────────────────────────────────────────────────────────────
app = FastAPI(title="RebalancerAI API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # dev-only: allow all origins
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Portfolio endpoints ────────────────────────────────────────────────────────
@app.get("/portfolio")
async def get_portfolio():
    return get_portfolio_with_values()


@app.get("/portfolio/drift")
async def get_drift():
    return calculate_drift()


@app.get("/portfolio/sectors")
async def get_sectors():
    return get_sector_exposure()


# ── Holdings CRUD endpoints ────────────────────────────────────────────────────

class HoldingRequest(BaseModel):
    ticker:   str
    shares:   float
    avg_cost: float


class UpdateCashRequest(BaseModel):
    cash_balance: float


@app.post("/portfolio/holdings")
async def create_holding(req: HoldingRequest):
    try:
        return add_holding(req.ticker, req.shares, req.avg_cost)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/portfolio/holdings/{ticker}")
async def update_holding_endpoint(ticker: str, req: HoldingRequest):
    try:
        return update_holding(ticker, req.shares, req.avg_cost)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.delete("/portfolio/holdings/{ticker}")
async def delete_holding_endpoint(ticker: str):
    delete_holding(ticker)
    return {"status": "deleted", "ticker": ticker.upper()}


@app.put("/portfolio/cash")
async def update_cash_endpoint(req: UpdateCashRequest):
    update_cash(req.cash_balance)
    return {"cash_balance": req.cash_balance}


class DepositRequest(BaseModel):
    amount: float


@app.post("/portfolio/deposit")
async def deposit_cash(req: DepositRequest):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Deposit amount must be positive")
    raw = load_portfolio()
    new_balance = round(raw["cash_balance"] + req.amount, 2)
    update_cash(new_balance)
    return {"cash_balance": new_balance, "deposited": req.amount}


# ── Rules endpoints ────────────────────────────────────────────────────────────
@app.get("/rules")
async def list_rules():
    return load_rules()


class AddRuleRequest(BaseModel):
    name:     str
    prompt:   str
    type:     str = "soft"
    priority: int = 5


@app.post("/rules")
async def create_rule(req: AddRuleRequest):
    return add_rule(req.name, req.prompt, req.type, req.priority)


class ToggleRuleRequest(BaseModel):
    active: bool


@app.patch("/rules/{rule_id}")
async def update_rule(rule_id: str, req: ToggleRuleRequest):
    try:
        return toggle_rule(rule_id, req.active)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.delete("/rules/{rule_id}")
async def remove_rule(rule_id: str):
    delete_rule(rule_id)
    return {"status": "deleted", "id": rule_id}


# ── Rebalance endpoints ────────────────────────────────────────────────────────
class RebalanceRequest(BaseModel):
    aggressiveness: float = 0.5


@app.post("/rebalance")
async def rebalance(req: RebalanceRequest):
    return generate_rebalance_orders(req.aggressiveness)


class RebalanceOrder(BaseModel):
    ticker:          str
    action:          str
    shares:          int
    estimated_value: float
    current_weight:  float
    target_weight:   float
    reason:          str
    funded:          bool = True


class ExecuteRebalanceRequest(BaseModel):
    orders:              List[RebalanceOrder]
    aggressiveness:      float
    alignment_before:    float
    projected_alignment: float


@app.post("/rebalance/execute")
async def execute_rebalance(req: ExecuteRebalanceRequest):
    orders = [o.model_dump() for o in req.orders]
    try:
        return execute_rebalance_plan(
            orders,
            req.aggressiveness,
            req.alignment_before,
            req.projected_alignment,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/rebalance/history")
async def rebalance_history():
    return get_rebalance_history()


# ── Chat / Agent endpoint ──────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role:    str   # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


@app.post("/chat")
async def chat(req: ChatRequest):
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    return StreamingResponse(
        stream_agent_response(messages),
        media_type="text/event-stream",
        headers={
            "Cache-Control":   "no-cache",
            "Connection":      "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Health ─────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "rebalancerai-backend"}
