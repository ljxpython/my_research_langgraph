# 平台化技术文档（LangGraph + AG-UI + FastAPI Gateway）

这份 `docs/` 面向“平台化落地”，而不是 demo 复刻。

核心原则：
- **Execution Plane（执行面）**：LangGraph 负责跑图、checkpoint、线程状态与事件流。
- **Control Plane（控制面）**：平台自建 Gateway（FastAPI）负责鉴权/租户/路由/配额/审计/观测，并对前端输出稳定协议。
- **前后端契约优先**：前端只依赖 **AG-UI** 事件协议，不直连 LangGraph。

## 文档导航

- `docs/standards.md`：规范与标准（文档入口、契约同步机制、变更规则）
- `docs/architecture.md`：总体架构与模块边界（建议评审入口）
- `docs/repo-layout.md`：代码仓库目录规划（前后端分离 + Execution/Control Plane）
- `docs/control-plane.md`：Control Plane 设计（通用测试平台：模块/数据模型/API/流程/演进）
- `docs/execution-plane.md`：Execution Plane 设计（LangGraph 编排与部署：langgraph.json、dev vs docker）
- `docs/execution-plane-roadmap.md`：Execution Plane 演进规划（Phase 1/2/3/4，长期扩展）
- `docs/execution-plane-b2-fallback.md`：备用方案：B2（自建执行面复刻 LangGraph API）的成本与改造清单（仅备忘，不是当前路线）
- `docs/api-contract.md`：Platform Gateway 对前端的 API 与事件流契约（AG-UI + SSE）
- `docs/frontend-contract.md`：前端对接契约 v1（必选事件集 + 可选强交互事件 + HITL + CUSTOM 规范）
- `docs/dev-workflow.md`：本地开发/联调工作流（LangGraph dev + FastAPI + UI）
- `docs/developer-experience.md`：Developer Experience / 双入口调试（agent-chat-ui 直连执行面 + 平台前端走 Control Plane）
- `docs/dev-commands.md`：启动脚本/命令约定（Graph 开发 vs 平台联调）
- `docs/frontend-plan.md`：前端 Phase-1 规划（页面/目录/AG-UI store）
- `docs/agui-workbench.md`：AG-UI Workbench 正式版设计（模块化 Tabs + 通用入口 + 映射与会话内核）
- `docs/agui-demo-ui.md`：通用 AG-UI Demo UI 方案（对标 agent-chat-ui / chat.langchain.com）
- `docs/integration-guardrails.md`：前后端对接保障（shared 的作用与不足、契约测试/Mock/CI 约束）
- `docs/security-and-secrets.md`：鉴权、密钥、审计与多租户隔离约定
- `docs/infra.md`：Infra（本地/测试环境：docker run 部署 Redis + Postgres 双 DB）
- `docs/reuse-auth-db.md`：鉴权与 DB 管理可复用方案（Phase-1 简化 login -> Phase-2 OIDC）

## 通用测试平台规划（优先）

先搭平台通用能力（项目/环境/运行/报告/审计/附件），暂不绑定具体测试类型：

- `docs/platform/README.md`：Platform 文档集入口
- `docs/platform/00-overview.md`：通用测试平台总纲（MVP：Dummy Runner 跑通平台链路）

## 契约资产（跨前后端共享）

`shared/` 用于存放“可复制的 JSON 示例 + 错误码表 + CUSTOM 事件注册表”，减少对接漂移：

- `shared/contracts/http/examples/run.request.json`
- `shared/contracts/http/examples/login.request.json`
- `shared/contracts/http/examples/login.response.json`
- `shared/contracts/http/examples/me.response.json`
- `shared/contracts/http/examples/busy.response.json`
- `shared/contracts/http/examples/snapshot.response.json`
- `shared/contracts/http/examples/cancel.response.json`
- `shared/contracts/http/examples/resume.request.json`
- `shared/contracts/http/examples/artifact.upload.response.json`
- `shared/contracts/http/examples/run.request.with_artifact.json`
- `shared/contracts/http/examples/snapshot.response.with_artifact.json`
- `shared/contracts/http/errors.md`
- `shared/contracts/agui/custom-events.md`
- `shared/contracts/frontend/mapping.md`

## 重要结论（先读这个）

- AG-UI 与 LangGraph SDK 是两套不同协议：不能指望“完美互换”。见 `docs/architecture.md` 的“AG-UI 与 LangGraph SDK 的兼容边界”。
- 想少造轮子：优先走“路线 A：LangGraph Agent Server + FastAPI Gateway 仅做治理/代理”。

快速选型（避免跑错链路）：
- 调 graph/agent：`agent-chat-ui` 直连 Execution Plane（LangGraph Agent Server API）
- 验收平台语义/对外契约：平台前端走 Control Plane（AG-UI v1）；Dojo/最小 client 可选用作联调参考对照（不作为验收标准）
细节见：`docs/developer-experience.md`、`docs/api-contract.md`。

## 已敲定的 Phase-1 策略

- 对外协议：只暴露 AG-UI v1
- 并发：同一 `thread_id` 只允许 1 个 active run（busy -> HTTP 409）
- 工具：Phase-1 以“后端工具执行”为主，前端工具先不做
- HITL：支持 interrupt/resume 完整闭环
- 断线：客户端断开不取消 run（server-side continue）
- Cancel：提供最小取消接口（释放 thread busy）
- 重连恢复：提供 `GET /v1/threads/{thread_id}/snapshot`（messages/state + busy/activeRunId）

## 现有参考实现（在本仓库内）

- LangGraph 执行面主干（Python）：`execution_plane/langgraph.json`
- LangGraph 原生 UI 参考：`examples/agent-chat-ui/src/providers/Stream.tsx`
- AG-UI 协议 + LangGraph 事件翻译（Python）：
  - SSE endpoint：`examples/ag-ui/integrations/langgraph/python/ag_ui_langgraph/endpoint.py`
  - 事件翻译核心：`examples/ag-ui/integrations/langgraph/python/ag_ui_langgraph/agent.py`
