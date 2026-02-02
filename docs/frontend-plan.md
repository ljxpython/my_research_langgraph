# 前端 Phase-1 规划（AntD Pro 中台壳 + AG-UI Workbench）

目标：让平台“像一个中台测试平台”，并且与 Control Plane 契约严格对齐。

前提（已敲定）：
- 前端协议：只使用 AG-UI v1
- 鉴权：跨域 + Bearer token；Phase-1 简化 login，后续迁移 OIDC/SSO
- 关键平台语义：
  - 同一 thread 单 active run（busy -> 409 THREAD_BUSY）
  - 断线不取消 run（server-side continue）
  - cancel endpoint
  - snapshot endpoint（结构化 JSON：AG-UI messages + state + busy/activeRunId）
  - HITL interrupt/resume

---

## 1) Phase-1 必做页面/功能

建议四个模块：

1. 登录与会话
- Login 页面
- 对接：`POST /v1/auth/login`、`GET /v1/me`

2. Agent Registry
- Agents 列表（Phase-1 至少 read；CRUD 可后置）
- 对接：`GET /v1/agents`

3. Workbench（核心）
- Chat + Tool Trace + State Panel + Interrupt Modal
- 对接：
  - `POST /v1/agents/{agent_id}:run`（SSE）
  - `GET /v1/threads/{thread_id}/snapshot`
  - `POST /v1/threads/{thread_id}/runs/{run_id}:cancel`

4. Threads（排障入口）
- Thread 详情（snapshot）优先；列表可后置

---

## 补充：两种对话入口（模块化 Tabs vs 通用入口）

我们正式支持两种 UI 入口，但复用同一套 AG-UI 会话内核：

1) 模块页面（Tabs，多分区对话）
- 一个页面包含多个分区（Tabs），每个分区是一个“对话区域”。
- 每个分区绑定一个固定的 `agentId`。
- 分区的 `threadId` 不通过 URL 暴露，而是通过 Control Plane 的映射持久化与恢复：
  - `(flowInstanceId, sectionKey) -> (agentId, threadId)`

2) 通用入口（“智囊体”）
- 用户在页面输入 Control Plane Base URL，用账号密码登录，再输入/选择 `agentId` 即可对话。
- Phase-1：仅支持单个 baseURL（不做多连接配置管理）。

详细设计见：`docs/agui-workbench.md`。

---

## 2) 推荐目录结构（解耦页面与协议层）

```
frontend/
  src/
    services/controlPlane/       # HTTP client（Bearer、错误映射、requestId）
      auth.ts
      agents.ts
      threads.ts
      request.ts
    models/                      # Umi useModel
      auth.ts                    # token/me
      agui.ts                    # AG-UI event store
    components/agui/             # Workbench 组件
      ChatPane.tsx
      ToolTracePanel.tsx
      StatePanel.tsx
      InterruptModal.tsx
    pages/
      User/Login/
      Agents/
      Workbench/
      Threads/
```

原因：
- `models/agui.ts` 是唯一的事件归并入口（events -> messages/tools/state/interrupt/busy）。
- 页面只做组合与路由，不写协议细节。

补充：为支持“模块 Tabs 多分区对话”（同页多个对话区域），需要将当前 `models/agui.ts` 的能力下沉为“可实例化的 session”（每个分区一个 session），而不是继续只依赖 Umi model 的全局单例。

---

## 3) AG-UI event store（useModel）建议结构

建议 state 形状（与 `docs/frontend-contract.md` 对齐）：

- `threadId`
- `activeRunId`
- `busy`
- `messages[]`（AG-UI Message）
- `toolCalls[]`（由 TOOL_CALL_* 事件归并）
- `state`（任意 JSON，但顶层 namespace ui/app/debug）
- `interrupt`（当前 interrupt payload，驱动 InterruptModal）

关键 action：
- `run(agentId, input)`：启动 SSE run
- `cancel(threadId, runId)`：取消
- `loadSnapshot(threadId)`：刷新/断线恢复
- `applyEvent(event)`：唯一事件处理入口

---

## 4) 与 shared/ 的对齐（减少对接漂移）

前端开发时应直接对照 `shared/contracts/http/examples/`：
- login/me：`login.*.json`、`me.response.json`
- run/busy/snapshot/cancel/resume

并且以 `shared/contracts/http/errors.md` 为错误码总表。

对接映射表（接口/事件 -> store/UI）见：
- `shared/contracts/frontend/mapping.md`
