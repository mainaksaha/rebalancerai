'use client'

import { useState, useEffect } from 'react'
import { getPortfolio, getDrift } from '@/lib/api'
import type { Portfolio, DriftAnalysis } from '@/lib/types'

function StatCard({ label, value, sub, color = 'text-white' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-slate-500 text-xs mt-1">{sub}</div>}
    </div>
  )
}

function DriftBar({ value, max = 15 }: { value: number; max?: number }) {
  const pct   = Math.min(Math.abs(value) / max * 100, 100)
  const color = value > 2 ? 'bg-red-500' : value < -2 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-mono w-14 text-right ${
        value > 0 ? 'text-red-400' : value < 0 ? 'text-yellow-400' : 'text-green-400'
      }`}>
        {value > 0 ? '+' : ''}{value.toFixed(1)}%
      </span>
    </div>
  )
}

function AlignmentRing({ score }: { score: number }) {
  const r = 28
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = score >= 70 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444'
  return (
    <div className="relative w-20 h-20">
      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#1e293b" strokeWidth="6" />
        <circle
          cx="32" cy="32" r={r}
          fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-white">{score}</span>
      </div>
    </div>
  )
}

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [drift,     setDrift]     = useState<DriftAnalysis | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getPortfolio(), getDrift()])
      .then(([p, d]) => { setPortfolio(p); setDrift(d) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-full text-slate-500">
      Loading portfolio…
    </div>
  )
  if (error || !portfolio || !drift) return (
    <div className="p-6 text-red-400">Error: {error ?? 'Failed to load'}</div>
  )

  const driftMap = Object.fromEntries(drift.holdings.map(h => [h.ticker, h]))

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-white text-2xl font-bold">Portfolio</h1>
        <p className="text-slate-400 text-sm mt-1">QQQ-benchmarked holdings · mock data</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Value"
          value={`$${portfolio.total_value.toLocaleString()}`}
          sub={`Equity $${portfolio.total_equity.toLocaleString()}`}
        />
        <StatCard
          label="Cash"
          value={`$${portfolio.cash_balance.toLocaleString()}`}
          sub={`${((portfolio.cash_balance / portfolio.total_value) * 100).toFixed(1)}% of portfolio`}
          color="text-slate-300"
        />
        <StatCard
          label="Holdings"
          value={String(portfolio.holdings.length)}
          sub={`${drift.drift_summary.holdings_aligned} aligned with QQQ`}
        />
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-4">
          <AlignmentRing score={drift.alignment_score} />
          <div>
            <div className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Alignment</div>
            <div className="text-white text-lg font-bold">{drift.alignment_score}%</div>
            <div className="text-slate-500 text-xs">vs QQQ</div>
          </div>
        </div>
      </div>

      {/* Holdings table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-white font-semibold">Holdings</h2>
          <span className="text-slate-500 text-xs">Sorted by value</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                {['Ticker','Sector','Shares','Price','Value','Weight','Target','Drift','P&L'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...portfolio.holdings]
                .sort((a, b) => b.value - a.value)
                .map(h => {
                  const d = driftMap[h.ticker]
                  return (
                    <tr key={h.ticker} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-bold text-white font-mono">{h.ticker}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{h.sector}</td>
                      <td className="px-4 py-3 text-slate-300 font-mono">{h.shares}</td>
                      <td className="px-4 py-3 text-slate-300 font-mono">${h.current_price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-white font-semibold font-mono">
                        ${h.value.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-slate-300 font-mono">{h.weight.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-slate-400 font-mono">
                        {d ? `${d.target_weight.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {d ? <DriftBar value={d.drift} /> : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={h.unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {h.unrealized_pnl >= 0 ? '+' : ''}${h.unrealized_pnl.toLocaleString()}
                        </span>
                        <span className="text-slate-500 text-xs ml-1">({h.pnl_pct.toFixed(1)}%)</span>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drift summary */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-3">Drift Summary vs QQQ</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: 'Total Abs Drift',  value: `${drift.drift_summary.total_absolute_drift.toFixed(1)}%`, color: 'text-white' },
            { label: 'Overweight',       value: drift.drift_summary.holdings_over_weight,    color: 'text-red-400'   },
            { label: 'Underweight',      value: drift.drift_summary.holdings_under_weight,   color: 'text-yellow-400'},
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-900 rounded-lg py-3">
              <div className={`text-xl font-bold ${color}`}>{value}</div>
              <div className="text-slate-500 text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
