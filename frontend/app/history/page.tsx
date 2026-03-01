'use client'

import { useEffect, useState } from 'react'
import { getRebalanceHistory } from '@/lib/api'
import type { RebalanceHistoryItem } from '@/lib/types'

function AlignmentDelta({ before, after }: { before: number; after: number }) {
  const delta = after - before
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-slate-400 font-mono">{before.toFixed(1)}%</span>
      <span className="text-slate-600">→</span>
      <span className="text-blue-400 font-mono">{after.toFixed(1)}%</span>
      <span className={`text-xs font-semibold ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        ({delta >= 0 ? '+' : ''}{delta.toFixed(1)}%)
      </span>
    </div>
  )
}

export default function HistoryPage() {
  const [history, setHistory] = useState<RebalanceHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    getRebalanceHistory()
      .then(setHistory)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-white text-2xl font-bold">Rebalance History</h1>
        <p className="text-slate-400 text-sm mt-1">Past executed rebalance plans</p>
      </div>

      {loading && (
        <div className="text-center py-16 text-slate-500">Loading history…</div>
      )}

      {!loading && history.length === 0 && (
        <div className="text-center py-16 text-slate-600">
          <div className="text-4xl mb-3">📋</div>
          <p>No rebalance history yet.</p>
          <p className="text-sm mt-1">Execute a rebalance plan to see it here.</p>
        </div>
      )}

      {!loading && history.length > 0 && (
        <div className="space-y-3">
          {history.map(item => {
            const buys    = item.orders.filter(o => o.action === 'BUY')
            const sells   = item.orders.filter(o => o.action === 'SELL')
            const buyVal  = buys.reduce((s, o) => s + o.estimated_value, 0)
            const sellVal = sells.reduce((s, o) => s + o.estimated_value, 0)
            const isOpen  = expanded.has(item.id)
            const date    = new Date(item.executed_at)

            return (
              <div key={item.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                {/* Row header */}
                <button
                  onClick={() => toggle(item.id)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-6 flex-wrap">
                    {/* Date */}
                    <div>
                      <div className="text-white text-sm font-semibold">
                        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <div className="text-slate-500 text-xs">
                        {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    {/* Alignment */}
                    <div>
                      <div className="text-slate-500 text-xs mb-0.5">Alignment</div>
                      <AlignmentDelta before={item.alignment_before} after={item.alignment_after} />
                    </div>

                    {/* Orders summary */}
                    <div className="flex gap-4 text-xs">
                      <div>
                        <span className="text-slate-500">Orders </span>
                        <span className="text-white font-semibold">{item.orders.length}</span>
                      </div>
                      <div>
                        <span className="text-green-400">↑ ${buyVal.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-red-400">↓ ${sellVal.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Aggressiveness */}
                    <div className="text-xs text-slate-500">
                      {Math.round(item.aggressiveness * 100)}% aggressive
                    </div>
                  </div>

                  <span className="text-slate-500 text-sm ml-4">{isOpen ? '▲' : '▼'}</span>
                </button>

                {/* Expanded orders */}
                {isOpen && (
                  <div className="border-t border-slate-700 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/50">
                          {['Action','Ticker','Shares','Value','Weight Before','Target'].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {item.orders.map((order, i) => (
                          <tr key={i} className="border-b border-slate-700/20 hover:bg-slate-700/10">
                            <td className="px-4 py-2.5">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                order.action === 'BUY' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                              }`}>
                                {order.action}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-bold text-white font-mono">{order.ticker}</td>
                            <td className="px-4 py-2.5 text-slate-300 font-mono">{order.shares}</td>
                            <td className="px-4 py-2.5 text-slate-200 font-mono">${order.estimated_value.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-slate-400 font-mono">{order.current_weight.toFixed(1)}%</td>
                            <td className="px-4 py-2.5 text-slate-400 font-mono">{order.target_weight.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
