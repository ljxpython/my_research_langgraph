"""LangGraph Agent Server adapter.

This module isolates:
- How we talk to the LangGraph Agent Server (langgraph-sdk)
- How we normalize LangGraph/LangChain internals into our AG-UI-facing contract
"""

from __future__ import annotations

import json
from typing import Any, cast

from collections.abc import Mapping

from langgraph_sdk import get_sync_client

from gateway.settings import settings


def get_client(*, execution_target_id: str | None = None):
    """Return a LangGraph client for an execution target.

    Phase-1: single target via LANGGRAPH_API_URL.
    """

    _ = execution_target_id  # reserved for future routing table
    return get_sync_client(url=settings.langgraph_api_url)


def fetch_thread_state(*, thread_id: str, execution_target_id: str | None = None) -> dict[str, Any]:
    client = get_client(execution_target_id=execution_target_id)
    state = getattr(client.threads, "get_state")(thread_id=thread_id)
    if isinstance(state, Mapping) and not isinstance(state, dict):
        state = dict(state)
    if not isinstance(state, dict):
        raise TypeError(f"unexpected thread state type: {type(state)!r}")
    return cast(dict[str, Any], state)


def fetch_thread_history(
    *,
    thread_id: str,
    limit: int = 50,
    execution_target_id: str | None = None,
) -> list[dict[str, Any]]:
    """Fetch thread state history from the Execution Plane.

    Note: Some graph/agent shapes don't expose full messages via `get_state()`.
    `get_history()` provides more robust access to message history.
    """

    client = get_client(execution_target_id=execution_target_id)
    history = getattr(client.threads, "get_history")(thread_id=thread_id, limit=limit)
    out: list[dict[str, Any]] = []
    for s in history or []:
        if isinstance(s, Mapping) and not isinstance(s, dict):
            s = dict(s)
        elif not isinstance(s, dict) and hasattr(s, "model_dump"):
            s = s.model_dump()  # type: ignore[attr-defined]
        if isinstance(s, dict):
            out.append(cast(dict[str, Any], s))
    return out


def search_threads(
    *,
    metadata: dict[str, Any],
    limit: int = 50,
    execution_target_id: str | None = None,
) -> list[dict[str, Any]]:
    """Search threads in the Execution Plane.

    We keep this adapter tiny and return plain dicts to make callers independent
    of langgraph-sdk model types.
    """

    client = get_client(execution_target_id=execution_target_id)
    threads = getattr(client.threads, "search")(metadata=metadata, limit=limit)
    out: list[dict[str, Any]] = []
    for t in threads or []:
        if isinstance(t, Mapping) and not isinstance(t, dict):
            t = dict(t)
        elif not isinstance(t, dict) and hasattr(t, "model_dump"):
            t = t.model_dump()  # type: ignore[attr-defined]
        if isinstance(t, dict):
            out.append(cast(dict[str, Any], t))
    return out


def ensure_thread_exists(
    *,
    thread_id: str,
    graph_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    execution_target_id: str | None = None,
) -> None:
    """Create the thread in the Execution Plane if it doesn't exist.

    We keep Control Plane `threads.thread_id` identical to Execution Plane thread_id
    in Phase-1 to avoid carrying a separate mapping column.

    `if_exists='do_nothing'` makes this call idempotent.
    """

    client = get_client(execution_target_id=execution_target_id)
    client.threads.create(
        thread_id=thread_id,
        metadata=metadata or {},
        graph_id=graph_id,
        if_exists="do_nothing",
    )


def stream_run(
    *,
    thread_id: str,
    graph_id: str,
    input: dict[str, Any],
    command: Any,
    context: Any,
    metadata: Any,
    stream_mode: Any = None,
    execution_target_id: str | None = None,
    on_run_created=None,
):
    client = get_client(execution_target_id=execution_target_id)
    stream_fn = getattr(client.runs, "stream")
    return stream_fn(
        thread_id,
        graph_id,
        input=input,
        command=cast(Any, command),
        context=cast(Any, context),
        metadata=cast(Any, metadata),
        # Phase-1 default was effectively stream_mode='values'.
        # To support real-time text streaming we must request 'events' as well.
        stream_mode=cast(
            Any,
            stream_mode
            if stream_mode is not None
            else ["events", "values", "updates"],
        ),
        on_disconnect="continue",
        on_run_created=on_run_created,
    )


def get_run(*, thread_id: str, execution_run_id: str, execution_target_id: str | None = None) -> dict[str, Any]:
    client = get_client(execution_target_id=execution_target_id)
    run = getattr(client.runs, "get")(thread_id=thread_id, run_id=execution_run_id)
    if isinstance(run, Mapping) and not isinstance(run, dict):
        run = dict(run)
    if not isinstance(run, dict):
        raise TypeError(f"unexpected run type: {type(run)!r}")
    return cast(dict[str, Any], run)


def cancel_run(*, thread_id: str, execution_run_id: str, execution_target_id: str | None = None) -> None:
    client = get_client(execution_target_id=execution_target_id)
    client.runs.cancel(thread_id=thread_id, run_id=execution_run_id, wait=False, action="interrupt")


