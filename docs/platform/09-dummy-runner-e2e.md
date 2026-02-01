# Dummy Runner 端到端链路（Phase A）

本章把 Phase A 的平台链路串起来：Projects -> Environments -> Runs -> RunEvents -> Artifacts -> Reports -> Audit。

目标：让后续实现时每个模块“写什么表、返回什么错误、谁负责推进状态”都一目了然。

## 0) 参与者（Actors）

- FE：Frontend（中台 UI）
- API：Control Plane API（鉴权、RBAC、元数据、锁、审计）
- DB：元数据数据库（projects/environments/runs/run_events/artifacts/audit_events）
- WKR：Dummy Runner Worker（执行 queued run，写 events/artifacts，推进 run 状态）
- STO：Artifacts 存储（dev: 本地磁盘；prod: 对象存储）

## 1) 时序图（ASCII）

```text
FE                API                         DB                       WKR                  STO
|                 |                           |                        |                    |
|--(1) login ---->|                           |                        |                    |
|<-(1') token ----|                           |                        |                    |
|                 |                           |                        |                    |
|--(2) create project ----------------------->|--INSERT projects------>|                    |
|                 |                           |--INSERT project_members(owner)
|                 |                           |--(best-effort) INSERT audit_events(project.create)
|<-(2') 201 project_id -----------------------|                        |                    |
|                 |                           |                        |                    |
|--(3) create environment ------------------->|--INSERT environments (lock fields NULL)
|                 |                           |--(best-effort) INSERT audit_events(environment.create)
|<-(3') 201 environment_id -------------------|                        |                    |
|                 |                           |                        |                    |
|--(4) create run (idempotent) -------------->|--SELECT by (project_id, client_run_id)
|                 |                           |   if replay: return existing run
|                 |                           |   if conflict: 409 IDEMPOTENCY_KEY_CONFLICT
|                 |                           |--Acquire env lock (TTL=2h) OR 409 ENVIRONMENT_BUSY
|                 |                           |--INSERT runs (status=queued)
|                 |                           |--INSERT run_events (run.queued)
|                 |                           |--(best-effort) INSERT audit_events(run.create)
|<-(4') 201/200 run_id -----------------------|                        |                    |
|                 |                           |                        |                    |
|                 |                           |<--(5) WKR polls queued runs ----------------------|
|                 |                           |                        |--UPDATE runs status=running
|                 |                           |                        |--INSERT run_events (run.started/step/log)
|                 |                           |                        |--(optional) refresh env lock TTL
|                 |                           |                        |                    |
|                 |                           |                        |--(6) write artifact file ------------------->|
|                 |                           |                        |<-(6') storage_key,size,sha256 ---------------|
|                 |                           |                        |--INSERT artifacts
|                 |                           |                        |--INSERT run_events (artifact.created)
|                 |                           |                        |--(best-effort) INSERT audit_events(artifact.create)
|                 |                           |                        |                    |
|--(7) poll run events ---------------------->|--SELECT run_events ORDER BY seq ASC LIMIT N
|<-(7') events + nextCursor + hasMore --------|                        |                    |
|                 |                           |                        |                    |
|                 |                           |                        |--(8) finish run
|                 |                           |                        |--UPDATE runs status + ended_at + summary_json
|                 |                           |                        |--INSERT run_events (run.finished + error.raised if needed)
|                 |                           |                        |--RELEASE env lock (active_run_id=NULL)
|                 |                           |                        |                    |
|--(9) report views (runs list/detail) ------>|--GET runs / run / events / artifacts
|<-(9') data ---------------------------------|                        |                    |
|                 |                           |                        |                    |
|--(10) audit view -------------------------->|--GET audit-events (created_at desc)
|<-(10') audit-events ------------------------|                        |                    |
```

## 2) 冻结口径（必须与各模块文档一致）

### 2.1 幂等（Create Run）

- 幂等键：`client_run_id`
- scope：`(project_id, client_run_id)`
- 201 vs 200：首次创建 201；replay 200
- replay 不受 `ENVIRONMENT_BUSY` 影响

### 2.2 并发锁（Environment lock）

- 同一 environment 同时只允许 1 个 active run
- TTL：默认 2 小时
- busy 错误：409 `ENVIRONMENT_BUSY`（details：environmentId/activeRunId）

### 2.3 RunEvents（轮询分页）

- cursor：opaque
- 排序：seq ASC

### 2.4 Reports

- Phase A：Reports = Runs 的视图（Run list/detail）

### 2.5 Audit

- write ops only，best-effort

## 3) 数据保留期（对齐 retention 文档）

- Runs/RunEvents/Artifacts：30 天（按 run finished_at 级联清理）
- AuditEvents：90 天
