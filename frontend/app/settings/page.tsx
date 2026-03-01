'use client'

import { useEffect, useState } from 'react'
import { getPortfolio, addHolding, updateHolding, deleteHolding, updateCash } from '@/lib/api'
import type { Holding } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────
interface EditState { shares: string; avg_cost: string }
interface AddState  { ticker: string; shares: string; avg_cost: string }

const EMPTY_ADD: AddState = { ticker: '', shares: '', avg_cost: '' }

// ── Component ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [holdings,    setHoldings]    = useState<Holding[]>([])
  const [cash,        setCash]        = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)

  // editing existing row
  const [editTicker,  setEditTicker]  = useState<string | null>(null)
  const [editVals,    setEditVals]    = useState<EditState>({ shares: '', avg_cost: '' })

  // adding new row
  const [adding,      setAdding]      = useState(false)
  const [addVals,     setAddVals]     = useState<AddState>(EMPTY_ADD)

  // cash edit
  const [editingCash, setEditingCash] = useState(false)
  const [cashInput,   setCashInput]   = useState('')

  // saving spinners
  const [saving,      setSaving]      = useState(false)

  // ── Load ───────────────────────────────────────────────────────────────────
  async function load() {
    try {
      setLoading(true)
      const p = await getPortfolio()
      setHoldings(p.holdings)
      setCash(p.cash_balance)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load portfolio')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Handlers ───────────────────────────────────────────────────────────────
  function startEdit(h: Holding) {
    setEditTicker(h.ticker)
    setEditVals({ shares: String(h.shares), avg_cost: String(h.avg_cost) })
    setAdding(false)
  }

  async function saveEdit(ticker: string) {
    const shares   = parseFloat(editVals.shares)
    const avg_cost = parseFloat(editVals.avg_cost)
    if (isNaN(shares) || isNaN(avg_cost) || shares <= 0 || avg_cost <= 0) {
      setError('Shares and avg cost must be positive numbers')
      return
    }
    setSaving(true)
    try {
      await updateHolding(ticker, { shares, avg_cost })
      setEditTicker(null)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally { setSaving(false) }
  }

  async function handleDelete(ticker: string) {
    if (!confirm(`Remove ${ticker} from portfolio?`)) return
    setSaving(true)
    try {
      await deleteHolding(ticker)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally { setSaving(false) }
  }

  async function handleAdd() {
    const ticker   = addVals.ticker.trim().toUpperCase()
    const shares   = parseFloat(addVals.shares)
    const avg_cost = parseFloat(addVals.avg_cost)
    if (!ticker) { setError('Ticker is required'); return }
    if (isNaN(shares) || shares <= 0) { setError('Shares must be a positive number'); return }
    if (isNaN(avg_cost) || avg_cost <= 0) { setError('Avg cost must be a positive number'); return }
    setSaving(true)
    try {
      await addHolding({ ticker, shares, avg_cost })
      setAdding(false)
      setAddVals(EMPTY_ADD)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Add failed')
    } finally { setSaving(false) }
  }

  async function handleSaveCash() {
    const val = parseFloat(cashInput)
    if (isNaN(val) || val < 0) { setError('Cash balance must be 0 or more'); return }
    setSaving(true)
    try {
      await updateCash(val)
      setEditingCash(false)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Cash update failed')
    } finally { setSaving(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-slate-400">
      Loading portfolio…
    </div>
  )

  return (
    <div className="flex-1 p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-1">Portfolio Settings</h1>
      <p className="text-slate-400 text-sm mb-8">Manage your holdings and cash balance</p>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-300 hover:text-white ml-4">✕</button>
        </div>
      )}

      {/* ── Holdings table ─────────────────────────────────────────────────── */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-white font-semibold">Holdings</h2>
          <button
            onClick={() => { setAdding(true); setEditTicker(null) }}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            + Add Position
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs uppercase border-b border-slate-700">
              <th className="px-6 py-3 text-left">Ticker</th>
              <th className="px-6 py-3 text-right">Shares</th>
              <th className="px-6 py-3 text-right">Avg Cost</th>
              <th className="px-6 py-3 text-right">Current Price</th>
              <th className="px-6 py-3 text-right">Value</th>
              <th className="px-6 py-3 text-right">P&amp;L</th>
              <th className="px-6 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {holdings.map(h => (
              <tr key={h.ticker} className="hover:bg-slate-700/20 transition-colors">
                {editTicker === h.ticker ? (
                  // ── Edit row ──────────────────────────────────────────────
                  <>
                    <td className="px-6 py-3 font-mono font-bold text-white">{h.ticker}</td>
                    <td className="px-6 py-3 text-right">
                      <input
                        type="number" min="0" step="any"
                        value={editVals.shares}
                        onChange={e => setEditVals(v => ({ ...v, shares: e.target.value }))}
                        className="w-24 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-right text-sm focus:outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-6 py-3 text-right">
                      <input
                        type="number" min="0" step="any"
                        value={editVals.avg_cost}
                        onChange={e => setEditVals(v => ({ ...v, avg_cost: e.target.value }))}
                        className="w-24 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-right text-sm focus:outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-6 py-3 text-right text-slate-400">${h.current_price.toFixed(2)}</td>
                    <td className="px-6 py-3 text-right text-slate-400">—</td>
                    <td className="px-6 py-3 text-right text-slate-400">—</td>
                    <td className="px-6 py-3 text-center space-x-2">
                      <button
                        onClick={() => saveEdit(h.ticker)}
                        disabled={saving}
                        className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditTicker(null)}
                        className="px-3 py-1 text-xs bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </td>
                  </>
                ) : (
                  // ── Display row ───────────────────────────────────────────
                  <>
                    <td className="px-6 py-3 font-mono font-bold text-white">{h.ticker}</td>
                    <td className="px-6 py-3 text-right text-slate-300">{h.shares}</td>
                    <td className="px-6 py-3 text-right text-slate-300">${h.avg_cost.toFixed(2)}</td>
                    <td className="px-6 py-3 text-right text-slate-300">${h.current_price.toFixed(2)}</td>
                    <td className="px-6 py-3 text-right text-slate-300">${h.value.toLocaleString()}</td>
                    <td className={`px-6 py-3 text-right font-medium ${h.pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {h.pnl_pct >= 0 ? '+' : ''}{h.pnl_pct.toFixed(1)}%
                    </td>
                    <td className="px-6 py-3 text-center space-x-2">
                      <button
                        onClick={() => startEdit(h)}
                        className="px-3 py-1 text-xs bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(h.ticker)}
                        disabled={saving}
                        className="px-3 py-1 text-xs bg-red-600/70 hover:bg-red-500 text-white rounded transition-colors disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}

            {/* ── Add row ─────────────────────────────────────────────────── */}
            {adding && (
              <tr className="bg-blue-500/5">
                <td className="px-6 py-3">
                  <input
                    type="text" placeholder="AAPL"
                    value={addVals.ticker}
                    onChange={e => setAddVals(v => ({ ...v, ticker: e.target.value.toUpperCase() }))}
                    className="w-20 bg-slate-700 border border-blue-500/50 rounded px-2 py-1 text-white text-sm font-mono uppercase focus:outline-none focus:border-blue-500"
                    autoFocus
                  />
                </td>
                <td className="px-6 py-3 text-right">
                  <input
                    type="number" min="0" step="any" placeholder="0"
                    value={addVals.shares}
                    onChange={e => setAddVals(v => ({ ...v, shares: e.target.value }))}
                    className="w-24 bg-slate-700 border border-blue-500/50 rounded px-2 py-1 text-white text-right text-sm focus:outline-none focus:border-blue-500"
                  />
                </td>
                <td className="px-6 py-3 text-right">
                  <input
                    type="number" min="0" step="any" placeholder="0.00"
                    value={addVals.avg_cost}
                    onChange={e => setAddVals(v => ({ ...v, avg_cost: e.target.value }))}
                    className="w-24 bg-slate-700 border border-blue-500/50 rounded px-2 py-1 text-white text-right text-sm focus:outline-none focus:border-blue-500"
                  />
                </td>
                <td colSpan={3} />
                <td className="px-6 py-3 text-center space-x-2">
                  <button
                    onClick={handleAdd}
                    disabled={saving}
                    className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setAdding(false); setAddVals(EMPTY_ADD) }}
                    className="px-3 py-1 text-xs bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors"
                  >
                    Cancel
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Cash balance ────────────────────────────────────────────────────── */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-6 py-5 flex items-center justify-between">
        <div>
          <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Cash Balance</div>
          {editingCash ? (
            <div className="flex items-center gap-2">
              <span className="text-white">$</span>
              <input
                type="number" min="0" step="0.01"
                value={cashInput}
                onChange={e => setCashInput(e.target.value)}
                className="w-36 bg-slate-700 border border-blue-500/50 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
                autoFocus
              />
              <button
                onClick={handleSaveCash}
                disabled={saving}
                className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => setEditingCash(false)}
                className="px-3 py-1 text-xs bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="text-2xl font-bold text-white">${cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          )}
        </div>
        {!editingCash && (
          <button
            onClick={() => { setEditingCash(true); setCashInput(String(cash)) }}
            className="px-4 py-2 text-sm bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  )
}
