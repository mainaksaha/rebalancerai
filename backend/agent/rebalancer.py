"""
Core agentic loop for the rebalancer (OpenAI backend).
Streams SSE-formatted events to the caller as it runs:
  text_start / text / text_end
  tool_call  (complete JSON)
  tool_result (complete JSON)
  done / error
"""

import json
from typing import AsyncGenerator, List, Dict, Any

from dotenv import load_dotenv
from openai import AsyncOpenAI

from agent.tools import execute_tool, TOOLS
from core.rules import get_active_rules

load_dotenv()
_client = AsyncOpenAI()

_BASE_SYSTEM = """\
You are an intelligent portfolio rebalancing advisor with expertise in quantitative finance.

You help investors analyze their portfolios against the QQQ benchmark and generate
precise rebalance recommendations that respect all advisor-defined rules.

## Workflow
When asked to analyze or rebalance, follow these steps:
1. Get the current portfolio state and the active advisor rules
2. Evaluate each hard rule — violations must be addressed before anything else
3. Calculate drift from QQQ target weights
4. Generate rebalance orders that close drift while satisfying all constraints
5. Summarize your findings clearly, citing specific numbers

## Rule Hierarchy
- **Hard rules** — must never be violated (sector caps, single-stock limits, etc.)
- **Soft rules** — optimize toward these, but can be traded off if needed

Always present numbers to one decimal place and explain every order with a clear reason.
"""


async def stream_agent_response(
    messages: List[Dict[str, Any]],
) -> AsyncGenerator[str, None]:
    """
    Run the multi-turn agentic loop and yield SSE data lines.
    Each yielded string is a complete 'data: {...}\\n\\n' chunk.
    """
    # Inject active rules into the system prompt
    rules = get_active_rules()
    if rules:
        sorted_rules = sorted(rules, key=lambda r: r["priority"])
        rules_section = "\n## Active Advisor Rules\n" + "\n".join(
            f"- **[{r['type'].upper()} P{r['priority']}] {r['name']}**: {r['prompt']}"
            for r in sorted_rules
        )
    else:
        rules_section = "\n## Active Advisor Rules\nNo active rules — rebalance freely toward QQQ."

    system = _BASE_SYSTEM + rules_section

    # Build message list with system prompt prepended
    current_messages: List[Dict[str, Any]] = [
        {"role": "system", "content": system},
        *messages,
    ]
    max_turns = 12

    for _ in range(max_turns):
        text_started = False
        tool_calls_buf: Dict[int, Dict[str, Any]] = {}  # index → accumulated tool call

        try:
            stream = await _client.chat.completions.create(
                model="gpt-4o",
                messages=current_messages,
                tools=TOOLS,
                tool_choice="auto",
                stream=True,
            )

            async for chunk in stream:
                choice = chunk.choices[0] if chunk.choices else None
                if not choice:
                    continue

                delta = choice.delta

                # ── Text content ──────────────────────────────────────────
                if delta.content:
                    if not text_started:
                        yield _sse({"type": "text_start"})
                        text_started = True
                    yield _sse({"type": "text", "content": delta.content})

                # ── Tool call fragments (accumulate) ──────────────────────
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_buf:
                            tool_calls_buf[idx] = {
                                "id":        "",
                                "name":      "",
                                "arguments": "",
                            }
                        if tc.id:
                            tool_calls_buf[idx]["id"] = tc.id
                        if tc.function and tc.function.name:
                            tool_calls_buf[idx]["name"] = tc.function.name
                        if tc.function and tc.function.arguments:
                            tool_calls_buf[idx]["arguments"] += tc.function.arguments

                finish_reason = choice.finish_reason

            # ── Close text block if we opened one ─────────────────────────
            if text_started:
                yield _sse({"type": "text_end"})

            # ── End turn (no tools) ───────────────────────────────────────
            if finish_reason == "stop" or not tool_calls_buf:
                yield _sse({"type": "done"})
                return

            # ── Execute tool calls ────────────────────────────────────────
            # Append the assistant message with tool_calls
            assistant_tool_calls = [
                {
                    "id":       tc["id"],
                    "type":     "function",
                    "function": {
                        "name":      tc["name"],
                        "arguments": tc["arguments"],
                    },
                }
                for tc in sorted(tool_calls_buf.values(), key=lambda x: x["name"])
            ]
            current_messages.append({
                "role":       "assistant",
                "content":    None,
                "tool_calls": assistant_tool_calls,
            })

            # Execute each tool and append results
            for tc in assistant_tool_calls:
                name  = tc["function"]["name"]
                try:
                    args = json.loads(tc["function"]["arguments"] or "{}")
                except json.JSONDecodeError:
                    args = {}

                yield _sse({"type": "tool_call", "tool": name, "args": args})

                raw_result  = execute_tool(name, args)
                result_data = json.loads(raw_result)

                yield _sse({"type": "tool_result", "tool": name, "result": result_data})

                current_messages.append({
                    "role":         "tool",
                    "tool_call_id": tc["id"],
                    "content":      raw_result,
                })

        except Exception as exc:
            yield _sse({"type": "error", "content": str(exc)})
            yield _sse({"type": "done"})
            return

    # Safety: max turns exceeded
    yield _sse({"type": "error", "content": "Agent reached maximum turn limit."})
    yield _sse({"type": "done"})


def _sse(payload: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(payload)}\n\n"