def normalize_snapshot(*, langgraph_state: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Normalize LangGraph thread state into (messages, state).

    Contract: docs/api-contract.md#2.5.2
    - messages: AG-UI Message[] (at least id/role/content)
    - state: dict with top-level namespaces ui/app/debug, and MUST NOT include messages
    """

    values = langgraph_state.get("values")

    # LangGraph thread state has historically been either:
    # - values: { messages: [...] , ui/app/debug: {...} }
    # - values: [ ...messages... ]  (some agent/graph shapes emit message list as the whole values)
    raw_messages: list[Any]
    values_dict: dict[str, Any] | None = None
    if isinstance(values, dict):
        values_dict = values
        maybe_messages = values_dict.get("messages")
        raw_messages = maybe_messages if isinstance(maybe_messages, list) else []
    elif isinstance(values, list):
        raw_messages = values
    else:
        raw_messages = []

    messages = _normalize_messages(raw_messages)

    # Build namespaced state; prefer values.ui/app/debug if present.
    state: dict[str, Any] = {"ui": {}, "app": {}, "debug": {}}
    if values_dict is not None:
        for ns in ("ui", "app", "debug"):
            v = values_dict.get(ns)
            if isinstance(v, dict):
                state[ns] = v

    # Include raw LangGraph metadata (without messages) under debug.langgraph for troubleshooting.
    if values_dict is not None:
        sanitized_values: Any = dict(values_dict)
        sanitized_values.pop("messages", None)
    else:
        sanitized_values = values

    state["debug"].setdefault(
        "langgraph",
        {
            "values": sanitized_values,
            "next": langgraph_state.get("next"),
            "checkpoint": langgraph_state.get("checkpoint"),
            "metadata": langgraph_state.get("metadata"),
        },
    )

    return messages, state


def _normalize_messages(raw_messages: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, m in enumerate(raw_messages):
        msg = _normalize_single_message(m, i=i)
        if msg is not None:
            out.append(msg)
    return out


def _normalize_single_message(m: Any, *, i: int) -> dict[str, Any] | None:
    if isinstance(m, dict):
        role = m.get("role")
        if isinstance(role, str) and "content" in m:
            # Assume already close to AG-UI.
            msg_id = m.get("id") if isinstance(m.get("id"), str) else f"m_{i}"
            content = _normalize_content(m.get("content"))
            out: dict[str, Any] = {"id": msg_id, "role": role, "content": content}
            if isinstance(m.get("toolCalls"), list):
                out["toolCalls"] = m["toolCalls"]
            if isinstance(m.get("toolCallId"), str):
                out["toolCallId"] = m["toolCallId"]
            return out

        # LangChain-style serialized messages often use `type`.
        msg_type = m.get("type")
        if isinstance(msg_type, str):
            role = _map_type_to_role(msg_type)
        else:
            role = "assistant"

        msg_id = m.get("id") if isinstance(m.get("id"), str) else f"m_{i}"
        content = _normalize_content(m.get("content"))

        out = {"id": msg_id, "role": role, "content": content}

        tool_call_id = m.get("tool_call_id") or m.get("toolCallId")
        if isinstance(tool_call_id, str):
            out["toolCallId"] = tool_call_id

        tool_calls = (
            m.get("tool_calls")
            or (m.get("additional_kwargs") or {}).get("tool_calls")
            or m.get("toolCalls")
        )
        if isinstance(tool_calls, list):
            normalized = _normalize_tool_calls(tool_calls)
            if normalized:
                out["toolCalls"] = normalized

        return out

    # Unknown message shape; skip.
    return None


def _normalize_tool_calls(tool_calls: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, tc in enumerate(tool_calls):
        if not isinstance(tc, dict):
            continue
        tc_id = tc.get("id") if isinstance(tc.get("id"), str) else f"call_{i}"

        name = tc.get("name") or tc.get("tool_name") or (tc.get("function") or {}).get("name")
        if not isinstance(name, str):
            continue

        args = tc.get("args")
        if args is None:
            args = tc.get("arguments")
        if isinstance(args, dict):
            args_str = json.dumps(args, ensure_ascii=True, separators=(",", ":"))
        elif isinstance(args, str):
            args_str = args
        else:
            args_str = "{}"

        out.append(
            {
                "id": tc_id,
                "type": "function",
                "function": {"name": name, "arguments": args_str},
            }
        )
    return out


def _map_type_to_role(msg_type: str) -> str:
    t = msg_type.lower()
    if t in {"human", "user"}:
        return "user"
    if t in {"ai", "assistant"}:
        return "assistant"
    if t == "tool":
        return "tool"
    if t == "system":
        return "system"
    return "assistant"


def _normalize_content(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        # Try to concat text blocks; ignore non-text blocks (images/files).
        parts: list[str] = []
        for b in content:
            if isinstance(b, str):
                parts.append(b)
            elif isinstance(b, dict):
                if b.get("type") == "text" and isinstance(b.get("text"), str):
                    parts.append(b["text"])
        return "".join(parts)
    return str(content)
