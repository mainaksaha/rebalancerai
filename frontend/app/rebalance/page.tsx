'use client'

import { useState } from 'react'
import { getRebalancePlan, executeRebalancePlan } from '@/lib/api'
import type { RebalancePlan, RebalanceExecution } from '@/lib/types'

function AlignmentBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className={`font-bold ${color}`}>{value}%</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color.replace('text-', 'bg-')}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  )
}

function CashBanner({ cash }: { cash: RebalancePlan['cash'] }) {
  if (cash.sufficient) {
    return (
      <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/25 rounded-xl px-4 py-3 text-sm">
        <span className="text-green-400 text-lg leading-tight">✅</span>
        <div>
          <span className="text-green-300 font-semibold">Sufficient cash — plan is fully executable.</span>
          <span className="text-green-400/70 ml-2">
            Available: ${cash.available.toLocaleString()} (${cash.current_balance.toLocaleString()} cash + ${cash.sell_proceeds.toLocaleString()} sell proceeds)
          </span>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 text-sm">
      <span className="text-amber-400 text-lg leading-tight">⚠️</span>
      <div className="space-y-0.5">
        <div className="text-amber-300 font-semibold">
          Cash shortfall of ${cash.shortfall.toLocaleString()} — some buy orders cannot be executed.
        </div>
        <div className="text-amber-400/70">
          Available: ${cash.available.toLocaleString()} (${cash.current_balance.toLocaleString()} cash + ${cash.sell_proceeds.toLocaleString()} sell proceeds) · Required: ${cash.required.toLocaleString()}
        </div>
        <div className="text-amber-400/70">
          Deposit cash on the <a href="/settings" className="underline hover:text-amber-300">Settings page</a> to fund all orders.
        </div>
      </div>
    </div>
  )
}

export default function RebalancePage() {
  const [plan,           setPlan]           = useState<RebalancePlan | null>(null)
  const [aggressiveness, setAggressiveness] = useState(0.5)
  const [loading,        setLoading]        = useState(false)
  const [executing,      setExecuting]      = useState(false)
  const [execution,      setExecution]      = useState<RebalanceExecution | null>(null)
  const [error,          setError]          = useState<string | null>(null)

  const handleGenerate = async () => {
    setLoading(true); setError(null); setPlan(null); setExecution(null)
    try {
      setPlan(await getRebalancePlan(aggressiveness))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate plan')
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async () => {
    if (!plan) return
    setExecuting(true); setError(null)
    try {
      // Only send funded orders
      const fundedOrders = plan.orders.filter(o => o.funded)
      const result = await executeRebalancePlan(
        fundedOrders,
        plan.aggressiveness,
        plan.current_alignment,
        plan.projected_alignment,
      )
      setExecution(result)
      setPlan(null)   // clear plan — portfolio has changed
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Execution failed')
    } finally {
      setExecuting(false)
    }
  }

  const aggLabel = aggressiveness <= 0.25
    ? 'Conservative' : aggressiveness <= 0.5
    ? 'Moderate'     : aggressiveness <= 0.75
    ? 'Aggressive'   : 'Maximum'

  const fundedOrders   = plan?.orders.filter(o => o.funded)  ?? []
  const unfundedOrders = plan?.orders.filter(o => !o.funded) ?? []

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-white text-2xl font-bold">Rebalance</h1>
        <p className="text-slate-400 text-sm mt-1">Generate buy/sell orders to align with QQQ</p>
      </div>

      {/* Controls */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-4">Rebalance Parameters</h2>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <label className="text-slate-300 font-medium">Aggressiveness</label>
              <span className="text-blue-400 font-semibold">
                {aggLabel} ({Math.round(aggressiveness * 100)}%)
              </span>
            </div>
            <input
              type="range" min={0} max={1} step={0.05}
              value={aggressiveness}
              onChange={e => { setAggressiveness(Number(e.target.value)); setPlan(null); setExecution(null) }}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>Conservative</span><span>Moderate</span><span>Maximum</span>
            </div>
          </div>
          <div className="bg-slate-900/50 rounded-lg px-4 py-3 text-xs text-slate-400">
            <strong className="text-slate-300">What this means: </strong>
            At {Math.round(aggressiveness * 100)}%, each position moves {Math.round(aggressiveness * 100)}% of
            the way toward its QQQ target weight.
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Generating…' : '⚖️  Generate Rebalance Plan'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      {/* Execution success */}
      {execution && (
        <div className="bg-green-500/10 border border-green-500/25 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✅</span>
            <h2 className="text-green-300 font-bold text-lg">Orders Executed Successfully</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            {[
              { label: 'Executed',       value: execution.orders_executed,                                         color: 'text-white' },
              { label: 'Bought',         value: `${execution.buys} orders · $${execution.total_buy_value.toLocaleString()}`,  color: 'text-green-400' },
              { label: 'Sold',           value: `${execution.sells} orders · $${execution.total_sell_value.toLocaleString()}`, color: 'text-red-400' },
              { label: 'New Cash',       value: `$${execution.new_cash_balance.toLocaleString()}`,                color: 'text-yellow-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-800 rounded-lg p-3">
                <div className={`font-bold text-sm ${color}`}>{value}</div>
                <div className="text-slate-500 text-xs mt-0.5">{label}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>Alignment: <span className="text-slate-300">{execution.alignment_before}%</span></span>
            <span>→</span>
            <span className="text-blue-400 font-semibold">{execution.alignment_after}% (projected)</span>
          </div>
          {execution.orders_skipped > 0 && (
            <div className="text-xs text-amber-400">
              ⚠ {execution.orders_skipped} order(s) skipped due to insufficient cash.
            </div>
          )}
          <button
            onClick={() => setExecution(null)}
            className="text-xs text-slate-500 hover:text-slate-300 underline"
          >
            Generate another plan
          </button>
        </div>
      )}

      {plan && (
        <>
          {/* Cash banner */}
          <CashBanner cash={plan.cash} />

          {/* Alignment */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <h2 className="text-white font-semibold mb-4">Alignment Impact</h2>
            <div className="space-y-3">
              <AlignmentBar
                label="Current alignment"
                value={plan.current_alignment}
                color={plan.current_alignment >= 70 ? 'text-green-400' : plan.current_alignment >= 50 ? 'text-yellow-400' : 'text-red-400'}
              />
              <AlignmentBar label="Projected after rebalance" value={plan.projected_alignment} color="text-blue-400" />
            </div>
            <div className="mt-3 text-xs text-slate-500">
              +{(plan.projected_alignment - plan.current_alignment).toFixed(1)}% improvement
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Orders',   value: plan.summary.total_orders,                   color: 'text-white' },
              { label: 'Buy Orders',     value: plan.summary.buys,                           color: 'text-green-400' },
              { label: 'Sell Orders',    value: plan.summary.sells,                          color: 'text-red-400' },
              { label: 'Total Turnover', value: `$${(plan.summary.total_buy_value + plan.summary.total_sell_value).toLocaleString()}`, color: 'text-yellow-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-slate-500 text-xs mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* Orders table */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-white font-semibold">Orders ({plan.orders.length})</h2>
              <div className="flex gap-4 text-xs">
                <span className="text-green-400">↑ Buy ${plan.summary.total_buy_value.toLocaleString()}</span>
                <span className="text-red-400">↓ Sell ${plan.summary.total_sell_value.toLocaleString()}</span>
              </div>
            </div>
            {plan.orders.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                No orders needed — portfolio is already well-aligned.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      {['Action','Ticker','Shares','Est. Value','Cur. Weight','Target','Status','Reason'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {plan.orders.map((order, i) => (
                      <tr
                        key={i}
                        className={`border-b border-slate-700/30 transition-colors ${
                          order.funded ? 'hover:bg-slate-700/20' : 'opacity-50'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2 py-1 rounded ${
                            order.action === 'BUY' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                          }`}>
                            {order.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-white font-mono">{order.ticker}</td>
                        <td className="px-4 py-3 text-slate-300 font-mono">{order.shares}</td>
                        <td className="px-4 py-3 text-slate-200 font-semibold font-mono">${order.estimated_value.toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-400 font-mono">{order.current_weight.toFixed(1)}%</td>
                        <td className="px-4 py-3 text-slate-400 font-mono">{order.target_weight.toFixed(1)}%</td>
                        <td className="px-4 py-3">
                          {order.action === 'SELL' || order.funded ? (
                            <span className="text-xs text-green-400">✓ Funded</span>
                          ) : (
                            <span className="text-xs text-amber-400">⚠ No cash</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs max-w-xs">{order.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Execute button */}
          {plan.orders.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-white font-semibold">Execute Plan</h2>
                  {plan.cash.sufficient ? (
                    <p className="text-slate-400 text-sm mt-1">
                      All {plan.summary.total_orders} orders will be mock-executed and portfolio updated.
                    </p>
                  ) : (
                    <p className="text-amber-400/80 text-sm mt-1">
                      Only {fundedOrders.length} funded order(s) will execute.{' '}
                      {unfundedOrders.length} buy order(s) skipped due to cash shortfall.
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-slate-500 shrink-0">
                  <div>Buys: <span className="text-green-400">${plan.summary.funded_buy_value.toLocaleString()}</span></div>
                  <div>Sells: <span className="text-red-400">${plan.summary.total_sell_value.toLocaleString()}</span></div>
                </div>
              </div>
              <button
                onClick={handleExecute}
                disabled={executing || fundedOrders.length === 0}
                className={`w-full py-3 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-white ${
                  plan.cash.sufficient
                    ? 'bg-green-600 hover:bg-green-500'
                    : 'bg-amber-600 hover:bg-amber-500'
                }`}
              >
                {executing
                  ? 'Executing…'
                  : plan.cash.sufficient
                  ? `🚀 Execute All ${plan.summary.total_orders} Orders`
                  : `🚀 Execute ${fundedOrders.length} Funded Orders`}
              </button>
              <p className="text-xs text-slate-600 text-center">
                ⚠️ Mock execution only — no real trades are placed.
              </p>
            </div>
          )}
        </>
      )}

      {!plan && !loading && !execution && (
        <div className="text-center py-16 text-slate-600">
          <div className="text-4xl mb-3">⚖️</div>
          <p>Set your aggressiveness and generate a rebalance plan.</p>
        </div>
      )}
    </div>
  )
}
