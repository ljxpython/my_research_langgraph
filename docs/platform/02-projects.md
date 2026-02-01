# 项目管理（Projects）

Project 是中台的资源容器：环境、运行、报告、附件、（未来的测试资产）都必须归属 Project。

本章把 Projects 的关键细节“写死”，用于后续实现与验收。

## 0) 已收敛决策（当前版本冻结）

- Project 是平台的隔离边界与权限边界：所有 Environment / Run / Report / Artifact 必须 project-scoped
- Project 角色固定为三档：`owner / maintainer / viewer`（见 `docs/platform/01-auth-and-rbac.md`）
- Project 生命周期：`active / archived`（MVP 不做删除；删除作为后续能力）
- 创建权限：tenant 内任意已登录用户可创建 Project，创建者默认成为该 Project 的 owner
  - tenant admin 同样可创建与管理（break-glass）
- 成员管理：仅 owner 可增删成员、变更角色；并强制“至少一个 owner”不变量
- 归档（archive）语义：归档后默认只读（禁止触发 run、禁止修改环境/设置），允许 owner 进行恢复/成员交接
- 审计：MVP 记录写操作（best-effort），必须覆盖 project/members 的变更动作

## 1) MVP 范围

- Project CRUD：list/create/update/archive/unarchive
- 成员管理：add/remove/change role
- Project 设置：默认环境、描述、（可选）基础保留策略

## 2) 核心数据模型（建议）

- projects
  - project_id
  - tenant_id
  - slug（tenant 内唯一，可选；用于人类可读 URL）
  - name
  - description
  - status（active/archived）
  - created_by
  - created_at
  - updated_at
  - archived_at（可选）
  - archived_by（可选）

- project_members
  - project_id
  - tenant_id
  - user_id
  - role（owner/maintainer/viewer）
  - created_at
  - created_by（谁添加的，便于审计/追责）

### 2.1 不变量（必须强制）

- 任何 Project 必须至少有 1 个 owner
  - 禁止：移除最后一个 owner
  - 禁止：将最后一个 owner 降权为 maintainer/viewer

### 2.2 与 token TTL 的关系（避免“权限不生效”）

为了让成员变更能即时生效：

- token 只承载身份（user_id/tenant_id/exp），不携带 project role
- project 权限由服务端基于 project_members 实时计算（可做短 TTL 缓存，但需要在成员变更时主动失效）

### 2.3 Project settings（MVP 建议）

建议为 Project 预留一个 settings_json（或明确字段）用于控制默认行为：

- default_environment_id（可选）
- run_retention_days（默认 30 天）
- artifact_retention_days（默认 30 天；可与 run_retention_days 统一）

## 3) API 草案（讨论用）

- `GET /v1/projects`
- `POST /v1/projects`
- `GET /v1/projects/{project_id}`
- `PATCH /v1/projects/{project_id}`
- `POST /v1/projects/{project_id}:archive`
- `POST /v1/projects/{project_id}:unarchive`

- `GET /v1/projects/{project_id}/members`
- `POST /v1/projects/{project_id}/members`
- `PATCH /v1/projects/{project_id}/members/{user_id}`
- `DELETE /v1/projects/{project_id}/members/{user_id}`

推荐的返回与错误语义（MVP）：

- 对“无权限访问的 project_id”，返回 404（避免枚举 project_id）
- 对“归档项目的写操作”，返回 409 `PROJECT_ARCHIVED`（比 403 更可解释）

## 4) UI 草案

- Projects 列表：名称、状态、创建人、创建时间
- Project 详情：Tabs（Environments / Runs / Reports / Members / Settings）

建议在 Project 详情页明确显示：

- 当前用户在该 Project 的角色（owner/maintainer/viewer）
- 当前 Project 的状态（active/archived）
- “归档后禁止触发 run/修改环境”的提示

## 4.1 归档行为（MVP 统一口径）

- archived 项目允许：
  - 查看 environments / runs / reports / artifacts / audit
  - owner 管理成员与角色（用于交接）
  - owner 执行 unarchive

- archived 项目禁止：
  - 触发新的 run
  - 修改 project settings（除成员交接相关）
  - 创建/修改 environment

## 4.2 审计事件（MVP：写操作）

必须记录：

- `project.create` / `project.update` / `project.archive` / `project.unarchive`
- `project.member.add` / `project.member.update_role` / `project.member.remove`

## 5) Open Questions

- 是否需要 Project-level 配额？（Phase B/C 再加）
- 是否需要 project slug？（MVP 可先不启用；启用后应尽量不变更，或提供显式 rename）
