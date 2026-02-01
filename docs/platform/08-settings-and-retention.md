# 设置与保留期（Settings & Retention）

本章定义平台的“设置分层（settings hierarchy）”与“数据保留期（retention）”策略。

目标：

- 配置足够通用，能覆盖大多数中台需求
- 规则可解释，避免配置碎片化导致排障困难
- 默认值可用，且不会把 Reports（Run list/detail）打碎

## 0) 已收敛决策（当前版本冻结）

- Settings 分层：tenant 默认 -> project 覆盖 -> environment 仅承载执行相关配置
- Retention 只允许在 tenant/project 维度配置；environment 不参与 retention（避免碎片化）
- Phase A 默认保留：Runs/RunEvents/Artifacts = 30 天
- 审计（AuditEvents）默认保留：90 天（低频且关键，用于排障与追溯）
- 清理策略：按 run 为单位做级联清理（先子后父），避免报表断引用

## 1) Settings 分层与继承规则

### 1.1 为什么要分层

中台配置如果不分层，通常会变成两种坏结果：

- 全都堆在环境上：每个环境都有一套 retention/配额，最后没人能解释“为什么这个环境表现不同”
- 全都堆在项目上：environment 变成无意义标签，无法表达执行目标

因此我们固定分层：

- Tenant：默认策略（全局默认）
- Project：覆盖默认策略（团队/项目差异）
- Environment：只放执行相关配置（目标/超时/标签/secret 引用），不放 retention

### 1.2 优先级规则（MVP）

- 若 project 有显式配置，则覆盖 tenant 默认
- environment 不允许覆盖 retention

### 1.3 Settings 落地形态（Phase A：选项 A）

本阶段我们选择：先把“默认值与继承规则”跑通，不把 settings 系统做重。

- Tenant settings：以服务端配置（配置文件/环境变量）提供默认值。
  - Phase A 可以先不做 UI。
- Project settings：不做 UI；如需要覆盖 tenant 默认，建议以 DB 持久化（挂在 project 记录上或单独表），由 owner/admin 通过受控接口/运维手段配置。

说明：这不会影响客户端协议；只是实现层面的“配置从哪里来”。

## 2) Settings 清单（MVP 推荐）

### 2.1 Tenant settings（默认值）

- default_run_retention_days = 30
- default_run_event_retention_days = 30
- default_artifact_retention_days = 30
- default_audit_retention_days = 90
- default_env_lock_ttl_seconds = 7200（2 小时）

限流（Phase A 默认启用，详见 `docs/platform/10-quota-and-rate-limit.md`）：

- default_rate_limit_enabled = true
- default_rate_limit_user_write_rpm = 120
- default_rate_limit_user_read_rpm = 1200
- default_rate_limit_user_poll_rpm = 60
- default_rate_limit_runner_ingest_rpm = 6000

Safety limits（Phase A 保守默认值，详见 `docs/platform/10-quota-and-rate-limit.md`）：

- default_run_event_payload_max_bytes = 32768
- default_run_events_per_run_max = 10000
- default_artifacts_per_run_max = 100
- default_artifact_direct_upload_max_bytes = 52428800（50MB）

说明：tenant settings 在 Phase A 可以先不做 UI，只作为服务端配置默认值。

### 2.2 Project settings（可覆盖）

- default_environment_id（可选）
- run_retention_days（默认继承 tenant）
- run_event_retention_days（MVP 建议固定等于 run_retention_days）
- artifact_retention_days（默认继承 tenant；且建议 >= run_retention_days）

限流（可覆盖 tenant 默认；详见 `docs/platform/10-quota-and-rate-limit.md`）：

- rate_limit_enabled（默认继承 tenant）
- rate_limit_user_write_rpm（默认继承 tenant）
- rate_limit_user_read_rpm（默认继承 tenant）
- rate_limit_user_poll_rpm（默认继承 tenant）
- rate_limit_runner_ingest_rpm（默认继承 tenant）

约束（MVP 写死，避免报表破碎）：

- run_event_retention_days == run_retention_days
- artifact_retention_days >= run_retention_days

### 2.3 Environment settings

Environment 只承载执行相关配置（见 `docs/platform/03-environments.md`），例如：

- executionTargetId
- timeoutMs
- labels
- policy.maxConcurrentRuns（MVP 固定 1）
- secrets（SecretRef，仅引用）

## 3) Retention 的语义（删什么、保什么）

### 3.1 按哪些时间判断过期

- Runs：按 finished_at 判断
  - running/queued 不参与清理
- RunEvents：跟随所属 Run（不单独提前清理）
- run-scoped Artifacts：跟随所属 Run（不单独提前清理）
- project-scoped Artifacts（若未来开放）：按 created_at 判断
- AuditEvents：按 created_at 判断

### 3.2 为什么按 run 做级联清理

Reports（Phase A）本质是 Runs 的视图（`docs/platform/06-reports.md`）。

如果提前清理 RunEvents 或 Artifacts，会产生“run 还在但详情缺失”的破碎体验。

因此 Phase A 的最稳策略是：

1) 先判断 run 是否过期
2) 若过期，再级联清理其 events 与 artifacts
3) 最后再删除 run

## 4) 清理作业（Purge Jobs）

### 4.1 purge 的基本策略（MVP）

- 周期：每天 1 次
- 单位：按 project 批量处理（避免跨项目长事务）

删除顺序（必须先子后父）：

1) 选择过期 runs（finished_at < now - run_retention_days）
2) 删除该批 runs 的 RunEvents
3) 删除该批 runs 的 run-scoped Artifacts
   - 先删存储对象（文件）
   - 再删 metadata 记录
4) 删除 Runs

### 4.2 环境锁回收（Sweeper）

Environment lock 有 TTL（见 `docs/platform/03-environments.md`），因此需要一个轻量回收：

- 周期：每 5 分钟
- 行为：当 lock_expires_at < now 时清空 active_run_id（并写一条系统审计汇总）

### 4.3 purge 的审计（避免审计雪崩）

purge 本身是写操作，应该可追溯，但不能为每条 run/event/artifact 都写审计。

MVP 建议：

- 每个 project/每次 purge 写 1 条汇总审计（actor=system）
  - details：cutoff + 删除 counts（runs/events/artifacts）

## 5) archived project 的处理

- archived 项目是“停止产生新数据”，不是“永久保存”
- purge 继续按 retention 执行
- settings 默认冻结（归档后不允许修改 retention，避免事后任意改历史保留规则）

## 6) Phase B 演进（已收敛方向）

### 6.1 Legal hold（冻结某些 run 不被清理）

Phase B 引入 run-level legal hold：

- 在 Run 上增加 `legal_hold`（boolean）与 `legal_hold_reason`（可选）
- legal_hold=true 时，purge 作业跳过该 run 及其 run-scoped events/artifacts
- legal hold 的增删改必须写审计（action 建议：`run.legal_hold.enable` / `run.legal_hold.disable`）

说明：Phase A 不需要 legal hold；当出现“事故复盘/合规保留”需求时再上。

### 6.2 Audit retention 的 project 覆盖

Phase A 冻结为：audit retention 为 tenant 默认（90 天），不做 project 覆盖。

原因：审计属于安全口径，project 自定义容易导致“口径不一致”。
