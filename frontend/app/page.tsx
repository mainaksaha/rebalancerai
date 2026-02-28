'use client'

import { useState, useRef, useEffect, FormEvent } from 'react'
import { streamChat } from '@/lib/api'
import type { ChatMsg, UserMsg, AssistantMsg, Block, SSEEvent } from '@/lib/types'

// ── Sub-components ────────────────────────────────────────────────────────────
function ThinkingBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="my-1 rounded border border-slate-700/50 bg-slate-900/50 text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-slate-500 hover:text-slate-400"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span className="italic">Thinking…</span>
      </button>
      {open && (
        <pre className="px-3 pb-2 text-slate-500 whitespace-pre-wrap break-words leading-relaxed">
          {content}
        </pre>
      )}
    </div>
  )
}

function ToolCallBlock({ tool, args }: { tool: string; args: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)
  const hasArgs = Object.keys(args).length > 0
  return (
    <div className="my-1 rounded border border-blue-500/20 bg-blue-500/5 text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-blue-400 hover:text-blue-300"
      >
        <span className="text-blue-500">⚙</span>
        <span className="font-mono">Called: {tool}</span>
        {hasArgs && <span className="text-slate-600 ml-auto">{open ? '▾' : '▸'}</span>}
      </button>
      {open && hasArgs && (
        <pre className="px-3 pb-2 text-slate-400 font-mono whitespace-pre-wrap break-words">
          {JSON.stringify(args, null, 2)}
        </pre>
      )}
    </div>
  )
}

function ToolResultBlock({ tool, result }: { tool: string; result: unknown }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="my-1 rounded border border-green-500/20 bg-green-500/5 text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-green-400 hover:text-green-300"
      >
        <span className="text-green-500">✓</span>
        <span className="font-mono">Result: {tool}</span>
        <span className="text-slate-600 ml-auto">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <pre className="px-3 pb-2 text-slate-400 font-mono text-xs whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  )
}

function AssistantBubble({ msg, isStreaming }: { msg: AssistantMsg; isStreaming: boolean }) {
  const textBlocks = msg.blocks.filter(b => b.type === 'text')
  const lastText   = textBlocks[textBlocks.length - 1] as { type: 'text'; content: string } | undefined

  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
        🤖
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        {msg.blocks.map((block, i) => {
          if (block.type === 'thinking')    return <ThinkingBlock   key={i} content={block.content} />
          if (block.type === 'tool_call')   return <ToolCallBlock   key={i} tool={block.tool} args={block.args} />
          if (block.type === 'tool_result') return <ToolResultBlock key={i} tool={block.tool} result={block.result} />
          if (block.type === 'text') {
            const isLast = block === lastText
            return (
              <p
                key={i}
                className={`text-slate-200 leading-relaxed whitespace-pre-wrap text-sm ${
                  isLast && isStreaming ? 'cursor-blink' : ''
                }`}
              >
                {block.content}
              </p>
            )
          }
          return null
        })}
        {isStreaming && msg.blocks.length === 0 && (
          <p className="text-slate-500 text-sm animate-pulse">Thinking…</p>
        )}
      </div>
    </div>
  )
}

// ── Suggested prompts ─────────────────────────────────────────────────────────
const SUGGESTIONS = [
  'Analyze my portfolio and check all rules',
  'What is my current alignment score?',
  'Generate a rebalance plan at 50% aggressiveness',
  'Which rules are currently violated?',
  'What is my tech sector exposure?',
]

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      blocks: [{
        type: 'text',
        content:
          "Hi! I'm your portfolio rebalancing advisor powered by Claude.\n\n" +
          "I can analyze your portfolio against QQQ, check advisor rules, and generate rebalance recommendations.\n\n" +
          "Try asking me to analyze your portfolio or generate a rebalance plan.",
      }],
    },
  ])
  const [input,       setInput]       = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return

    const userMsg: UserMsg = { role: 'user', content: text.trim() }

    // Build flattened history for the API
    const apiMsgs: { role: string; content: string }[] = []
    for (const m of messages) {
      if (m.role === 'user') {
        apiMsgs.push({ role: 'user', content: m.content })
      } else {
        const txt = m.blocks
          .filter(b => b.type === 'text')
          .map(b => (b as { type: 'text'; content: string }).content)
          .join('')
        if (txt) apiMsgs.push({ role: 'assistant', content: txt })
      }
    }
    apiMsgs.push({ role: 'user', content: text.trim() })

    setMessages(prev => [
      ...prev,
      userMsg,
      { role: 'assistant', blocks: [] } as AssistantMsg,
    ])
    setInput('')
    setIsStreaming(true)

    try {
      for await (const event of streamChat(apiMsgs)) {
        setMessages(prev => {
          const updated = [...prev]
          const last    = { ...(updated[updated.length - 1] as AssistantMsg) }
          const blocks  = [...last.blocks]

          if (event.type === 'text') {
            const idx = blocks.findLastIndex(b => b.type === 'text')
            if (idx >= 0) {
              const b = blocks[idx] as { type: 'text'; content: string }
              blocks[idx] = { ...b, content: b.content + event.content }
            } else {
              blocks.push({ type: 'text', content: event.content })
            }
          } else if (event.type === 'thinking') {
            const idx = blocks.findLastIndex(b => b.type === 'thinking')
            if (idx >= 0) {
              const b = blocks[idx] as { type: 'thinking'; content: string }
              blocks[idx] = { ...b, content: b.content + event.content }
            } else {
              blocks.push({ type: 'thinking', content: event.content })
            }
          } else if (event.type === 'tool_call') {
            blocks.push({ type: 'tool_call', tool: event.tool, args: event.args })
          } else if (event.type === 'tool_result') {
            blocks.push({ type: 'tool_result', tool: event.tool, result: event.result })
          }

          updated[updated.length - 1] = { ...last, blocks }
          return updated
        })

        if (event.type === 'done' || event.type === 'error') break
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev]
        const last    = updated[updated.length - 1] as AssistantMsg
        updated[updated.length - 1] = {
          ...last,
          blocks: [...last.blocks, { type: 'text', content: '⚠️ Error: failed to reach the backend.' }],
        }
        return updated
      })
    } finally {
      setIsStreaming(false)
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4 flex-shrink-0">
        <h1 className="text-white font-semibold text-lg">Rebalancer Agent</h1>
        <p className="text-slate-500 text-xs mt-0.5">Conversational portfolio analysis · claude-opus-4-6</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <div key={i} className="flex items-start gap-3 justify-end">
              <div className="max-w-xl bg-slate-800 border border-slate-700 rounded-2xl px-4 py-2.5 text-sm text-slate-200">
                {msg.content}
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
                👤
              </div>
            </div>
          ) : (
            <AssistantBubble
              key={i}
              msg={msg}
              isStreaming={isStreaming && i === messages.length - 1}
            />
          )
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions (only when not streaming and only on first message) */}
      {messages.length === 1 && !isStreaming && (
        <div className="px-6 pb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="text-xs px-3 py-1.5 rounded-full border border-slate-700 text-slate-400 hover:border-blue-500/50 hover:text-blue-300 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-slate-800 px-6 py-4 flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isStreaming}
            placeholder={isStreaming ? 'Agent is thinking…' : 'Ask the agent anything about your portfolio…'}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
          >
            {isStreaming ? '…' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}
