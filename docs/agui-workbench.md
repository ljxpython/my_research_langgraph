# AG-UI Workbench（正式版）设计：模块化 Tabs + 通用“智囊体”入口

本文目标：把 `examples/agui-chat-ui` 的能力“正式纳入”平台前端（`frontend/`，Ant Design Pro / Umi Max），并支持未来大量 agent/业务模块复用同一套对话内核。

范围说明：本文只做设计与契约冻结，不涉及实现细节与代码落地。

---

## 0. 结论先行（冻结点）

我们支持两种 UI 入口，但复用同一套 AG-UI 会话内核：

1) **模块页面（Tabs）**：一个页面包含多个分区（Tabs）。每个分区是一个“对话区域”，并且**绑定一个固定的 `agentId`**。分区切换不丢对话状态。

2) **通用入口（“智囊体”）**：用户在页面中输入 **Control Plane Base URL**，用**账号密码登录**，再输入/选择 `agentId`，即可对话。

并发/恢复策略冻结：
- 同一 `threadId` 同一时刻只允许 1 个 active run（busy -> 409）。
- 断线不取消 run（server-side continue）。
- 恢复靠 `GET /v1/threads/{threadId}/snapshot`。

线程归属冻结：
- Control Plane 的 thread **绑定 agentId**；同一个 thread 不能跨 agent 复用。

---

## 1. 术语（本设计统一用词）

- **Agent（agentId）**：一个智能体/graph 的逻辑入口。
- **Thread（threadId）**：一次对话会话。一个 agent 会有多个 thread。
- **Run（runId）**：一次执行（一次对话请求/一次恢复执行）。
- **Snapshot**：线程快照，用于刷新/断线恢复 UI，包含 messages/state/busy/activeRunId。

- **流程实例（flowInstanceId）**：在产品中更像“一个流程/一次上下文”，用户会与其对话沟通；它是一个“实例”，不是流程定义（definition）。
- **分区（sectionKey）**：模块页面的 Tab key，例如 `analysis` / `cases`。

---

## 2. 关键约束（基于现有实现，必须写进设计）

### 2.1 thread 绑定 agentId（不可跨 agent 复用）

在 Control Plane 当前实现中，`POST /v1/agents/{agentId}:run` 会校验 thread 的 agentId 与 path 的 agentId 一致。

结论：
- 模块页面的每个分区如果用不同 agent，则必须使用不同 thread。
- 不能“同一 thread 切 agent”。

### 2.2 当前 SSE 是“快照流”（snapshot-based），不是 token 增量流

Control Plane 的 run SSE 目前主要发送：
- `RUN_STARTED`
- `MESSAGES_SNAPSHOT`
- `STATE_SNAPSHOT`
- `RUN_FINISHED` / `RUN_ERROR`

因此 UI 体验策略应是：
- 展示 `Connecting/Waiting/Running`，并在 snapshot 到达时更新消息与状态。
- 不依赖 `TEXT_MESSAGE_*` 逐 token 打字。

备注：`docs/frontend-contract.md` 定义了更完整的事件集（包含 `TEXT_MESSAGE_*`）。本文视其为“未来可扩展”，但不作为当前前端体验的硬依赖。

---

## 3. 两种 UI 类型（用户故事）

### 3.1 类型 A：模块页面（Tabs，多分区对话）

典型页面：例如“AI 用例生成”。

信息架构（推荐）：
- 顶部：模块标题 + 简短说明
- 主体：`Tabs`（每个 Tab 一个分区）
- 每个 Tab：对话区域（Chat）+ 可选的产物/状态面板

分区配置（示例）：

| sectionKey | title | agentId |
|------------|-------|---------|
| analysis   | AI 分析 | usecase_analysis_agent |
| cases      | AI 用例 | usecase_cases_agent |

行为要求：
- 分区切换不丢聊天历史。
- 同一时刻只允许当前激活分区发起 run；切换分区时需中止/断开上一个分区的 SSE 连接（避免后台占用连��）。

### 3.2 类型 B：通用入口（输入 URL + 登录 + agentId 对话）

目标：作为“通用智囊体入口”，可以连接任意 Control Plane 实例（AG-UI v1），无需写死 baseURL。

Phase-1 冻结：
- 暂时仅支持**单个 baseURL**（不做多个连接配置的管理）。
- 认证方式：账号密码登录（`POST /v1/auth/login`），拿到 access_token 后按 baseURL 保存。

---

## 4. 类型 A 的 threadId 持久化（你选择的 B：后端映射）

动机：模块页面不适合把所有 threadId 都塞进 URL（分区多、信息噪音大），且需要跨刷新/跨再次进入稳定恢复。

映射键（冻结）：

```
(tenantId, flowInstanceId, sectionKey) -> { agentId, threadId }
```

### 4.1 Control Plane API（建议新增，契约级）

资源命名说明（冻结）：
- `flow` 预留给“流程定义”（未来可能存在）。
- 本设计讨论的是“流程实例”，因此统一使用 `flow-instances` 作为资源名。

