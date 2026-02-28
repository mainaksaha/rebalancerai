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
from core.portfolio import get_portfolio_with_values
from core.rules import load_rules, add_rule, toggle_rule, delete_rule
from core.calculations import calculate_drift, get_sector_exposure, generate_rebalance_orders

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


# ── Rebalance endpoint ─────────────────────────────────────────────────────────
class RebalanceRequest(BaseModel):
    aggressiveness: float = 0.5


@app.post("/rebalance")
async def rebalance(req: RebalanceRequest):
    return generate_rebalance_orders(req.aggressiveness)


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
