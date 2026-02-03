"""Quick manual check for thread memory semantics.

Usage:
  python execution_plane/scripts/verify_thread_memory.py

Requires a running Execution Plane (LangGraph server) at EP_URL.
This script creates a fresh thread, sends two messages, and asserts that
the second reply acknowledges earlier messages in the same thread.
"""

from __future__ import annotations

import os
import uuid

from langgraph_sdk import get_sync_client


def main() -> int:
    ep_url = os.getenv("EP_URL", "http://127.0.0.1:8123").strip()
    client = get_sync_client(url=ep_url)

    thread_id = str(uuid.uuid4())
    client.threads.create(
        thread_id=thread_id,
        graph_id="sql_agent",
        if_exists="do_nothing",
        metadata={"graph_id": "sql_agent"},
    )

    # Run 1
    for _ in client.runs.stream(
        thread_id,
        "sql_agent",
        input={"messages": [{"role": "user", "content": "nihao"}]},
        stream_mode=["events", "values", "updates"],
    ):
        pass

    # Run 2
    for _ in client.runs.stream(
        thread_id,
        "sql_agent",
        input={"messages": [{"role": "user", "content": "我们之前有过对话吗？"}]},
        stream_mode=["events", "values", "updates"],
    ):
        pass

    def _content_to_str(content) -> str:
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        # LangChain rich content: [{type:'text', text:'...'}, ...]
        if isinstance(content, list):
            parts: list[str] = []
            for p in content:
                if isinstance(p, dict):
                    t = p.get("text")
                    if isinstance(t, str):
                        parts.append(t)
            return "".join(parts)
        return str(content)

    def _extract_messages(snapshot: dict) -> list[dict]:
        values = snapshot.get("values")
        if isinstance(values, dict) and isinstance(values.get("messages"), list):
            return values.get("messages")
        if isinstance(values, list):
            return values
        return []

    # Fetch history and pick the snapshot with the richest messages.
    history = client.threads.get_history(thread_id, limit=50)
    best: list[dict] = []
    for hs in history or []:
        if hasattr(hs, "model_dump"):
            hs = hs.model_dump()  # type: ignore[attr-defined]
        if isinstance(hs, dict):
            msgs = _extract_messages(hs)
            if len(msgs) > len(best):
                best = msgs

    reply = ""
    # Find the last assistant/ai message.
    for m in reversed(best):
        if not isinstance(m, dict):
            continue
        role = str(m.get("type") or m.get("role") or "").lower().strip()
        if role in {"ai", "assistant"}:
            reply = _content_to_str(m.get("content")).strip()
            break
    print("thread_id:", thread_id)
    print("reply:", reply)

    # Minimal assertion: should not deny memory; should mention earlier message.
    if "nihao" not in reply.lower() and "你好" not in reply:
        raise SystemExit("Expected reply to reference earlier thread messages, but it did not.")
    if "没有记忆" in reply or "第一次" in reply:
        raise SystemExit("Expected reply to acknowledge thread history without generic no-memory disclaimer.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
