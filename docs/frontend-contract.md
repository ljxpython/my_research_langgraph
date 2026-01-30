# 前端对接契约 v1（AG-UI + SSE）

目标：让“前端技术栈任意”成为可能。

前提：前端可以任意（React/Vue/Next/Flutter/Electron/IDE 插件等），但必须遵守一套稳定的对接契约。
这份文档定义了平台对外暴露的 **AG-UI v1 协议最小集合**，以及强交互能力的扩展约定。

适用链路：

前端（任意） -> AG-UI（事件协议） -> Platform Gateway（FastAPI） -> LangGraph（执行面）

## 1. 传输与接口

### 1.1 运行 Agent（流式）

- Method: `POST`
- Path: `POST /v1/agents/{agent_id}:run`
- Response: `text/event-stream`（SSE）

说明：
- 如果你们当前 demo 使用 `/agent`，也可以，但建议在平台化阶段尽快切到版本化路径 `/v1/...`。

### 1.2 Headers

请求必须包含：

- `Content-Type: application/json`
- `Accept: text/event-stream`

认证（按平台实际情况二选一或同时支持）：

- `Authorization: Bearer <platform_token>`
- Cookie（同域情况下）

## 2. 请求体：RunAgentInput（最小字段）

为了保证“不同前端都能快速接入”，平台 v1 要求最小输入如下：

- `messages`: `[{ id, role, content }]`
- `thread_id`（可选）：不传由服务端生成，并在事件里回传
- `run_id`（可选）：不传由服务端生成，并在事件里回传

建议字段（强交互/工作台 UI 会用到）：

- `state`: object（用于 UI 状态进入图状态，或侧边栏/面板状态）
- `tools`: array（前端工具定义/渲染工具/前端执行工具）
- `context`: array（前端上下文块）
- `forwarded_props`: object（用于 interrupt/resume、平台自定义控制命令）

兼容性建议：
- 输入字段同时支持 `snake_case` 与 `camelCase`（例如 `thread_id`/`threadId`），减少 Dojo/TS SDK 对接摩擦。

## 3. 响应：SSE 事件流（最小必选事件集）

前端必须能消费 SSE，并正确解析每一条事件的 `data: {json}\n\n`。

v1 规定的最小事件集合（MVP = 可流式聊天）：

- `RUN_STARTED`
  - 必含：`threadId`、`runId`
- `TEXT_MESSAGE_START`
  - 必含：`messageId`
- `TEXT_MESSAGE_CONTENT`
  - 必含：`delta`（增量文本）
- `TEXT_MESSAGE_END`
- `RUN_FINISHED`
- `RUN_ERROR`
  - 建议包含：`message`、`code`、`traceId`

前端渲染建议（最小闭环）：

- 收到 `TEXT_MESSAGE_START`：创建一条 assistant 消息占位（messageId 作为 key）
- 收到 `TEXT_MESSAGE_CONTENT`：将 `delta` 追加到这条消息末尾
- 收到 `TEXT_MESSAGE_END`：标记该消息结束
- 收到 `RUN_FINISHED`：结束本次 run，允许发起下一次 run
- 收到 `RUN_ERROR`：展示错误并结束本次 run

## 4. 可选事件集（强交互能力）

以下事件不是 v1 的必选项，但强烈建议平台支持，以便 UI 做到“平台化工作台”。

### 4.1 工具调用（可观测/可渲染）

- `TOOL_CALL_START`
- `TOOL_CALL_ARGS`
- `TOOL_CALL_END`
- `TOOL_CALL_RESULT`

建议 UI 能展示：工具名、参数（脱敏）、耗时、结果摘要。

### 4.2 步骤/节点可视化

- `STEP_STARTED`
- `STEP_FINISHED`

建议 UI 能展示：当前节点、耗时、是否成功。

### 4.3 状态同步（强烈建议）

- `STATE_SNAPSHOT`：完整状态
- `STATE_DELTA`：JSON Patch（RFC 6902）

约定：
- UI 必须能容忍状态事件频率变化（网络抖动、后端节流）
- UI 必须忽略未知字段，避免协议升级导致前端崩

### 4.4 消息历史快照

- `MESSAGES_SNAPSHOT`

适用：断线重连、回放、刷新页面后恢复 UI。

## 5. HITL（中断/审批）规范：使用 CUSTOM 事件

为了让不同前端实现方式统一，平台推荐将中断事件标准化为 `CUSTOM`。

### 5.1 中断事件

- `type`: `CUSTOM`
- `name`: `interrupt`
- `payload`（建议字段）：
  - `interruptId`: string（可用于恢复执行的标识）
  - `title`: string
  - `description`: string
  - `schema`: object（JSON Schema，前端据���渲染输入表单）
  - `resumeHint`: object（告诉前端恢复执行需要传哪些字段）

### 5.2 恢复执行（resume）

恢复执行仍然走 `POST /v1/agents/{agent_id}:run`：

- 传入同一个 `thread_id`
- 在 `forwarded_props` 里携带 resume payload（字段名必须冻结）：

示例：

```json
{
  "thread_id": "t-xxx",
  "messages": [{"id":"m-user-2","role":"user","content":"approve"}],
  "forwarded_props": {
    "command": {
      "resume": {
        "interruptId": "i-xxx",
        "input": {"approved": true}
      }
    }
  }
}
```

