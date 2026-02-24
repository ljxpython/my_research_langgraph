from __future__ import annotations

import json
from typing import Any


def make_reasoning_summary(*, user_input: str, todos: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Generate a safe, non-CoT reasoning summary payload.

    注意：
    - 这里不做“真实推理”，只是将可公开的执行策略结构化，便于前端展示。
    - 不能泄露 system prompt、密钥、内部链路细节。
    """

    highlights: list[str] = []
    if todos:
        # Keep it concise.
        highlights.append(f"已生成 {len(todos)} 个步骤的计划，并会逐步推进")
    if user_input.strip():
        highlights.append("将先明确目标与约束，再调用工具执行")

    return {
        "summary": "我会先拆解任务并制定计划，然后按步骤执行并持续更新进度。",
        "highlights": highlights,
    }


def format_reasoning_summary_event(value: dict[str, Any]) -> dict[str, Any]:
    # Align with shared/contracts/agui/custom-events.md
    return {"type": "CUSTOM", "name": "reasoning_summary", "value": json.loads(json.dumps(value))}
