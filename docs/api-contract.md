# Platform Gateway API 契约（AG-UI + SSE）

本文档描述：前端（Web/桌面/IDE）如何与 Platform Gateway 通信。

设计目标：
- 对前端：稳定、可扩展、事件驱动（AG-UI）
- 对后端：允许替换执行引擎（LangGraph 先行），Gateway 只做适配

## 1. 认证与租户

建议：
- 前端请求携带 `Authorization: Bearer <platform_token>`
- Gateway 在服务端决定 tenant/project，并做授权校验

跨域（CORS）说明：
- 前后端跨域时，Gateway 需要开启 CORS allowlist，并允许 `Authorization` 头。
- 建议前端在每次请求带上 `X-Request-Id`（用于审计与排障）。

备注：
- 不建议让前端持有 LangGraph / LangSmith 的服务端密钥

## 0. 协议兼容性说明（避免走弯路）

本文件定义的是 **AG-UI 协议**下的 Gateway 对外契约。

- 如果你们前端打算使用 `@langchain/langgraph-sdk`（LangGraph SDK），那么 Gateway 对外必须是 **LangGraph Agent Server 的 API 形态**（/info、threads、runs、stream...），通常做透明代理/反向代理即可。
- 如果你们前端打算使用 AG-UI（例如 CopilotKit/Dojo 那类强交互 UI），那么前端应消费本文件定义的 SSE 事件流。

原则：对前端暴露的协议二选一，避免在同一条链路里同时引入两套协议。

## 2. 核心端点（建议最小集合）

### 2.0 鉴权端点（Phase-1：简化 login，后续可迁移到 OIDC）

说明：
- Phase-1 你们选择“简化 login”，用于内部测试平台快速落地。
- Phase-2 迁移到企业 OIDC/SSO 时，业务 API 调用方式保持不变（仍然是 Bearer token）。

#### 2.0.1 登录

- `POST /v1/auth/login`
  - 请求体：JSON（用户名/密码）
  - 响应：JSON（access_token）

示例：见 `shared/contracts/http/examples/login.request.json` 与 `shared/contracts/http/examples/login.response.json`。

#### 2.0.2 当前用户

- `GET /v1/me`
  - 请求头：`Authorization: Bearer <token>`
  - 响应：JSON（user/tenant/scopes）

示例：见 `shared/contracts/http/examples/me.response.json`。

### 2.1 健康检查

- `GET /healthz`
  - 200: `{"status":"ok"}`

### 2.2 运行 Agent（流式）

- `POST /v1/agents/{agent_id}:run`
  - 请求体：AG-UI `RunAgentInput` 兼容结构（最小字段见下）
  - 响应：SSE 事件流（Content-Type 由 accept 协商）

并发策略（Phase-1，已敲定）：
- 同一 `thread_id` 只允许 1 个 active run
- 若 thread 正在运行，返回 `HTTP 409 Conflict`（JSON error body，不走 SSE）

断线语义（Phase-1，已敲定）：
- SSE 连接断开不会自动取消后端 run（server-side continue）
- run 结束前该 thread 仍会返回 `THREAD_BUSY`

本仓库内 SSE 参考实现：`examples/ag-ui/integrations/langgraph/python/ag_ui_langgraph/endpoint.py`

#### 2.2.1 RunAgentInput（最小字段建议）

最小可用：
- `messages`: 用户输入消息列表（role/content）
- `thread_id`（可选）：不传则由 Gateway 创建，并在事件里回传
- `run_id`（可选）：不传则由 Gateway 创建

ID 约定（Phase-1，已敲定）：
- `thread_id` / `run_id` 使用 ULID 字符串（建议带资源前缀，如 `th_01J...`、`run_01J...`）。

强交互场景建议支持：
- `state`：前端侧状态（例如 UI 表单、选择项），用于进入图状态
- `tools`：前端工具定义（AG-UI tool 机制）
- `context`：前端上下文块（可用于 UI 选择/页面态）
- `forwarded_props.command.resume`：用于中断后的恢复输入（HITL）

注意：以上字段名/语义以 AG-UI 为准；Gateway 只做透传与必要转换。

