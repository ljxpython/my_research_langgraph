# 通用测试管理总纲（Phase A：先跑通平台链路）

本文档定义“通用测试管理/中台”的总体规划：目标、边界、核心对象模型、MVP 验收标准，以及分阶段 roadmap。

## 1) 目标与非目标

### 1.1 目标（先通用、后执行器）

我们优先实现一个“可用的中台测试管理”，核心能力包括：

- 项目管理（Project）：团队协作的资源容器
- 环境管理（Environment）：执行目标与健康状态
- 运行与报告（Run/Report）：可追溯的执行记录 + 结果展示
- 产物与证据（Artifact）：日志/附件/导出物的证据链
- 权限与审计（RBAC/Audit）：谁能看/改/执行；关键动作可追溯

MVP 执行器选择：Dummy Runner（不绑定具体测试类型）。

## 1.3 产品形态（我们要做什么产品）

我们要做的是“中台式测试管理”，而不是单一项目的脚本集合：

- 面向团队协作：以 Project 为资源容器，有成员与角色
- 面向可复现：每次 Run 固化 project + environment
- 面向可追溯：RunEvent 与 Artifact 形成证据链；AuditEvent 记录关键写操作
- 面向可演进：Runner 可插拔（Dummy Runner -> 后续接入 Agent/API/SQL 执行器）

### 1.2 非目标（本阶段不做）

- 不优先做智能体/LLM/工具链（Agent 作为 Phase C 的可插拔执行器）
- 不优先做复杂调度系统（Cron/队列/分布式 worker）
- 不优先做完整的评测体系（dataset/scorer/baseline/diff）

## 2) 术语表（Glossary）

- Tenant：租户/组织隔离边界
- User：用户
- Role：角色（tenant 级 / project 级）
- Project：项目，承载平台资源的最小容器
- Environment：环境/执行目标，Run 固化到某个 environment
- Run：一次执行记录（从 queued 到 finished 的生命周期）
- RunEvent：运行过程中的事件/日志（append-only）
- Artifact：产物与证据（文件/链接/导出报告等）
- AuditEvent：审计事件（谁对什么资源做了什么）

## 3) 分层与边界（Platform 内核）

平台需要清晰的分层，避免“越做越像一个巨型应用”：

1) Control Plane（控制面）
- 负责：鉴权/租户隔离、项目/环境/运行元数据、并发与幂等、审计、对外 API
- 不负责：存储运行过程的完整 messages/state 正文（如果未来接入执行引擎）

2) Runner（执行器抽象）
- 本阶段：Dummy Runner（只写 run events，最终成功/失败）
- 后续：Agent Runner / API Runner / SQL Runner 等

3) Frontend（中台 UI）
- 项目/环境/运行/报告/审计 的管理界面

### 3.1 两条运行链路（必须明确边界，避免语义打架）

平台在本仓库内存在两条“运行（run）”链路，**两套并存但边界清晰**：

1) 平台 Runs（项目域 / 测试跑批 / Dummy Runner）

- 资源容器：Project / Environment
- 运行模型：`docs/platform/04-runs.md`
  - RunEvent 获取：轮询分页（cursor/limit）
  - 并发：Environment lock（busy -> `ENVIRONMENT_BUSY`）

2) Agent Run（对话链路 / AG-UI SSE）

- 传输协议：SSE（AG-UI v1）
- 对外契约：`docs/api-contract.md` 与 `docs/frontend-contract.md`
- 并发：同一 thread 单 active run（busy -> `THREAD_BUSY`，见 `shared/contracts/http/errors.md`）

约束（写死）：

- 平台 Runs 不引入 SSE；Agent Run 不复用平台 RunEvent 的 polling 语义。
- 错误码语义不混用：平台跑批使用 `ENVIRONMENT_BUSY`；对话链路使用 `THREAD_BUSY`。

## 4) MVP 验收标准（Phase A）

