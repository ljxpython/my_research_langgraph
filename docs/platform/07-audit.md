# 审计（Audit / AuditEvents）

本章定义平台的审计能力。

审计的目标不是“记录运行日志”（那是 RunEvent 的职责），而是回答：

- 谁（actor）在什么时间（when）
- 对哪个资源（what）
- 做了什么写操作（write operation）
- 结果如何（outcome）
- 能用哪个 request_id 追溯到具体请求链路（correlation）

## 0) 已收敛决策（当前版本冻结）

- 仅记录写操作（write ops only）
- best-effort：审计写入失败不阻断主业务写入，但必须有内部告警/可观测性
- 默认不记录敏感信息：不落 token 明文、不落密码/密钥、不落完整请求体
- 审计是 append-only：不支持修改/删除单条事件

## 1) AuditEvent vs RunEvent（不要混用）

- AuditEvent：平台治理与追责（写操作）
  - 例：创建项目、修改环境、触发 run、取消 run、解锁环境、变更成员角色

- RunEvent：一次 run 的运行过程时间线（高频）
  - 例：step.started、log.append、artifact.created、error.raised

两者的差异决定了不同的保留期、权限与脱敏策略。

## 2) 事件模型（推荐字段）

### 2.1 顶层字段

- audit_event_id
- schema_version（默认 1）
- created_at（服务端写入时间）
- tenant_id（必填）
- project_id（可选：project scoped 事件必填）
- actor
  - actor_type（user/system/service）
  - actor_id（user_id 或 service_id）
  - display（可选：用户名快照；MVP 不建议存邮箱）
- action（规范化字符串）
- resource
  - resource_type（project/environment/run/artifact/member/settings/secret）
  - resource_id
- request_id（用于链路关联）
- outcome（success/denied/error）
- reason_code（可选：PERMISSION_DENIED/VALIDATION_FAILED/CONFLICT/NOT_FOUND）
- details_json（扩展字段，必须脱敏）

### 2.2 action 命名建议（MVP 覆盖范围）

Projects：

- project.create
- project.update
- project.archive
- project.unarchive

Project members：

- project.member.add
- project.member.update_role
- project.member.remove

Environments：

- environment.create
- environment.update
- environment.enable
- environment.disable
- environment.check
- environment.unlock

Runs：

- run.create
- run.cancel

Users（Phase B）：

- user.revoke_tokens
- run.legal_hold.enable
- run.legal_hold.disable

Artifacts：

- artifact.create
- artifact.delete（若后续开放删除）

## 3) 权限（MVP）

读取审计事件属于敏感操作，MVP 建议收紧：

- project scope：owner/maintainer 可读；viewer 默认不可读
- tenant scope：tenant admin 可跨项目只读

备注：若后续需要开放 viewer，只能在“事件类型 ACL + 字段级脱敏”成熟后再做。

## 4) API 草案（讨论用）

- `GET /v1/projects/{project_id}/audit-events`
  - filters：action/resource_type/actor_id/outcome/since/until
  - pagination：cursor/limit（按 created_at desc）

- `GET /v1/projects/{project_id}/audit-events/{audit_event_id}`

- `GET /v1/tenants/{tenant_id}/audit-events`（tenant admin）

注意：审计读接口必须强制校验 tenant_id/project_id，避免 IDOR。

## 5) 脱敏与隐私（MVP 规则）

- 禁止记录：
  - Authorization header
  - token/密码/密钥明文
  - 完整请求体（除非做强脱敏且白名单字段）

- details_json 允许记录：
  - changed_fields（字段名列表）
  - 资源引用（project_id/environment_id/run_id 等）
  - 白名单枚举值（例如 status 的变更）

## 6) 保留期（retention）

MVP：默认不做复杂配置，保留期与清理作业可后置。

建议：未来按 tenant/project 配置 retention，并且 purge 作业本身要可追溯。