工具策略（Phase-1，已敲定）：
- 以“后端工具执行”为主，前端工具先不做。
- Gateway 不应信任前端传入的 `tools` 去注入可后端执行的敏感能力（建议忽略或白名单）。

#### 2.2.2 响应事件（高频）

AG-UI 事件的重点类别：
- Run 生命周期：`RUN_STARTED` / `RUN_FINISHED` / `RUN_ERROR`
- 消息流：`TEXT_MESSAGE_START` / `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END`
- 工具：`TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END` / `TOOL_CALL_RESULT`
- 状态：`STATE_SNAPSHOT` / `STATE_DELTA`（JSON Patch）
- 步骤：`STEP_STARTED` / `STEP_FINISHED`
- 中断：`CUSTOM` 事件（例如 LangGraph interrupt 映射）

本仓库内事件翻译核心参考：`examples/ag-ui/integrations/langgraph/python/ag_ui_langgraph/agent.py`

## 3. 中断/审批（HITL）建议模式

### 3.1 中断事件

当 LangGraph 产生 interrupt 时，Gateway 应将其映射为可识别的 AG-UI `CUSTOM` 事件，并包含：
- interrupt 类型/内容（可脱敏）
- 需要用户提供的 resume 输入 schema（如果有）

参考：`examples/ag-ui/integrations/langgraph/python/ag_ui_langgraph/agent.py` 中对 `OnInterrupt` 的处理。

### 3.2 恢复执行

前端再次调用 `POST /v1/agents/{agent_id}:run`，并传入：
- 同一个 `thread_id`
- `forwarded_props.command.resume`（或你们平台定义的等价字段）

## 2.3 错误语义（建议）

### 2.3.1 Thread busy

- `HTTP 409 Conflict`

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

其他通用错误码与结构见：
- `shared/contracts/http/errors.md`

### 2.3.2 Run cancelled

建议错误码（如以 `RUN_ERROR` 事件表达）��

- `code: RUN_CANCELLED`

## 2.4 取消 Run（Phase-1 建议提供）

### 2.4.1 取消指定 run

- `POST /v1/threads/{thread_id}/runs/{run_id}:cancel`
  - 响应：`200` 或 `202`

建议响应体：

```json
{
  "ok": true,
  "threadId": "t-...",
  "runId": "r-...",
  "status": "cancel_requested"
}
```

语义：
- best-effort：平台尽力停止执行并清理 busy 状态
- 若 run 已结束，返回 200 且 status 为 `already_finished` 也可（幂等）

## 2.5 获取 Thread 快照（断线重连/刷新恢复 UI）

背景：Phase-1 已敲定“断线不取消 run（server-side continue）”，因此前端刷新/重连需要一种不触发新 run 的方式来恢复 UI。

### 2.5.1 获取指定 thread 的当前快照

- `GET /v1/threads/{thread_id}/snapshot`

数据来源（实现建议，省事路线）：
- Platform Gateway 不保存执行面 thread 状态。
- Gateway 通过 LangGraph server 拉取：
  - `threads.getState(thread_id)`：拿到当前 state（通常包含 messages）
  - （可选）`threads.getHistory(thread_id, ...)`：需要 time-travel/回放时拉历史

响应建议：

```json
{
  "threadId": "t-...",
  "busy": true,
  "activeRunId": "r-...",
  "updatedAt": 0,
  "agentId": "agent-...",
  "graphId": "graph-...",
  "messages": [
    {"id":"m-...","role":"user","content":"..."},
    {"id":"m-...","role":"assistant","content":"..."}
  ],
  "state": {
    "...": "..."
  }
}
```

字段语义：
- `busy` / `activeRunId`：来自 Platform Gateway 的并发控制层（同 thread 单 active run）。
  - Phase-1 单实例可用内存态维护
  - 后续多实例需要分布式锁/共享存储以保证一致性

- `messages`：结构化消息列表，**格式以 AG-UI Message 为准**（role/content/toolCalls/toolCallId 等）。
  - 这是平台对外“只 AG-UI”的关键约束：前端不需要理解 LangGraph/LangChain 的内部消息结构。

