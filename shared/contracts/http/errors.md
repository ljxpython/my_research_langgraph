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

## RATE_LIMITED (HTTP 429)（可选）

Phase-1 可不启用，但建议预留错误码。
