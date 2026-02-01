# 配额与限流（Quota & Rate Limit）

本章定义平台在“治理/稳定性”维度的两类约束：

- Rate limit（限流）：控制单位时间请求速率，保护控制面稳定。
- Quota（配额）：控制单位周期的资源预算（例如每日 runs 上限、存储上限）。

本章与以下章节强相关：

- `docs/platform/04-runs.md`：RunEvent 轮询频率与 429 行为
- `docs/platform/08-settings-and-retention.md`：settings 分层（tenant 默认 -> project 覆盖）
- `docs/platform/07-audit.md`：限流/配额触发时的审计口径（避免雪崩）

## 0) 已收敛决策（当前版本冻结）

- Phase A：启用 **Rate limit**（限流）作为控制面护栏；不启用“按天/按月”硬配额（Quota），但预留模型与错误码。
- Rate limit 错误：HTTP 429 `RATE_LIMITED`。
  - 必须返回 `Retry-After` 响应头（秒）。
  - JSON error body 必须符合统一结构（见 `shared/contracts/http/errors.md`）。
- Quota 错误：HTTP 429 `QUOTA_EXCEEDED`（Phase A 只预留，Phase B 才启用）。
- 配置分层：tenant 默认 -> project 覆盖；environment 不参与（避免碎片化）。
- 不为“每一次 429”写 AuditEvent（避免审计放大与雪崩）；只做 metrics + 结构化日志。必要时写“聚合审计”。

## 1) 目标与非目标

目标：

- 防止单个用户/脚本/前端 bug 把 Control Plane 打挂。
- 保持错误语义稳定（429 + 统一 error body），前端可以做一致的退避与提示。
- 让配额/限流可配置、可观测、可演进，但不让设置变碎片。

非目标（Phase A）：

- 不做计费系统。
- 不做复杂的“按用户/项目动态自动调参”。
- 不做全量细粒度的 Quota 结算（Phase B 才做）。

## 1.1 部署形态假设（实现必须遵守）

当前阶段允许单机部署，但后续会演进为多副本。

因此：

- Rate limit 的计数存储不能只依赖进程内内存；多副本需要共享存储（推荐 Redis）。
- 单机 dev 环境可以用 in-memory 作为 fallback，但必须明确标注“仅 dev”。
- 并发锁（environment lock / thread busy）的实现必须依赖共享状态（DB 或 Redis），不能用本地锁。

## 2) 概念：Rate limit vs Quota vs Safety limits

为了避免把不同问题混在一起，我们区分 3 类约束：

1) Rate limit（限流，HTTP 429 RATE_LIMITED）
- 面向“请求速率”，典型是每分钟/每秒多少次。
- 主要保护控制面：DB/Redis/CPU/线程池。

2) Quota（配额，HTTP 429 QUOTA_EXCEEDED）
- 面向“资源预算”，典型是每日 runs、每月存储字节数。
- 主要用于组织级治理（可能和计费/合规相关）。

3) Safety limits（安全阈值，Phase A 推荐写死）
- 面向“单次请求/单次 run 的异常体量”，避免无界数据。
- 例如：RunEvent 单条 payload 最大字节数、单个 Artifact 最大 size。

本章聚焦 1) 与 2)。3) 只给出建议，不作为核心接口契约。

## 3) Phase A：Rate limit（限流）策略

### 3.1 限流作用域（key 选择）

Phase A 选择“可解释、可落地”的 key：

- 基础维度：`tenant_id` + `subject`（用户或执行器身份）
- 可选维度：`project_id`（对 project scoped 的接口更公平）

说明：

- 不使用 IP 作为主 key（中台场景 NAT/代理会导致误伤）。
- Runner（执行器）与 User（人）必须分桶，否则 runner 写 events 可能被前端读流量挤占。

### 3.2 分桶（bucket）与默认阈值（推荐）

Phase A 采用“按接口类型分桶”的做法，避免每个 endpoint 单独配置导致碎片化。

建议分桶：

- `user.write`：写操作（create/update/delete/trigger/cancel）
- `user.read`：读操作（list/get）
- `user.poll`：高频轮询读（RunEvent 轮询）
- `runner.ingest`：执行器写入（append RunEvent / 更新状态 / 写 artifact 元数据）

建议默认值（tenant 默认，可被 project 覆盖；单位：requests/minute）：

```
bucket          default_rpm    note
user.write      120           约等于 2 req/s，足够 UI 操作
user.read       1200          列表/详情查询
user.poll       60            允许 2s 轮询（30/min）+ 余量
runner.ingest   6000          Dummy Runner 每秒写 log 也足够
```

