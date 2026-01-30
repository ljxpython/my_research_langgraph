"""AG-UI 最小教学 Demo（LangGraph + FastAPI + SSE）

这个 demo 的目标是“可读、可跑、可观察”。

- 不接真实 LLM，避免 API Key 干扰学习
- 通过 LangGraph 的 `on_custom_event` 触发 AG-UI 的 TEXT_MESSAGE/STATE 事件
- 使用内存 checkpointer（进程重启会丢），仅用于学习
"""

from __future__ import annotations

import os
import uuid
from typing import Any, Optional

# ==================== 本仓库 vendored 依赖引入 ====================
# teach demo 直接复用 `examples/ag-ui/` 里的 Python SDK 与 LangGraph 集成实现，
# 避免额外 pip 安装 ag-ui/ag-ui-langgraph。
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
VENDORED_AGUI_PY = REPO_ROOT / "examples" / "ag-ui" / "sdks" / "python"
VENDORED_AGUI_LANGGRAPH_PY = (
    REPO_ROOT / "examples" / "ag-ui" / "integrations" / "langgraph" / "python"
)

sys.path.insert(0, str(VENDORED_AGUI_PY))
sys.path.insert(0, str(VENDORED_AGUI_LANGGRAPH_PY))

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, MessagesState, StateGraph

from ag_ui.core.types import RunAgentInput
from ag_ui.encoder import EventEncoder
from ag_ui_langgraph import LangGraphAgent


class DemoState(MessagesState):
    """Demo graph state.

    MessagesState already defines `messages`. We add a tiny counter to show state snapshots.
    """

    counter: int


async def respond_node(state, config: RunnableConfig):
    """Echo node.

    Emits AG-UI events via custom events:
    - manually_emit_message -> TEXT_MESSAGE_* sequence
    - manually_emit_state   -> STATE_SNAPSHOT
    """

    messages = list(state.get("messages") or [])
    last_user_text = getattr(messages[-1], "content", "") if messages else ""

    counter = int(state.get("counter") or 0) + 1
    reply = f"[demo reply #{counter}] echo: {last_user_text}"
    message_id = str(uuid.uuid4())

    # Emit a streamed assistant message without invoking an LLM.
    await adispatch_custom_event(
        "manually_emit_message",
        {"message_id": message_id, "message": reply},
        config=config,
    )

    # Persist it into LangGraph state so that message history snapshots include it.
    messages.append(AIMessage(id=message_id, content=reply))

    # Emit a state snapshot mid-run (useful to see state syncing).
    await adispatch_custom_event(
        "manually_emit_state",
        {"counter": counter, "last_user_text": last_user_text},
        config=config,
    )

    return {"messages": messages, "counter": counter}


def build_graph():
    workflow = StateGraph(DemoState)
    workflow.add_node("respond", respond_node)
    workflow.add_edge(START, "respond")
    workflow.add_edge("respond", END)
    return workflow.compile(checkpointer=MemorySaver())


GRAPH = build_graph()
AGENT = LangGraphAgent(
    name="agui_min_demo",
    description="Minimal AG-UI server demo (LangGraph + FastAPI)",
    graph=GRAPH,
)

app = FastAPI(title="AG-UI Minimal Demo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:9999",
        "http://127.0.0.1:9999",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.post("/agent")
async def agent_endpoint(request: Request):
    """AG-UI SSE endpoint.

    We fill thread_id/run_id if caller didn't provide them.
    This keeps the demo robust across different clients.
    """

    accept_header = request.headers.get("accept")
    encoder = EventEncoder(accept=accept_header)

    payload = await request.json()
    if not isinstance(payload, dict):
        payload = {}

    if "thread_id" not in payload and "threadId" not in payload:
        payload["thread_id"] = f"t-{uuid.uuid4()}"
    if "run_id" not in payload and "runId" not in payload:
        payload["run_id"] = f"r-{uuid.uuid4()}"
    payload.setdefault("state", payload.get("state") or {})
    payload.setdefault("tools", payload.get("tools") or [])
    payload.setdefault("context", payload.get("context") or [])
    if "forwarded_props" not in payload and "forwardedProps" not in payload:
        payload["forwarded_props"] = {}

    input_data = RunAgentInput.model_validate(payload)

    async def event_generator():
        async for event in AGENT.run(input_data):
            yield encoder.encode(event)

    return StreamingResponse(event_generator(), media_type=encoder.get_content_type())


@app.post("/")
async def agent_root(request: Request):
    return await agent_endpoint(request)


def main():
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