MVP 不绑定测试类型，但必须跑通以下链路：

1) 登录 -> 进入平台
2) 创建 Project
3) 在 Project 下创建 Environment
4) 触发一次 Run（选择 project + environment + runner=dummy）
5) Run 状态推进：queued -> running -> succeeded/failed
6) Run detail 可查看事件流（RunEvent）与摘要
7) 生成/上传至少一个 Artifact 并在 Run detail 可见
8) Audit 里能看到关键操作（创建项目/环境、触发 run、取消 run 等）

## 5) 核心对象模型（最小字段）

### 5.1 Tenant / User / Role

- Tenant
  - tenant_id
  - name
  - status

- User
  - user_id
  - tenant_id
  - username
  - password_hash
  - status
  - is_admin（tenant 级）

补充：token 与禁用策略（当前冻结，便于后续实现与验收对齐）：

- token 默认有效期：24 小时
- 禁用用户：不强制立即使已签发 token 失效（窗口期最长 24h）
- 审计：MVP 只记录写操作（best-effort）

- ProjectMember（project 级权限）
  - project_id
  - user_id
  - role（固定为 owner/maintainer/viewer，详见 `docs/platform/01-auth-and-rbac.md`）

### 5.2 Project

- project_id
- tenant_id
- name
- description
- status（active/archived）
- created_by
- created_at
- updated_at

### 5.3 Environment

Environment 必须 project scoped：

- environment_id
- tenant_id
- project_id
- name
- type（dev/staging/prod，或自定义枚举）
- status（active/disabled）
- config_json（不允许明文敏感信息；敏感信息只存引用）
- health_status（unknown/healthy/unhealthy）
- last_heartbeat_at / last_error

并发锁（MVP：environment lock）：

- active_run_id（同一 environment 同时只允许 1 个 active run）
- lock_expires_at（TTL，避免崩溃导致永久 busy）

### 5.4 Run / RunEvent

- Run
  - run_id
  - tenant_id
  - project_id
  - environment_id
  - status（queued/running/succeeded/failed/canceled）
  - triggered_by
  - started_at / finished_at
  - summary_json（面向 UI 的摘要：耗时、失败原因、统计等）

- RunEvent（append-only）
  - event_id
  - tenant_id
  - project_id
  - run_id
  - ts
  - type（log/step/metric/custom）
  - payload_json

### 5.5 Artifact

- artifact_id
- tenant_id
- project_id
- run_id（可选：有些 artifact 也可能属于 project，而非 run）
- kind（log_file/screenshot/report/export/other）
- filename
- content_type
- size_bytes
- url（或 storage_key）
- metadata_json
- created_at

### 5.6 AuditEvent

- audit_event_id
- tenant_id
- actor_user_id
- action（create_project/update_env/trigger_run/...）
- resource_type
- resource_id
- request_id
- details_json
- created_at

## 6) 页面信息架构（建议菜单）

MVP 菜单建议：

- Projects
  - Project List
  - Project Detail
    - Environments
    - Runs
    - Reports（先占位）
    - Settings / Members

- Runs
  - All Runs（跨项目视角，可选）

- Audit
  - Audit Events（写操作）

- Account
  - Profile
  - Settings

## 7) Roadmap（分阶段）

### Phase A（当前）：通用平台骨架 + Dummy Runner
- Auth/RBAC
- Projects
- Environments
- Runs（生命周期 + RunEvent + Cancel）
- Artifacts
- Reports（Run list + Run detail）
- Audit

### Phase B：测试资产与计划（可复用批量执行）
- TestCase / Suite / Plan
- 参数化与 Dataset
- 批量执行与结果汇总

### Phase C：智能体/评测体系接入
- Agent Runner（prompt + context）
- Eval / Baseline / Diff / Replay

## 8) 未决问题（需要评审收敛）

请将问题逐条记录到：`docs/platform/99-open-questions.md`。
