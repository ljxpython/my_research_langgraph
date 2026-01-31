# 前后端对接映射表（Phase-1）

目标：明确“前端拿到后端哪些接口/事件后要做什么映射”，并作为变更感知的依据。

适用范围：
- 平台前端（Ant Design Pro 中台）
- Control Plane（FastAPI Gateway）
- 对外协议：AG-UI v1（SSE）

说明：
- SSE 的 run 入口主要通过 `@ag-ui/client` 消费事件流；该表定义事件到前端 store/UI 的映射规则。
- 非 SSE 接口（login/me/snapshot/cancel/agents）用普通 HTTP client 调用。

关键参考：
- `docs/frontend-plan.md`
- `docs/api-contract.md`
- `shared/contracts/http/errors.md`

---

## 1) HTTP 接口 -> 前端行为

ID 约定（Phase-1）：
- `threadId`/`runId` 推荐使用 ULID 字符串（建议带资源前缀：`th_01J...`、`run_01J...`）。

| 后端接口 | 返回/错误 | 前端 store 更新 | UI 行为/提示 |
|---|---|---|---|
| `POST /v1/auth/login` | `access_token` | `auth.token = token` | 登录成功跳转；失败提示错误 |
| `GET /v1/me` | user/tenant/scopes | `auth.me = resp` | 用于导航/权限与排障展示 |
| `GET /v1/agents` | agents[] | `agents.list = resp` | Agents 页渲染 ProTable |
| `GET /v1/threads/{thread_id}/snapshot` | messages/state/busy/activeRunId | `agui.threadId = threadId`；`agui.busy/activeRunId`；`agui.messages = messages`；`agui.state = state` | 刷新/断线恢复；busy 时显示运行中 + 展示 Cancel |
| `GET /v1/threads/{thread_id}/snapshot`（含附件） | state.ui.attachments[] | `agui.state.ui.attachments = attachments` | Workbench 左侧/右侧展示附件列表与 preview |
| `POST /v1/threads/{thread_id}/runs/{run_id}:cancel` | ok/status | `agui.busy = false`（最终以 snapshot/后续事件为准） | 显示“已请求取消”；必要时自动 reload snapshot |
| `POST /v1/artifacts` | artifactId + urls | `ui.attachments[]` 追加（前端本地） | Workbench 显示附件列表/预览；run 时放入 context |

错误处理（统一）：

| HTTP 状态码 | error.code | 前端行为 |
|---|---|---|
| 401 | `UNAUTHORIZED` | 清理 token，跳转登录 |
| 403 | `FORBIDDEN` | Toast 提示“无权限”；可记录 requestId |
| 404 | `NOT_FOUND` | Toast 提示“资源不存在或不可见” |
| 409 | `THREAD_BUSY` | 将 busy=true；展示 activeRunId；提供 Cancel |

---

## 2) SSE（AG-UI）事件 -> 前端 store/UI 行为

前端 store（建议）：`models/agui.ts`（Umi useModel）

| AG-UI 事件 type | 关键字段 | store 更新 | UI 行为/说明 |
|---|---|---|---|
| `RUN_STARTED` | threadId/runId | `busy=true`；`threadId=...`；`activeRunId=runId` | 禁用发送按钮；显示 running |
| `RUN_FINISHED` | runId | `busy=false`；`activeRunId=null` | 解除禁用；可触发 snapshot（可选） |
| `RUN_ERROR` | code/message | `busy=false`（若可确定结束） | Toast 错误；保留 requestId/traceId（若有） |
| `TEXT_MESSAGE_START` | messageId | append assistant message placeholder | chat 区出现新 assistant 消息 |
| `TEXT_MESSAGE_CONTENT` | delta | append delta 到对应 messageId | 流式输出 |
| `TEXT_MESSAGE_END` | messageId | mark message done | 结束流式 |
| `TOOL_CALL_START` | toolCallId/toolCallName | upsert toolCall(status=running) | tool 面板显示“开始调用” |
| `TOOL_CALL_ARGS` | toolCallId/delta | append args delta | 展示工具参数（可折叠/脱敏） |
| `TOOL_CALL_RESULT` | toolCallId/content | set result | 展示结果摘要 |
| `TOOL_CALL_END` | toolCallId | status=finished | 展示耗时/完成 |
| `STATE_SNAPSHOT` | snapshot | replace/merge state | state 面板更新（遵守 ui/app/debug） |
| `STATE_DELTA` | patch | apply JSON patch | 需要实现 patch（Phase-1 可先只支持 SNAPSHOT） |
| `STEP_STARTED/FINISHED` | stepName | steps[] 追加/更新 | 用于节点轨迹展示（可选） |
| `CUSTOM` | name/payload | if name==interrupt -> set interrupt | 弹出 InterruptModal，收集输入 |

interrupt/resume（已敲定）：
- 收到 `CUSTOM name=interrupt`：打开弹窗，按 payload.schema 渲染表单
- 用户提交：发起新的 run（同 thread_id），并在 `forwarded_props.command.resume` 写入 resume payload
  - 示例：`shared/contracts/http/examples/resume.request.json`

---

## 3) 变更感知规则（必须执行）

当后端变更以下任意一项时，必须同步更新本文件：
- 新增/重命名 error.code（例如新增 QUOTA_EXCEEDED）
- 修改 snapshot 响应字段（结构化 JSON）
- 修改 interrupt payload 结构
- 修改 busy/取消语义（409/cancel 返回）

建议配套：
- CI 检查：改动 `docs/api-contract.md` 或 `shared/contracts/http/examples/*` 时，如果不改 `shared/contracts/frontend/mapping.md`，则提醒/拒绝合并。
