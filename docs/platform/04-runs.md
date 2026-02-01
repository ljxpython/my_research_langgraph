# 运行模型（Runs / RunEvents）

本章定义平台运行生命周期、并发/幂等策略、以及运行过程的可观测事件（RunEvent）。

注意：本章讨论的是“平台 Runs（项目域跑批 / Dummy Runner）”，不讨论 AG-UI SSE 的 Agent Run（见 `docs/api-contract.md`）。

## 0) 已收敛决策（当前版本冻结）

- RunEvent 档位：B（生命周期 + 日志 + step + error + artifact）
- RunEvent 获取方式：轮询分页（cursor/limit），MVP 不引入流式推送
- 并发锁：按 Environment 锁（同一 environment 同时只允许 1 个 active run）
- busy 错误：HTTP 409 `ENVIRONMENT_BUSY`，details 包含 `environmentId` + `activeRunId`

## 1) MVP：Dummy Runner

Dummy Runner 的职责：

- 创建 Run 后将其推进到 running
- 追加 RunEvent（例如每秒写一条 log）
- 最终将 Run 标记为 succeeded 或 failed

说明：Dummy Runner 不是“测试类型”，只是用于跑通平台链路的执行器占位。

## 2) Run 状态机（建议）

- queued：已创建，等待执行
- running：执行中
- succeeded：成功结束
- failed：失败结束
- canceled：被取消（可区分 cancel_requested vs canceled）

## 3) 并发与幂等（MVP 必须明确）

- 幂等 key：同一业务意图重试不应创建多条 run（MVP 选择 `client_run_id`）
- 并发控制：
  - MVP：按 environment 限制并发（已收敛：environment lock）
  - 后续：引入队列与配额

### 3.1 Create Run 幂等（MVP：写死）

我们在 `POST /v1/projects/{project_id}/runs` 使用请求体字段 `client_run_id` 作为幂等键。

约定：

- `X-Request-Id` 仅用于日志/排障/审计关联（correlation），不承担幂等语义
- 幂等键为 `client_run_id`（客户端生成，重试必须复用）
- 作用域：`(project_id, client_run_id)` 唯一

为什么不使用 `X-Request-Id` 做幂等：

- `X-Request-Id` 的职责是“每一次 HTTP 请求”的关联；重试通常会产生新的 request id
- 幂等需要“同一次业务意图”的稳定键，应该由客户端显式提供并复用

请求体最小形态（讨论用）：

```json
{
  "client_run_id": "crun_01J...",
  "environment_id": "env_01J...",
  "runner": "dummy",
  "params": {}
}
```

响应语义（MVP）：

- 首次创建：`201 Created`
- 幂等重放（replay）：`200 OK`

边界条件（必须写死）：

1) retry after timeout：重试携带相同 client_run_id，必须返回同一个 run
2) 同 key 不同 body：返回 `409`，错误码建议 `IDEMPOTENCY_KEY_CONFLICT`
3) 与 ENVIRONMENT_BUSY 的交互：
   - 新建时环境被占用：返回 409 `ENVIRONMENT_BUSY`
   - 但若该 client_run_id 对应 run 已创建：必须返回 200/201（replay），不得返回 ENVIRONMENT_BUSY

### 3.2 client_run_id 约束（MVP：写死）

- 必填
- 推荐格式：ULID 或 UUID（任一即可）
- 仅允许 ASCII
- 最大长度：128
- 不允许包含敏感信息（例如用户名/邮箱/密钥/token 等）

### 3.3 幂等冲突错误（MVP：写死）

当 `client_run_id` 相同但请求体不同（例如 environment_id/runner/params 不同），必须返回 409。

错误码：`IDEMPOTENCY_KEY_CONFLICT`

建议错误响应示例（与平台统一 error body 对齐）：

```json
{
  "error": {
    "code": "IDEMPOTENCY_KEY_CONFLICT",
    "message": "client_run_id already used with a different request body",
    "requestId": "req_01J...",
    "details": {
      "projectId": "proj_01J...",
      "clientRunId": "crun_01J...",
      "existingRunId": "run_01J..."
    }
  }
}
```