## 6. 平台自定义事件（CUSTOM 命名规范）

原则：平台能力要扩展，但不能破坏标准事件。

建议命名：

- `type: CUSTOM`
- `name: platform.<domain>.<action>`

示例：

- `platform.auth.denied`
- `platform.quota.exceeded`
- `platform.rate_limited`
- `platform.billing.usage`

## 7. 兼容性与演进规则（让多前端不痛苦）

为了保证“前端任意”不会变成灾难，平台必须遵守：

- 事件 `type` 不随意改名
- 已发布字段不删除/不改语义（只增不删）
- 前端必须忽略未知事件/未知字段（forward compatible）
- `CUSTOM` 事件命名空间一旦发布，不随意重命名

## 8. 前端实现建议

### 8.1 最小实现

- `fetch` + `ReadableStream` 手写 SSE parser

适用：快速验证协议、做最小 demo。

### 8.2 推荐实现

- 使用 AG-UI 官方 JS/TS SDK：`@ag-ui/client` 的 `HttpAgent`

适用：生产级前端，减少协议解析、状态管理与事件流处理的重复劳动。

## 9. 已敲定的平台策略（Phase-1）

你们已经确定的关键策略（写死，避免反复讨论）：

### 9.1 并发策略：同一 thread 只允许 1 个 active run

- 定义：同一个 `thread_id` 上，同一时刻最多只能有一个尚未结束的 run。
- 行为：当一个请求到达时，如果该 `thread_id` 已存在 active run，则 **拒绝新请求**。

推荐实现：

- 返回 `HTTP 409 Conflict`
- 响应体为 JSON（而不是 SSE），例如：

```json
{
  "error": {
    "code": "THREAD_BUSY",
    "message": "This thread already has an active run.",
    "threadId": "t-...",
    "activeRunId": "r-..."
  }
}
```

前端建议：
- 在 run 期间禁用发送按钮或提示“正在运行”；提供 Cancel（未来可加）。

备注：
- 这个策略能显著降低状态竞态、工具重入、HITL 恢复歧义。

### 9.2 工具策略：Phase-1 以“后端工具执行”为主，前端工具先不做

- 定义：Phase-1 工具（SQL/检索/HTTP/内部服务等）全部由后端执行面/图运行时执行。
- 前端职责：展示工具调用过程（`TOOL_CALL_*`），不参与执行。

安全约束（必须写进实现）：
- 不允许前端通过 `RunAgentInput.tools` 注入“可后端执行”的高危工具。
- 后端可对 `tools` 字段采取以下策略之一：
  - 直接忽略前端传入的 `tools`，由服务端按权限/上下文生成可用工具列表（推荐）；
  - 或只允许严格白名单的“前端渲染工具/展示工具”（不触发后端敏感操作）。

### 9.3 HITL：interrupt/resume 完整闭环

- 中断事件：平台输出 `CUSTOM name=interrupt`（或兼容 `on_interrupt` 并在网关层做归一化）。
- 恢复执行：前端通过同一个 `thread_id` 再次调用 run，并在 `forwarded_props.command.resume` 里携带恢复输入。

### 9.4 断线语义：客户端断开不取消 run（server-side continue）

- 定义：SSE 连接断开（页面刷新、网络抖动）不会自动取消后端 run。
- 影响：同一个 `thread_id` 仍处于 busy 状态，直到该 run 自然结束或被显式取消。

前端建议：
- 断线重连后，UI 应优先通过“获取快照”恢复状态：
  - `GET /v1/threads/{thread_id}/snapshot`
    - 用 `messages/state` 恢复 UI
    - 用 `busy/activeRunId` 决定是否显示“正在运行/可取消”
- 可选：重新发起一次 run 前，平台先发送 `MESSAGES_SNAPSHOT` / `STATE_SNAPSHOT`（作为补充，而不是唯一恢复方式）

快照数据约定（Phase-1，已敲定）：
- `messages` 的格式以 AG-UI Message 为准（结构化 JSON），前端无需理解 LangGraph/LangChain 内部消息结构。
- `state` 为结构化业务状态对象，且不重复包含 `messages`（避免两份真相）。
- 建议快照包含 `updatedAt`，用于前端缓存/刷新判断。

state 命名空间约定（Phase-1，已敲定）：
- `state` 允许任意 JSON（便于快速迭代），但必须遵守“顶层命名空间”规则，避免字段冲突。
- 推荐顶层命名空间：
  - `ui`: 纯 UI 展示/交互状态（选中项、面板折叠、草稿输入、局部进度等）
  - `app`: 业务/领域状态（工作流进度、任务列表、结构化产物等）
  - `debug`: 调试信息（仅开发/内部环境，可被网关过滤）

保留字段（顶层禁止占用）：
- `messages`（messages 独立返回，不放进 state）
- `threadId` / `runId` / `busy` / `activeRunId`（属于协议/运行时元数据）

### 9.5 Cancel：Phase-1 提供显式取消接口

- 定义：前端可以显式请求取消一个 active run，释放该 `thread_id` 的 busy 锁。
- 语义：取消是“尽力而为”的（best-effort），但平台要保证取消后 busy 状态最终被清理。
