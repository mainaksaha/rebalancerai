"""
Core agentic loop for the rebalancer.
Streams SSE-formatted events to the caller as it runs:
  thinking_start / thinking / thinking_end
  text_start / text / text_end
  tool_call  (complete JSON)
  tool_result (complete JSON)
  done / error
"""

import json
from typing import AsyncGenerator, List, Dict, Any

import anthropic

from agent.tools import execute_tool, TOOLS
from core.rules import get_active_rules

_client = anthropic.AsyncAnthropic()

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

    current_messages = list(messages)
    max_turns        = 12

    for turn in range(max_turns):
        current_block_type: str | None = None

        async with _client.messages.stream(
            model="claude-opus-4-6",
            max_tokens=4096,
            thinking={"type": "adaptive"},
            system=system,
            tools=TOOLS,
            messages=current_messages,
        ) as stream:
            async for event in stream:
                # ── Block starts ──────────────────────────────────────────
                if event.type == "content_block_start":
                    current_block_type = event.content_block.type
                    if current_block_type == "thinking":
                        yield _sse({"type": "thinking_start"})
                    elif current_block_type == "text":
                        yield _sse({"type": "text_start"})
                    # tool_use blocks: no streaming, captured in final_message

                # ── Content deltas ────────────────────────────────────────
                elif event.type == "content_block_delta":
                    dt = event.delta.type
                    if dt == "thinking_delta":
                        yield _sse({"type": "thinking", "content": event.delta.thinking})
                    elif dt == "text_delta":
                        yield _sse({"type": "text", "content": event.delta.text})
                    # input_json_delta (tool args) — skip streaming

                # ── Block ends ────────────────────────────────────────────
                elif event.type == "content_block_stop":
                    if current_block_type == "thinking":
                        yield _sse({"type": "thinking_end"})
                    elif current_block_type == "text":
                        yield _sse({"type": "text_end"})

            final_message = await stream.get_final_message()

        # ── Done (no more tool calls) ─────────────────────────────────────
        if final_message.stop_reason == "end_turn":
            yield _sse({"type": "done"})
            return

        # ── Tool use ──────────────────────────────────────────────────────
        if final_message.stop_reason != "tool_use":
            yield _sse({"type": "done"})
            return

        current_messages.append({"role": "assistant", "content": final_message.content})

        tool_results = []
        for block in final_message.content:
            if block.type != "tool_use":
                continue

            # Tell the frontend what tool is being called
            yield _sse({
                "type": "tool_call",
                "tool": block.name,
                "args": block.input,
            })

            # Execute the tool
            raw_result  = execute_tool(block.name, block.input)
            result_data = json.loads(raw_result)

            # Send result to frontend
            yield _sse({
                "type":   "tool_result",
                "tool":   block.name,
                "result": result_data,
            })

            tool_results.append({
                "type":        "tool_result",
                "tool_use_id": block.id,
                "content":     raw_result,
            })

        current_messages.append({"role": "user", "content": tool_results})

    # Safety: max turns exceeded
    yield _sse({"type": "error", "content": "Agent reached maximum turn limit."})
    yield _sse({"type": "done"})


def _sse(payload: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(payload)}\n\n"