## 4) RunEvent（append-only）

RunEvent 是“证据链”的一部分，用于解释一次 run 的运行过程：

- 不允许更新/删除（只追加）
- 同一 run 内必须可稳定排序（推荐 seq 单调递增）
- payload_json 可容纳：log/step/error/artifact（MVP 不做 metric）

### 4.1 事件类型（MVP=B）

- 生命周期：`run.queued` / `run.started` / `run.finished`
- 日志：`log.append`（level + message）
- 阶段：`step.started` / `step.finished`（step_name + status + duration）
- 错误：`error.raised`（error_code + message + 可选 stack/artifact 引用）
- 产物：`artifact.created`（artifact_id + kind + url/storage_key）

## 5) API 草案（讨论用）

- `POST /v1/projects/{project_id}/runs`
  - body：environment_id + runner=dummy + 参数（可为空）

- `GET /v1/projects/{project_id}/runs`（列表）
- `GET /v1/runs/{run_id}`（详情）
- `GET /v1/runs/{run_id}/events`（事件分页）
  - query：`cursor`（可选）、`limit`（可选）
  - 返回：events（按 seq 升序）、nextCursor、hasMore
- `POST /v1/runs/{run_id}:cancel`

### 5.1 RunEvent pagination（cursor 语义已收敛）

MVP 选择：`cursor` 为不透明字符串（opaque cursor）。客户端只负责“保存并回传”，不要解析其内容。

约定：

- 排序：事件按 `seq ASC` 返回；`seq` 在同一 run 内单调递增且稳定不变
- `cursor`：表示一个“位置 P”，接口返回所有 `event > P` 的事件（exclusive）
- `nextCursor`：指向本页最后一个事件的位置（若本页 events 为空，则 nextCursor 等于请求 cursor）
- `hasMore`：表示在 `nextCursor` 之后当前是否还有更多事件可读
  - 注意：`hasMore=false` 不代表 run 已结束，仅代表“已经读到当前末尾”

建议默认值：

- limit 默认 100，最大 1000

建议客户端轮询策略：

- run=running：每 2s 轮询一次（使用 nextCursor 续读）
- 若返回 429 `RATE_LIMITED`：必须遵守 `Retry-After` 并做退避（见 `docs/platform/10-quota-and-rate-limit.md`）
- run 已结束：停止轮询

建议响应结构（讨论用）：

```json
{
  "runId": "run_...",
  "events": [
    {
      "eventId": "revt_...",
      "seq": 1,
      "ts": 1738250000000,
      "type": "log.append",
      "payload": {}
    }
  ],
  "nextCursor": "opaque-string",
  "hasMore": false
}
```

客户端幂等建议：即使服务端保证 append-only，客户端仍应按 `eventId` 做去重（应对网络重试）。

### 5.1 错误码（并发锁）

- 当 environment 已有 active run：
  - HTTP 409
  - code：`ENVIRONMENT_BUSY`
  - details：`{ environmentId, activeRunId }`

建议错误响应示例（与平台统一 error body 对齐）：

```json
{
  "error": {
    "code": "ENVIRONMENT_BUSY",
    "message": "This environment already has an active run.",
    "requestId": "req_01J...",
    "details": {
      "environmentId": "env_01J...",
      "activeRunId": "run_01J..."
    }
  }
}
```

Phase B 兼容性说明（并发上限扩展到 N）：

- details 建议扩展为：`{ environmentId, activeRunIds, maxConcurrentRuns }`
- 为了兼容 Phase A/老客户端，仍可保留 `activeRunId`（取 activeRunIds[0]）

## 6) 说明（避免误解）

- retention：Phase A 已收敛为“按 run 级联清理”（见 `docs/platform/08-settings-and-retention.md`）。
- rate limit：`GET /v1/runs/{run_id}/events` 返回 429 时客户端必须退避（见 `docs/platform/10-quota-and-rate-limit.md`）。
