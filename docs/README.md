# 平台化技术文档（LangGraph + AG-UI + FastAPI Gateway）

这份 `docs/` 面向“平台化落地”，而不是 demo 复刻。

核心原则：
- **Execution Plane（执行面）**：LangGraph 负责跑图、checkpoint、线程状态与事件流。
- **Control Plane（控制面）**：平台自建 Gateway（FastAPI）负责鉴权/租户/路由/配额/审计/观测，并对前端输出稳定协议。
- **前后端契约优先**：前端只依赖 **AG-UI** 事件协议，不直连 LangGraph。

## 文档导航

- `docs/architecture.md`：总体架构与模块边界（建议评审入口）
- `docs/control-plane.md`：Control Plane 设计（通用测试平台：模块/数据模型/API/流程/演进）
- `docs/api-contract.md`：Platform Gateway 对前端的 API 与事件流契约（AG-UI + SSE）
- `docs/frontend-contract.md`：前端对接契约 v1（必选事件集 + 可选强交互事件 + HITL + CUSTOM 规范）
- `docs/dev-workflow.md`：本地开发/联调工作流（LangGraph dev + FastAPI + UI）
- `docs/security-and-secrets.md`：鉴权、密钥、审计与多租户隔离约定

## 契约资产（跨前后端共享）

`shared/` 用于存放“可复制的 JSON 示例 + 错误码表 + CUSTOM 事件注册表”，减少对接漂移：

- `shared/contracts/http/examples/run.request.json`
- `shared/contracts/http/examples/busy.response.json`
- `shared/contracts/http/examples/snapshot.response.json`
- `shared/contracts/http/examples/cancel.response.json`
- `shared/contracts/http/examples/resume.request.json`
- `shared/contracts/http/errors.md`
- `shared/contracts/agui/custom-events.md`

## 重要结论（先读这个）

- AG-UI 与 LangGraph SDK 是两套不同协议：不能指望“完美互换”。见 `docs/architecture.md` 的“AG-UI 与 LangGraph SDK 的兼容边界”。
- 想少造轮子：优先走“路线 A：LangGraph Agent Server + FastAPI Gateway 仅做治理/代理”。

## 已敲定的 Phase-1 策略

- 对外协议：只暴露 AG-UI v1
- 并发：同一 `thread_id` 只允许 1 个 active run（busy -> HTTP 409）
- 工具：Phase-1 以“后端工具执行”为主，前端工具先不做
- HITL：支持 interrupt/resume 完整闭环
- 断线：客户端断开不取消 run（server-side continue）
- Cancel：提供最小取消接口（释放 thread busy）
- 重连恢复：提供 `GET /v1/threads/{thread_id}/snapshot`（messages/state + busy/activeRunId）

## 现有参考实现（在本仓库内）

- LangGraph 执行面 demo（Python）：`examples/docker_single/langgraph.json`
- LangGraph 原生 UI 参考：`examples/agent-chat-ui/src/providers/Stream.tsx`
- AG-UI 协议 + LangGraph 事件翻译（Python）：
  - SSE endpoint：`examples/ag-ui/integrations/langgraph/python/ag_ui_langgraph/endpoint.py`
  - 事件翻译核心：`examples/ag-ui/integrations/langgraph/python/ag_ui_langgraph/agent.py`