- `state`：结构化业务状态对象。
  - 约定：`state` 不重复包含 `messages`（避免两份真相）。
  - `state` 允许任意 JSON（便于快速迭代），但必须遵守“顶层命名空间”规则，避免字段冲突。
    - 推荐：`ui.*`（UI 状态）、`app.*`（业务状态）、`debug.*`（调试信息）
    - 禁止占用：`messages`、`threadId`、`runId`、`busy`、`activeRunId`

- `updatedAt`：快照更新时间（Unix ms）。
  - 用于前端缓存/刷新判断（可选但推荐）。

- `agentId` / `graphId`：可选元数据。
  - 用途：排障与审计（例如同一个 thread 可能映射到不同 graph 版本）。

错误语义建议：
- 404：thread 不存在或已被清理
- 403：thread 不属于当前用户/租户（必须防 IDOR）

兼容性规则：
- 响应字段只增不删；前端必须忽略未知字段
- `messages/state` 的 schema 变更必须通过 `/v2/...` 版本升级完成

### 2.5.2 messages 结构化转换规则（Phase-1 明确）

目标：Control Plane 输出 `messages: AG-UI Message[]`，让前端不依赖 LangGraph/LangChain 内部 message 结构。

最低保证（Phase-1 必须做到）：
- `id`: string
- `role`: `user` / `assistant` / `tool`（至少覆盖这三类）
- `content`: string（Phase-1 优先保证文本可用）

工具调用（tool calls）：
- assistant message 可以包含 `toolCalls[]`
- tool message 应包含 `toolCallId` 与 `content`（用于关联到对应工具调用）

多段内���（例如 list of blocks / rich content）：
- Phase-1 统一降级为字符串：
  - 优先拼接文本块
  - 非文本块（例如 image block）不进 `messages.content`，改用附件（artifacts）机制

图片/文件：
- Phase-1 不把二进制放进 `messages`（不 base64）。
- 使用 artifacts + `RunAgentInput.context` 引用附件（见 2.6）。
- snapshot 中如需展示附件，应返回 metadata（artifactId/name/mimeType/previewUrl），不返回二进制。

示例：
- 纯文本 snapshot：`shared/contracts/http/examples/snapshot.response.json`
- 带附件 snapshot：`shared/contracts/http/examples/snapshot.response.with_artifact.json`

## 2.6 Artifacts（附件/文件）上传与引用（Phase-1 规范）

目标：支持前端传入图片/文件，但不把二进制塞进 `messages`。

核心原则：
- `messages` 只承载文本/结构化信息，不承载二进制
- 附件通过 artifact 引用传递（artifactId + metadata + 可控下载地址）

### 2.6.1 上传附件

- `POST /v1/artifacts`
  - 请求：`multipart/form-data`
  - 响应：JSON（artifact 元数据 + downloadUrl/previewUrl）

示例：见 `shared/contracts/http/examples/artifact.upload.response.json`。

### 2.6.2 在 run 中引用附件（已敲定：放在 context）

约定：
- 前端在 `RunAgentInput.context` 里追加一条 `artifact` 记录
- `messages.content` 里用自然语言说明“请分析附件/图片”即可

示例：见 `shared/contracts/http/examples/run.request.with_artifact.json`。

### 2.6.3 安全注意（必须写死）

- 禁止前端传任意外部 URL 让执行面去下载（SSRF 风险）。
- downloadUrl/previewUrl 应来自你们受控的存储域名（或签名 URL）。
- snapshot 返回附件时，返回 metadata 与 URL，不返回 base64。

## 4. 平台自定义事件（推荐预留）

建议预留 `CUSTOM` 事件用于平台能力：
- 配额不足（rate limit / quota）
- 权限不足（RBAC）
- 成本与计费信息（token/cost）
- 追踪信息（trace_id）

原则：
- 平台自定义事件不应破坏 AG-UI 的标准事件语义

另见：
- `docs/frontend-contract.md`：包含更完整的“必选事件集/可选事件集/HITL/CUSTOM 命名规范/兼容性规则”。
