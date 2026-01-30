# 06 - 最小 Demo：LangGraph + FastAPI + AG-UI（一个可跑的 AG-UI Server）

目标：做一个“最小可用、可观察”的 AG-UI Server，用于学习：

- FastAPI 如何返回 SSE（Server-Sent Events）
- AG-UI 事件序列长什么样（RUN_STARTED / TEXT_MESSAGE_* / STATE_SNAPSHOT / RUN_FINISHED）
- LangGraph 如何在不接入真实 LLM 的情况下，通过 `on_custom_event` 产生可被 AG-UI 翻译的事件

这个 demo **仅用于学习**：
- 持久化使用内存 checkpointer（进程重启会丢）
- 不做鉴权/租户/审计
- 不建议直接当生产架构

## 目录

代码在：

- `teach/agui/demo_min_server/server.py`
- `teach/agui/demo_min_server/requirements.txt`

## 1. 安装依赖（建议用虚拟环境）

在仓库根目录执行：

```bash
python -m venv .venv
source .venv/bin/activate

pip install -r teach/agui/demo_min_server/requirements.txt
```

说明：
- 本仓库 `pyproject.toml` 已包含 `langgraph`/`langchain`。
- 这个 demo 需要额外安装 `fastapi`/`uvicorn` 等 web 依赖。
- AG-UI Python SDK 与 `ag_ui_langgraph` 集成代码直接复用本仓库 `examples/ag-ui/` 下的 vendored 源码，不通过 pip 安装。

## 2. 启动服务

```bash
python teach/agui/demo_min_server/server.py
```

默认监听：`http://127.0.0.1:8000`

健康检查：

```bash
curl -s http://127.0.0.1:8000/healthz
```

## 3. 触发一次 run（用 curl 观察 SSE）

AG-UI server 的典型调用是 `POST` 并返回 SSE。

为了让学习更顺滑，本 demo 的 `/agent` 允许你只传 `messages`。
（`thread_id/run_id/state/tools/context/forwarded_props` 会在服务端补默认值；你也可以显式传入。）

```bash
curl -N \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{
    "messages": [
      {"id":"m-user-1","role":"user","content":"hello ag-ui"}
    ]
  }' \
  http://127.0.0.1:8000/agent
```

你应该能看到类似的事件流（不同版本字段可能略有差异）：

- `RUN_STARTED`
- `STEP_STARTED`（LangGraph node 作为 step）
- `TEXT_MESSAGE_START` / `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END`
- `STATE_SNAPSHOT`（包含 counter/last_user_text 等）
- `MESSAGES_SNAPSHOT`（消息历史）
- `RUN_FINISHED`

## 4. 这个 demo 如何做到“不用 LLM 也能有流式消息”？

关键点：

- LangGraph 节点里使用 `langchain_core.callbacks.manager.adispatch_custom_event(...)` 发出 `on_custom_event`
- `ag_ui_langgraph.LangGraphAgent` 会把特定的自定义事件名翻译成 AG-UI 事件：
  - `manually_emit_message` -> `TEXT_MESSAGE_*`
  - `manually_emit_state` -> `STATE_SNAPSHOT`

你可以对照看：
- Demo 节点代码：`teach/agui/demo_min_server/server.py`
- 翻译逻辑：`examples/ag-ui/integrations/langgraph/python/ag_ui_langgraph/agent.py`（`OnCustomEvent` 分支）

## 5. 下一步（学习路线）

1) 在 `respond_node` 里把返回的 state 变得更丰富，观察 `STATE_SNAPSHOT` 如何变化。
2) 把 `manually_emit_message` 改成真实 LLM streaming（后续再引入 `ChatOpenAI(...).ainvoke(..., config)`）。
3) 加一个简单的 interrupt/resume（用于理解 HITL），再观察事件序列与 thread checkpoint 的关系。