1) 查询某个流程实例的全部分区映射

- `GET /v1/flow-instances/{flowInstanceId}/chat-threads`
- response：

```json
{
  "flowInstanceId": "flow_...",
  "threads": {
    "analysis": { "agentId": "usecase_analysis_agent", "threadId": "th_..." },
    "cases": { "agentId": "usecase_cases_agent", "threadId": "th_..." }
  }
}
```

2) 绑定/创建某个分区的 thread（幂等）

- `PUT /v1/flow-instances/{flowInstanceId}/chat-threads/{sectionKey}`
- request：

```json
{ "agentId": "usecase_analysis_agent" }
```

- response：

```json
{ "agentId": "usecase_analysis_agent", "threadId": "th_..." }
```

幂等语义（冻结）：
- 映射存在且 agentId 一致：返回既有 threadId。
- 映射不存在：创建 thread（`POST /v1/threads`）并写入映射。
- 映射存在但 agentId 不一致：返回 409（避免静默“换 agent”导致历史错配）。

### 4.2 数据模型建议（概念，不锁死实现）

表：`flow_chat_threads`

- `tenant_id`
- `flow_instance_id`
- `section_key`
- `agent_id`
- `thread_id`
- `created_by`
- `updated_at`

安全要求：
- 必须 tenant scoped。
- 必须防 IDOR（不同租户/用户不可读写别人的 flowInstanceId）。

---

## 5. 前端架构（为复用与稳定性服务）

### 5.1 会话内核：AguiSession（可实例化）

一个“对话区域”对应一个 AguiSession。

AguiSession 最小状态：
- `agentId`, `threadId`
- `busy`, `activeRunId`
- `messages[]`, `state`（顶层 `ui/app/debug`）
- `interrupt?`（CUSTOM interrupt）
- `streamConnecting`, `snapshotLoading`, `firstTokenReceived`（UX 友好字段）

AguiSession 最小行为：
- `loadSnapshot(threadId)`
- `ensureThread()`（必要时创建 thread）
- `sendUserMessage(text)` / `startRun(...)`
- `requestCancel()`
- `stopStream()`（切分区/卸载时必须调用）

说明：
- 当前 `frontend/src/models/agui.ts` 已经实现了这些能力的雏形，但它是 Umi model 单例。
- 为支持“模块 Tabs 多分区”，必须把能力下沉成“可创建的 session”，而不是继续依赖全局单例。

### 5.2 模块页面（Tabs）如何管理多个分区 session

模块页面维护：

```
sessionsBySectionKey: Record<sectionKey, AguiSession>
```

切换 Tab 规则：
- 不销毁 session（保留 messages/state）。
- 必须对非激活 Tab 的 session 调用 `stopStream()`（避免隐藏分区后台占用 SSE）。

### 5.3 通用入口：连接配置（Connection Profile）

通用入口需要“运行时 baseURL + token”，不能只依赖构建时环境变量。

Phase-1（冻结）：
- 仅支持一个 baseURL。
- token 保存策略：按 baseURL 保存（即使当前只支持一个，也保持结构正确）。

接口要求：
- 所有 Control Plane HTTP 请求与 SSE 连接，都必须显式使用当前 baseURL/token。

---

## 6. UI 组件与美化策略（你要求“别再丑”）

目标：避免“Card + List 拼出来的 demo 感”，做出 chat 产品感。

推荐两档选型：

### 方案 A（推荐）：引入 Ant Design X（@ant-design/x）

理由：这是 Ant Design 官方的 AI 交互组件库；`@ant-design/pro-chat` 已 deprecated，新项目推荐使用 `@ant-design/x`。

推荐组件：
- `Bubble.List`：聊天消息列表（气泡/角色样式/autoScroll/streaming 状态）
- `Sender`：输入框（更像 chat 产品；可扩展 header/actions）
- `Conversations`：会话/线程列表（非常适合通用入口）
- `Actions`：消息操作（copy/feedback 等）

文档：
- https://x.ant.design/

### 方案 B（不新增依赖）：仅用现有 antd + pro-components

可行但需要补样式：
- 外壳：`ProCard split`（参考 `frontend/src/pages/platform/runs/detail.tsx`）
- 分区：`Tabs`
- tool calls：`Collapse`
- thread history：`Drawer`

---

## 7. 错误与边界行为（前端必须处理）

- `409 THREAD_BUSY`：提示 activeRunId，并提供 Cancel / Refresh Snapshot。
- `404 EXECUTION_THREAD_NOT_FOUND`（dev 常见）：提示执行面已重启或 thread 不存在，并引导重新创建 thread。
- `401`：清 token 并要求重新登录（通用入口清理本地 token）。

---

## 8. 未决项（OPEN，但记录方向）

1) 是否需要在通用入口支持多个 baseURL/连接配置：Phase-1 明确不做。
2) 是否需要把 TEXT_MESSAGE_* 增量事件补齐：属于后端演进项；前端不依赖。
