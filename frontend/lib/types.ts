// ── Portfolio ─────────────────────────────────────────────────────────────────
export interface Holding {
  ticker: string
  shares: number
  avg_cost: number
  current_price: number
  value: number
  weight: number
  sector: string
  unrealized_pnl: number
  pnl_pct: number
}

export interface Portfolio {
  holdings: Holding[]
  total_equity: number
  cash_balance: number
  total_value: number
}

export interface DriftHolding {
  ticker: string
  current_weight: number
  target_weight: number
  drift: number
  drift_direction: 'over' | 'under' | 'aligned'
}

export interface DriftAnalysis {
  alignment_score: number
  drift_summary: {
    total_absolute_drift: number
    holdings_over_weight: number
    holdings_under_weight: number
    holdings_aligned: number
  }
  holdings: DriftHolding[]
}

export interface SectorExposure {
  sector: string
  weight: number
}

// ── Rules ─────────────────────────────────────────────────────────────────────
export interface Rule {
  id: string
  name: string
  prompt: string
  type: 'hard' | 'soft'
  priority: number
  active: boolean
  created_at: string
}

// ── Rebalance ─────────────────────────────────────────────────────────────────
export interface RebalanceOrder {
  ticker: string
  action: 'BUY' | 'SELL'
  shares: number
  estimated_value: number
  current_weight: number
  target_weight: number
  reason: string
  funded: boolean
}

export interface RebalancePlan {
  orders: RebalanceOrder[]
  summary: {
    total_orders: number
    buys: number
    sells: number
    total_buy_value: number
    total_sell_value: number
    funded_buy_value: number
  }
  cash: {
    current_balance: number
    sell_proceeds: number
    available: number
    required: number
    shortfall: number
    sufficient: boolean
  }
  current_alignment: number
  projected_alignment: number
  aggressiveness: number
}

export interface RebalanceExecution {
  id: string
  executed_at: string
  orders_executed: number
  orders_skipped: number
  buys: number
  sells: number
  total_buy_value: number
  total_sell_value: number
  new_cash_balance: number
  alignment_before: number
  alignment_after: number
  skipped: RebalanceOrder[]
}

export interface RebalanceHistoryItem {
  id: string
  executed_at: string
  orders: RebalanceOrder[]
  aggressiveness: number
  alignment_before: number
  alignment_after: number
}

// ── Chat ──────────────────────────────────────────────────────────────────────
export type Block =
  | { type: 'text';        content: string }
  | { type: 'thinking';    content: string }
  | { type: 'tool_call';   tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result: unknown }

export interface UserMsg {
  role: 'user'
  content: string
}
export interface AssistantMsg {
  role: 'assistant'
  blocks: Block[]
}
export type ChatMsg = UserMsg | AssistantMsg

// SSE event from backend
export type SSEEvent =
  | { type: 'thinking_start' }
  | { type: 'thinking'; content: string }
  | { type: 'thinking_end' }
  | { type: 'text_start' }
  | { type: 'text'; content: string }
  | { type: 'text_end' }
  | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result: unknown }
  | { type: 'done' }
  | { type: 'error'; content: string }
