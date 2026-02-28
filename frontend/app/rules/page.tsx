'use client'

import { useState, useEffect, FormEvent } from 'react'
import { getRules, addRule, deleteRule, toggleRule } from '@/lib/api'
import type { Rule } from '@/lib/types'

const TYPE_COLORS = {
  hard: 'bg-red-500/20 text-red-300 border-red-500/30',
  soft: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
}

function RuleCard({ rule, onToggle, onDelete }: {
  rule: Rule
  onToggle: (id: string, active: boolean) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className={`bg-slate-800 border rounded-xl p-4 transition-opacity ${
      rule.active ? 'border-slate-700 opacity-100' : 'border-slate-800 opacity-50'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-white font-semibold text-sm">{rule.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TYPE_COLORS[rule.type]}`}>
              {rule.type.toUpperCase()}
            </span>
            <span className="text-xs text-slate-600 border border-slate-700 px-1.5 py-0.5 rounded">
              P{rule.priority}
            </span>
          </div>
          <p className="text-slate-300 text-sm leading-relaxed">{rule.prompt}</p>
          <p className="text-slate-600 text-xs mt-2">
            {new Date(rule.created_at).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Toggle */}
          <button
            onClick={() => onToggle(rule.id, !rule.active)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              rule.active ? 'bg-blue-600' : 'bg-slate-700'
            }`}
            title={rule.active ? 'Deactivate rule' : 'Activate rule'}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              rule.active ? 'translate-x-4.5' : 'translate-x-0.5'
            }`} />
          </button>

          {/* Delete */}
          <button
            onClick={() => onDelete(rule.id)}
            className="text-slate-600 hover:text-red-400 transition-colors p-1"
            title="Delete rule"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

const RULE_TEMPLATES = [
  { name: 'ESG Exclusion',       prompt: 'Exclude fossil fuel companies and defense contractors',           type: 'hard', priority: 1 },
  { name: 'Max Drawdown Guard',  prompt: 'If any position has declined more than 30%, flag for review',    type: 'soft', priority: 3 },
  { name: 'Momentum Tilt',       prompt: 'Tilt 5% extra weight toward 3-month outperformers within QQQ',  type: 'soft', priority: 5 },
  { name: 'Min Diversification', prompt: 'Maintain at least 6 individual stock positions at all times',   type: 'hard', priority: 2 },
]

export default function RulesPage() {
  const [rules,    setRules]    = useState<Rule[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [name,     setName]     = useState('')
  const [prompt,   setPrompt]   = useState('')
  const [ruleType, setRuleType] = useState<'hard' | 'soft'>('soft')
  const [priority, setPriority] = useState(5)

  useEffect(() => {
    getRules().then(setRules).finally(() => setLoading(false))
  }, [])

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !prompt.trim()) return
    setSaving(true)
    try {
      const r = await addRule({ name, prompt, type: ruleType, priority })
      setRules(prev => [...prev, r])
      setName(''); setPrompt(''); setRuleType('soft'); setPriority(5)
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (id: string, active: boolean) => {
    const updated = await toggleRule(id, active)
    setRules(prev => prev.map(r => r.id === id ? updated : r))
  }

  const handleDelete = async (id: string) => {
    await deleteRule(id)
    setRules(prev => prev.filter(r => r.id !== id))
  }

  const applyTemplate = (t: typeof RULE_TEMPLATES[0]) => {
    setName(t.name); setPrompt(t.prompt)
    setRuleType(t.type as 'hard' | 'soft')
    setPriority(t.priority)
    setShowForm(true)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full text-slate-500">Loading rules…</div>
  )

  const activeRules   = rules.filter(r => r.active)
  const inactiveRules = rules.filter(r => !r.active)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Advisor Rules</h1>
          <p className="text-slate-400 text-sm mt-1">
            {activeRules.length} active · {inactiveRules.length} inactive
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {showForm ? '✕ Cancel' : '+ Add Rule'}
        </button>
      </div>

      {/* Add rule form */}
      {showForm && (
        <div className="bg-slate-800 border border-blue-500/30 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">New Advisor Rule</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">Rule Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Tech Sector Cap"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Type</label>
                  <select
                    value={ruleType}
                    onChange={e => setRuleType(e.target.value as 'hard' | 'soft')}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                  >
                    <option value="hard">Hard constraint</option>
                    <option value="soft">Soft preference</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Priority (1=high)</label>
                  <input
                    type="number" min={1} max={10}
                    value={priority}
                    onChange={e => setPriority(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">
                Rule (natural language prompt injected into the agent)
              </label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. Technology sector exposure must not exceed 40% of total portfolio value"
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60 resize-none"
                required
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? 'Adding…' : 'Add Rule'}
            </button>
          </form>

          {/* Templates */}
          <div className="mt-4 pt-4 border-t border-slate-700">
            <p className="text-xs text-slate-500 mb-2">Quick templates:</p>
            <div className="flex flex-wrap gap-2">
              {RULE_TEMPLATES.map(t => (
                <button
                  key={t.name}
                  onClick={() => applyTemplate(t)}
                  className="text-xs px-2.5 py-1 rounded border border-slate-700 text-slate-400 hover:border-blue-500/40 hover:text-blue-300 transition-colors"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Active rules */}
      {activeRules.length > 0 && (
        <div>
          <h2 className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
            Active Rules ({activeRules.length})
          </h2>
          <div className="space-y-3">
            {[...activeRules]
              .sort((a, b) => a.priority - b.priority)
              .map(r => (
                <RuleCard key={r.id} rule={r} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
          </div>
        </div>
      )}

      {/* Inactive rules */}
      {inactiveRules.length > 0 && (
        <div>
          <h2 className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
            Inactive Rules ({inactiveRules.length})
          </h2>
          <div className="space-y-3">
            {inactiveRules.map(r => (
              <RuleCard key={r.id} rule={r} onToggle={handleToggle} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {rules.length === 0 && (
        <div className="text-center py-16 text-slate-600">
          <div className="text-4xl mb-3">📋</div>
          <p>No rules yet. Add your first advisor rule.</p>
        </div>
      )}
    </div>
  )
}