补充约束（为了避免“轮询打爆”）：

- `GET /v1/runs/{run_id}/events` 客户端建议 2s 轮询一次（见 `docs/platform/04-runs.md`）。
- 如果用户打开多个 Run detail 页面，前端必须对同一 run 的轮询去重（一个 tab/页面持有一个 poller）。

### 3.3 HTTP 429 语义（RATE_LIMITED）

当触发限流时：

- HTTP status：`429`
- error code：`RATE_LIMITED`
- 必须返回：`Retry-After: <seconds>`
- 建议返回：`X-RateLimit-*`（可选；实现阶段再定是否支持）

建议 error body（与 `shared/contracts/http/errors.md` 对齐）：

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests.",
    "requestId": "req_01J...",
    "details": {
      "bucket": "user.poll",
      "scope": "tenant+subject",
      "tenantId": "ten_01J...",
      "projectId": "proj_01J...",
      "retryAfterSeconds": 2
    }
  }
}
```

### 3.4 客户端退避（UI/SDK 行为写死）

为避免前端/SDK 各写各的，给出固定建议：

- 对写请求：
  - 429 后提示“请求过于频繁，请稍后重试”，允许用户手动重试。
  - 如果是幂等写（例如 Create Run 携带 `client_run_id`），可以做一次自动重试，但必须遵守 `Retry-After`。

- 对轮询（`GET /runs/{run_id}/events`）：
  - 正常：2s 间隔（带 0-200ms jitter）。
  - 429：以 `Retry-After` 为下限做指数退避（2s, 4s, 8s...），最大间隔 15s。
  - 恢复：连续 N 次成功（建议 N=3）后逐步回到 2s。

### 3.5 观测与审计（避免放大效应）

限流本身是系统治理行为，不应被审计系统“放大”成雪崩。

Phase A 建议：

- metrics（必须）：
  - `rate_limited_total{bucket,tenant_id,project_id,subject_type}`
  - `requests_total{bucket,...}`
- structured log（必须）：
  - fields：`requestId, tenantId, projectId, subjectId, subjectType, bucket, retryAfterSeconds`
- AuditEvent（禁止逐条写）：
  - 不记录每一次 429。
  - 若后续需要“可追溯”，采用聚合审计：每 5 分钟/每 project 写一条汇总（actor=system）。

## 4) Phase A：Safety limits（建议）

这不是“配额/限流”的核心，但实现时必须写死默认值，避免无界。

Phase A 保守默认值（可作为 tenant settings 默认或服务端常量）：

- RunEvent 单条 payload 最大大小：32768 bytes（32KB）
- 单个 run 的 RunEvent 条数上限：10000
- 单个 run 的 artifacts 数量上限：100
- 网关直传 artifact 最大大小：50MB（52428800 bytes）
  - 超出走 Phase B 预签名直传（由存储后端限制）

说明：这些属于防滥用护栏，通常返回 4xx（例如 413/422）。错误码表可在实现时补齐。

## 5) Phase B：Quota（配额）模型与启用路径

Phase B 才启用“按周期配额”。原则：配额配置仍然走 tenant 默认 -> project 覆盖，不下沉到 environment。

### 5.1 建议配额项（最小集合）

- `runs_created_per_day`
- `artifact_storage_bytes_total`（项目当前保留的总存储）
- `artifact_upload_bytes_per_day`（每日上传总量，可选）

### 5.2 配额检查点（最小集合）

- `POST /v1/projects/{project_id}/runs`：检查 `runs_created_per_day`
- Artifact upload/init：检查 `artifact_upload_bytes_per_day` 与 `artifact_storage_bytes_total`

### 5.3 HTTP 429 语义（QUOTA_EXCEEDED）

当触发配额不足时：

- HTTP status：`429`
- error code：`QUOTA_EXCEEDED`
- 建议返回：`Retry-After`（如果是周期配额，通常是到 reset 的秒数）

建议 error body：

```json
{
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Quota exceeded.",
    "requestId": "req_01J...",
    "details": {
      "quota": "runs_created_per_day",
      "scope": "project",
      "tenantId": "ten_01J...",
      "projectId": "proj_01J...",
      "limit": 500,
      "used": 500,
      "resetAt": 1738339200000
    }
  }
}
```

### 5.4 UI 交互（Phase B）

- 明确告诉用户：是哪一种 quota、不足多少、什么时候重置。
- 如果是存储 quota：给出“清理/缩短 retention/导出后删除/联系管理员提升配额”的建议入口。
