"""真实调用版：LangGraph + FastAPI + AG-UI（SQL agent）。

启动后提供：
- GET  /healthz
- POST /agent  (AG-UI SSE)

说明：
- 这个 server 只用于学习 AG-UI 的事件流与基本对接方式。
- 默认读取 `examples/docker_single/.env` 里的 `ZHIPUAI_API_KEY`。
"""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

# ==================== 本仓库 vendored 依赖引入 ====================
REPO_ROOT = Path(__file__).resolve().parents[3]
VENDORED_AGUI_PY = REPO_ROOT / "examples" / "ag-ui" / "sdks" / "python"
VENDORED_AGUI_LANGGRAPH_PY = (
    REPO_ROOT / "examples" / "ag-ui" / "integrations" / "langgraph" / "python"
)

sys.path.insert(0, str(VENDORED_AGUI_PY))
sys.path.insert(0, str(VENDORED_AGUI_LANGGRAPH_PY))

from ag_ui.core.types import RunAgentInput  # type: ignore  # noqa: E402
from ag_ui.encoder import EventEncoder  # type: ignore  # noqa: E402
from ag_ui_langgraph import LangGraphAgent  # type: ignore  # noqa: E402

from sql_agent_graph import build_sql_agent_graph  # noqa: E402


def _default_env_file() -> Path:
    return REPO_ROOT / "examples" / "docker_single" / ".env"


ENV_FILE = Path(os.getenv("ENV_FILE", str(_default_env_file())))


GRAPH = build_sql_agent_graph(env_file=ENV_FILE if ENV_FILE.exists() else None)
AGENT = LangGraphAgent(
    name="sql_agent_demo",
    description="SQL agent demo: LangGraph + FastAPI + AG-UI",
    graph=GRAPH,
)

app = FastAPI(title="AG-UI SQL Agent Demo")

# Allow the official AG-UI Dojo (Next.js) running on a different origin to connect directly.
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


WEB_DIR = Path(__file__).resolve().parent / "web"


@app.get("/healthz")
def healthz():
    return {"ok": True, "env_file": str(ENV_FILE), "env_file_exists": ENV_FILE.exists()}


@app.get("/")
def index():
    """Minimal browser UI.

    This is intentionally plain HTML/JS so the teaching demo has zero frontend tooling.
    """

    return FileResponse(WEB_DIR / "index.html")


@app.post("/agent")
async def agent_endpoint(request: Request):
    accept_header = request.headers.get("accept")
    encoder = EventEncoder(accept=accept_header)

    payload = await request.json()
    if not isinstance(payload, dict):
        payload = {}

    # The vendored AG-UI Python SDK model has required fields. For teaching,
    # we accept a minimal payload and fill defaults here.
    # Accept both snake_case and camelCase (Dojo uses camelCase from @ag-ui/core).
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
    """Alias endpoint for clients that POST to the root URL.

    The official Dojo and many AG-UI examples default to posting to `/`.
    """

    return await agent_endpoint(request)


def main():
    # Avoid conflicting with Control Plane default port (8000).
    port = int(os.getenv("PORT", "9100"))
    # For reload during development, prefer:
    #   uvicorn teach/agui/demo_sql_agent/server.py:app --reload
    # (or run from this directory with a module path that exists)
    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
