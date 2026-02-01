# 产物与证据链（Artifacts）

Artifacts 用于保存“可追溯证据”：日志文件、截图、导出报告、外部链接等。

本章的目标：把 Artifact 设计成平台通用能力（不绑定测试类型/执行器），同时可治理、可审计、可替换存储后端。

## 0) 已收敛决策（当前版本冻结）

- Artifact 是“引用（pointer）+ 元数据（metadata）”，不是把二进制塞进 DB
- Artifact 必须 project-scoped；可选 run-scoped（run_id 可空，但 Phase A 主要用 run-scoped）
- 上传方式（MVP）：小文件允许走网关直传；大文件走“预签名 URL / 直传存储”模式（Phase B）
- 存储后端（Phase A）：本地磁盘（dev）+ 抽象可替换接口；生产环境推荐对象存储（S3/OSS）
- 证据链：RunEvent 通过 `artifact.created` 引用 artifact_id，Run detail 以此展示产物列表
- 安全：下载/预览必须鉴权；不返回永久公开链接；审计只记录写操作（上传/删除/导出）

## 1) MVP 范围

- 支持登记与上传 artifact（metadata + 可下载/预览链接）
- Artifact 关联到 Run（Phase A 主路径）
- Run detail 可查看 artifacts 列表
- 支持最小保留策略（retention）：默认 30 天（可在 project settings 覆盖）

## 2) 设计原则

- 不把二进制塞进 messages/state（避免膨胀与前端卡死）
- storage 与 metadata 解耦：DB 只存引用（url 或 storage_key）
- 保留策略（retention）要可配置：默认值稳定，且后续可演进为按 project/environment 分类

补充解释（面向中台新人）：

- Artifacts 和 RunEvent 的关系：RunEvent 记录“发生了什么”，Artifact 保存“证据本体”（文件）。
- 如果把大文件直接塞进 DB 或 event payload，系统会很快变慢、备份变大、前端也会卡。

## 2.1 建议的最小数据字段（讨论用）

- artifact_id
- tenant_id
- project_id
- run_id（可选）
- kind（例如 log/report/export/attachment/other）
- filename
- content_type
- size_bytes
- sha256（可选，但推荐）
- storage_key（或 url；推荐用 storage_key，url 由服务端按需签发）
- metadata_json
- created_at
- created_by

## 3) API 草案（讨论用）

建议两类 API：

### 3.1 项目域 artifacts（平台通用）

- `POST /v1/projects/{project_id}/artifacts`
  - 方式 A（Phase A）：multipart 直传小文件 + 元数据
  - 方式 B（Phase B）：先创建 artifact 记录并返回 uploadUrl（预签名），客户端直传存储

- `GET /v1/runs/{run_id}/artifacts`（列表）
- `GET /v1/artifacts/{artifact_id}`（元数据）

### 3.2 与现有契约的关系（避免混淆）

仓库已有 `docs/api-contract.md` 中的 `POST /v1/artifacts`（更多用于 Workbench/上下文附件）。

当前我们选择：**两种入口并存，但复用同一套 storage/metadata**。

- Workbench/对话链路：`POST /v1/artifacts`
- 平台项目域：`POST /v1/projects/{project_id}/artifacts`

Phase A 的平台 MVP：优先实现项目域接口（项目/运行证据链）。

实现要求（写死，避免两套系统）：

- 两个入口写入同一张 artifact 元数据表（或同一套 metadata 模型）。
- 两个入口使用同一套 storage backend（本地磁盘 dev / 对象存储 prod）。
- 上传大小：网关直传必须有限制（MVP 建议 50MB），超出走 Phase B 预签名直传。

## 4) Open Questions

- 是否允许 artifact project-scoped（不挂 run）作为一等资源？（Phase A 可先不开放 UI）
- 是否需要 artifact 删除能力？（MVP 可先不删，仅保留期自动清理）
