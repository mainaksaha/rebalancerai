import type { Portfolio, DriftAnalysis, SectorExposure, Rule, RebalancePlan, RebalanceOrder, RebalanceExecution, RebalanceHistoryItem, SSEEvent } from './types'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json()
}

// ── Portfolio ─────────────────────────────────────────────────────────────────
export const getPortfolio   = ()     => get<Portfolio>('/portfolio')
export const getDrift       = ()     => get<DriftAnalysis>('/portfolio/drift')
export const getSectors     = ()     => get<SectorExposure[]>('/portfolio/sectors')

// ── Rules ─────────────────────────────────────────────────────────────────────
export const getRules       = ()     => get<Rule[]>('/rules')
export const addRule        = (r: { name: string; prompt: string; type: string; priority: number }) =>
  post<Rule>('/rules', r)
export const deleteRule     = (id: string) =>
  fetch(`${API}/rules/${id}`, { method: 'DELETE' }).then(r => r.json())
export const toggleRule     = (id: string, active: boolean) =>
  fetch(`${API}/rules/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  }).then(r => r.json())

// ── Holdings CRUD ─────────────────────────────────────────────────────────────
export const addHolding = (h: { ticker: string; shares: number; avg_cost: number }) =>
  post('/portfolio/holdings', h)

export const updateHolding = (ticker: string, h: { shares: number; avg_cost: number }) =>
  fetch(`${API}/portfolio/holdings/${ticker}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker, ...h }),
  }).then(r => { if (!r.ok) throw new Error(`PUT holdings failed: ${r.status}`); return r.json() })

export const deleteHolding = (ticker: string) =>
  fetch(`${API}/portfolio/holdings/${ticker}`, { method: 'DELETE' }).then(r => r.json())

export const updateCash = (cash_balance: number) =>
  fetch(`${API}/portfolio/cash`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cash_balance }),
  }).then(r => { if (!r.ok) throw new Error(`PUT cash failed: ${r.status}`); return r.json() })

// ── Rebalance ─────────────────────────────────────────────────────────────────
export const getRebalancePlan = (aggressiveness: number = 0.5) =>
  post<RebalancePlan>('/rebalance', { aggressiveness })

export const executeRebalancePlan = (
  orders: RebalanceOrder[],
  aggressiveness: number,
  alignment_before: number,
  projected_alignment: number,
) =>
  post<RebalanceExecution>('/rebalance/execute', {
    orders,
    aggressiveness,
    alignment_before,
    projected_alignment,
  })

export const getRebalanceHistory = () =>
  get<RebalanceHistoryItem[]>('/rebalance/history')

export const depositCash = (amount: number) =>
  post<{ cash_balance: number; deposited: number }>('/portfolio/deposit', { amount })

// ── Chat streaming ────────────────────────────────────────────────────────────
export async function* streamChat(
  messages: { role: string; content: string }[]
): AsyncGenerator<SSEEvent> {
  const response = await fetch(`${API}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })

  if (!response.ok) throw new Error(`Chat request failed: ${response.status}`)
  if (!response.body) throw new Error('No response body')

  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let   buffer  = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        yield JSON.parse(line.slice(6)) as SSEEvent
      } catch {
        // skip malformed lines
      }
    }
  }
}
