# 身份与权限（Auth / RBAC）

本章定义平台的身份认证（AuthN）、授权（AuthZ）、以及多租户/项目隔离的强约束。

本章同时记录我们已经收敛的决策，避免“口头达成一致但后面忘记”。

## 0) 已收敛决策（当前版本冻结）

- project 级角色：`owner / maintainer / viewer`
- tenant admin 范围：admin 可只读访问 tenant 下所有 project 的数据（包括 runs/reports/audit）
- token 有效期：默认 24 小时（后续可配置）
- 禁用用户策略：选择 **B**（禁用用户不强制立即失效；已签发 token 在过期前仍可用）
- 审计策略：选择 **A**（MVP 只记录写操作，best-effort，不阻断主流程）

## 1) 设计原则

- 任何数据访问必须防 IDOR（仅靠前端隐藏按钮是无效的）
- 权限判断集中化：不要在每个 handler 里散落 if/else
- tenant 隔离是硬边界；project 权限是常用边界

补充解释（面向中台新人）：

- IDOR（Insecure Direct Object Reference）是最常见的中台安全坑：用户猜到一个 ID 就能读/改不属于自己的资源。
  - 解决思路不是“把 ID 变复杂”，而是“后端每次查询都按 tenant_id/project_id 约束归属”。
- 权限判断必须集中化，否则每个接口都会出现不同口径（早晚变成事故）。

## 2) AuthN（认证）

MVP：简化登录 + Bearer token。

- `POST /v1/auth/login`
- `GET /v1/me`

备注：后续可迁移到企业 OIDC/SSO，业务 API 保持 Bearer 方式不变。

### 2.1 Token 生命周期（本阶段确定）

- 默认 24 小时过期
- 后续可通过配置缩短/延长

### 2.2 禁用用户策略（你选择的 B）

选择 B 的含义：

- 用户被禁用后，平台不主动吊销已签发 token
- 已签发 token 仍可使用，直到其自然过期（默认 24h）

风险与建议：

- 风险：禁用无法“立刻生效”，窗口期最长 24h
- 如果未来需要“立刻生效”，可演进为：
  - 缩短 token TTL（例如 1h）
  - 引入 token_version / blacklist（禁用或改密后强制失效）

#### 2.2.1 Phase B 演进（已收敛方向：增加“强吊销”开关）

为了同时满足：

- 默认策略保持 B（禁用不强制立即失效，避免引入复杂度）
- 需要“立刻止血”时有办法（安全团队/管理员常见诉求）

Phase B 引入“强吊销（revoke sessions）”能力：

- 为用户维护 `auth_version`（或 `token_version`）
- JWT 内携带 `auth_version`
- 当执行强吊销时递增 auth_version，使旧 token 立即失效

审计：强吊销属于写操作，必须写 audit（action 建议：`user.revoke_tokens`）。

## 3) AuthZ（授权）

### 3.1 tenant 级角色

- admin：可管理 tenant 级资源（创建 project、管理成员、管理环境模板等）
- member：可参与 project（由 project member 角色约束）

说明：你选择 admin 可只读访问 tenant 下所有 project 数据，这符合“中台运维/管理员”的实际诉求。

### 3.2 project 级角色（已收敛）

本平台选择三档：`owner / maintainer / viewer`。

角色边界需明确：

- viewer：只读（看 runs/reports/env）
- maintainer：可改环境、触发 run、管理测试资产
- owner：可管理成员与项目设置

建议的最小权限边界（MVP）：

- viewer：
  - 允许：读取 project/env/run/report/artifact
  - 不允许：修改任何配置、触发 run、取消 run
- maintainer：
  - 允许：创建/更新 environment；触发/取消 run；查看所有结果
  - 不允许：管理 project 成员与角色
- owner：
  - 允许：包含 maintainer 全部能力 + 成员与角色管理 + project 设置

## 4) 隔离与查询约束（必须）

- 任何资源表必须可追溯归属：至少 tenant_id
- project 资源必须带 project_id
- 所有查询必须默认 tenant_id 过滤；涉及 project 的必须验证 membership

## 5) 审计（AuditEvent）

本平台选择：MVP 只记录写操作（best-effort），原因：

- 成本极低，但能显著提升可追溯性（谁改了环境/谁触发了 run/谁取消了 run）
- 未来做权限/排障/合规都需要这个证据链

MVP 必须记录的写操作：

- create/update/archive project
- create/update/disable environment
- trigger/cancel run
- 角色与成员变更

## 6) Open Questions

- 是否需要 refresh token？（MVP 可先不做）
 
