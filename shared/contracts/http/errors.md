# HTTP 错误码与语义（Phase-1）

本文档汇总 Control Plane 对外暴露的错误码（HTTP JSON error body）。

统一响应结构：

```json
{
  "error": {
    "code": "...",
    "message": "...",
    "requestId": "req-...",
    "details": {}
  }
}
```

说明：
- `requestId` 推荐由客户端通过 `X-Request-Id` 传入，或由服务端生成并回传。
- `details` 用于附加机器可读信息（例如 `threadId`、`activeRunId`）。

## THREAD_BUSY (HTTP 409)

触发：同一 `threadId` 已存在 active run（已敲定：同 thread 单 active run）。

建议 `details`：
- `threadId`
- `activeRunId`

示例：见 `shared/contracts/http/examples/busy.response.json`

## UNAUTHORIZED (HTTP 401)

触发：缺少/无效 Bearer token。

## FORBIDDEN (HTTP 403)

触发：资源不属于当前 tenant/user（防 IDOR），或权限不足。

## NOT_FOUND (HTTP 404)

触发：thread/agent 不存在或不可见。

## ENVIRONMENT_BUSY (HTTP 409)

触发：平台 Runs（项目域跑批）中，同一 environment 已存在 active run。

建议 `details`：
- `environmentId`
- `activeRunId`

## IDEMPOTENCY_KEY_CONFLICT (HTTP 409)

触发：同一 `(project_id, client_run_id)` 被复用，但请求体不同。

建议 `details`：
- `projectId`
- `clientRunId`
- `existingRunId`

## RATE_LIMITED (HTTP 429)（可选）

Phase-1 可不启用，但建议预留错误码。

触发：请求过于频繁，触发平台限流策略。

要求：
- HTTP 429
- `code=RATE_LIMITED`
- 建议返回 `Retry-After: <seconds>`，便于客户端退避

建议 `details`：
- `bucket`：命中的限流桶（例如 `user.poll`）
- `scope`：限流作用域（例如 `tenant+subject`）
- `tenantId` / `projectId`（若可得）
- `retryAfterSeconds`

## QUOTA_EXCEEDED (HTTP 429)（预留）

触发：资源配额不足（例如每日 runs 上限、存储上限）。

要求：
- HTTP 429
- `code=QUOTA_EXCEEDED`
- 若有明确 reset 时间，建议返回 `Retry-After`

建议 `details`：
- `quota`：配额名（例如 `runs_created_per_day`）
- `scope`：作用域（tenant/project）
- `tenantId` / `projectId`
- `limit` / `used`
- `resetAt`（epoch ms）
