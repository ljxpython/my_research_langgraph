# 报告与看板（Reports）

本章定义“结果呈现”的最小形态：Run list + Run detail，以及后续聚合趋势的演进。

报告在 Phase A 的定位：

- 不是“独立的报表系统”（先不做复杂聚合/看板/导出）
- 而是把 Runs/RunEvents/Artifacts 以可读方式呈现给用户

## 0) 已收敛决策（当前版本冻结）

- Phase A 不引入独立 Report 实体表；Reports = Runs 的视图
- MVP 必做：Run list + Run detail
- Run detail 的信息来源：
  - Run（状态、时间、summary_json）
  - RunEvent（时间线：log/step/error/artifact）
  - Artifacts（产物列表）
- summary_json：先“半冻结”（固定推荐字段 + summary_version），允许扩展

## 1) MVP 范围

- Run 列表：过滤（project/environment/status/时间）
- Run 详情：状态、耗时、失败原因（summary_json）、RunEvent 时间线、Artifacts

### 1.1 Run list（建议字段）

- run_id
- status（queued/running/succeeded/failed/canceled）
- project_id（或 project name）
- environment_id（或 environment name）
- triggered_by
- started_at / finished_at / duration
- failure_reason（若失败）

### 1.2 Run detail（建议区块）

1) 基本信息：run_id / project / environment / 触发人 / 时间
2) 阶段（Steps）：基于 `step.started/step.finished`
3) 控制台（Logs）：基于 `log.append`
4) 错误摘要：基于 `error.raised` + Run.error_code/message（若有）
5) 产物（Artifacts）：基于 `artifact.created` + artifacts 列表

## 1.3 summary_json（MVP 推荐 schema）

summary_json 既用于 Run list 也用于 Run detail 的摘要展示。

建议最小字段（推荐固定）：

- summary_version: 1
- duration_ms
- steps:
  - total
  - succeeded
  - failed
- logs:
  - error_count
  - warn_count
- artifacts:
  - count
- error:
  - code
  - message

允许扩展：summary_json 可以携带额外字段，但必须保留 summary_version。

## 2) 后续演进（Phase B/C）

- 计划维度聚合（Plan）
- 通过率趋势、失败 Top
- 对比：本次 vs 上次（baseline/diff）
- 质量门禁：失败即阻断

Phase B/C 才考虑：

- 独立的 Report 实体（可分享、可导出、可缓存）
- Dashboard（聚合指标与趋势）

## 3) Open Questions

- 报表是否要支持导出（PDF/HTML）？（Phase B）
- Run list 的跨项目视图（All Runs）是否需要？（Phase A 可后置）
