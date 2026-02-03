# 鉴权与 DB 管理：可复用开源方案（Control Plane）

目标：减少 Control Plane 在“鉴权与 DB 基建”上的重复劳动，把时间留给平台语义（AG-UI/run/snapshot/cancel/HITL）。

前提（你们已定）：
- `control_plane/` 使用 uv 管理依赖（uv lock），Python 3.13
- 跨域（CORS）+ Bearer token
- Phase-1 简化 login，后续迁移到企业 SSO/OIDC

## 1. 业界常用的“可直接借鉴”选项

### A) Full Stack FastAPI Template（强烈推荐：直接抄 auth/db/migrations 结构）

- Repo: https://github.com/fastapi/full-stack-fastapi-template
- 适合复用：
  - JWT 鉴权、密码哈希、用户模型
  - Postgres + 迁移 + Docker Compose
  - 工程化目录结构（backend/frontend 分离）
- 注意：它用 SQLModel（基于 SQLAlchemy），你们也可以只借鉴“auth/migrations/配置/测试”模式，不一定要全盘照搬 ORM。

### B) FastAPI Users（可用，但需要注意维护模式）

- Repo: https://github.com/fastapi-users/fastapi-users
- 适合复用：
  - 注册/登录/重置密码等能力的“成品组件”
  - 多种认证 backend（JWT、cookie、redis 等）
- 注意：项目 README 提到进入 maintenance mode（稳定维护、安全修复，但不再增加新特性）。
  - 对 Phase-1 简化 login 来说完全够用；长期如果你们要深度定制权限模型，可能仍会回到自研/或迁移到 OIDC。

### C) SQLAlchemy Admin / FastAPI Admin（可选：仅用于内部运维管理）

- SQLAdmin（SQLAlchemy/SQLModel 管理后台）: https://github.com/aminalaee/sqladmin
- FastAPI-Admin（TortoiseORM + Tabler）: https://github.com/fastapi-admin/fastapi-admin

适用场景：
- Phase-1 你们用 AntD Pro 做管理台，这类 admin 并不是必需。
- 但它们可以作为“快速内部运维界面”（看数据库表、临时管理用户/租户）的一种捷径。

### D) RBAC/ABAC 方案：Casbin（偏权限引擎）

- PyCasbin: https://github.com/casbin/pycasbin

适用：
- 当你们的权限从“简单角色（admin/user）”演进到“tenant/project/agent/动作”的矩阵时，引入 Casbin 能避免你们手写一堆 if/else。
- Phase-1 可以先不用（只做 RBAC 最小集）；Phase-2 再引入。

### E) 参考项目结构（可读性强，但注意维护状态）

- FastAPI RealWorld 示例（结构很完整，但仓库已 archive）：
  - https://github.com/nsidnev/fastapi-realworld-example-app
  - 借鉴点：router/service/repo/迁移/测试组织方式。

## 2. 我推荐你们的“最小复用组合”（最佳 ROI）

为了最少造轮子，并兼容“Phase-1 简化 login -> Phase-2 OIDC”的演进：

- 鉴权：直接参考/抽取 `fastapi/full-stack-fastapi-template` 的 JWT 登录与用户模型（你们只需要 login + me + RBAC 最小集）。
- DB：SQLAlchemy + Alembic（迁移、会话、事务模式同样可从 full-stack template 借鉴）。
- 权限：Phase-1 先做硬编码 RBAC（admin/user），预留接口；Phase-2 再考虑 Casbin。

原因：
- 这个组合不会把你们锁死在某个“用户系统组件”里，同时也避免从零搭 DB/migration/auth 体系。

落地时建议先对齐契约资产：
- `shared/contracts/http/examples/login.request.json`
- `shared/contracts/http/examples/login.response.json`
- `shared/contracts/http/examples/me.response.json`
- `shared/contracts/http/errors.md`

## 3. uv + Python 3.13 的注意事项

- `uv` 你们环境已可用（`uv --version`）。
- 推荐在 `control_plane/` 内单独维护一个 `pyproject.toml` + `uv.lock`，实现“服务级依赖隔离”。
- Python 3.13 对大多数主流库已支持，但遇到编译型依赖要关注 wheels（尤其是数据库驱动）。

## 4. 管理后台/中台权限模型：值得借鉴的“成品项目”

你提到的 `vue-fastapi-admin` 方向非常对：这类项目的最大价值通常不是“直接照搬代码”，而是：

- RBAC 表结构怎么设计（User/Role/Menu/Permission/API）
- 菜单树/按钮权限怎么建模
- 登录态/会话/续期怎么做

它们能帮助你们快速确定 Control Plane 的元数据模型（agents/threads/runs/audit 之外的 admin 领域模型），尤其适合测试管理中台。

注意：不少“成品后台”会绑定特定 ORM（Tortoise/Django/Go），建议你们 **抄 schema 与交互语义**，不要直接抄 ORM 代码。

### 4.1 FastAPI/Tortoise 体系：可直接借鉴的 RBAC/菜单/接口权限落库

- vue-fastapi-admin（你提到的项目，RBAC + 菜单 + 接口权限很完整）
  - https://github.com/mizhexiaoxiao/vue-fastapi-admin
- fastapi-admin（偏 admin 框架，登录态用 Redis session，不是 JWT）
  - https://github.com/fastapi-admin/fastapi-admin

### 4.2 FastAPI/SQLAlchemy 体系：RuoYi 风格（menu_type + perms）

- Dash-FastAPI-Admin（菜单/按钮权限 perms、角色-菜单关联、JWT+Redis 会话）
  - https://github.com/HogaStack/Dash-FastAPI-Admin

### 4.3 Django/DRF（仅作 schema 借鉴）

- django-vue3-admin（MenuMeta 拆表、auth_code 按钮权限等建模很经典）
  - https://github.com/XIE7654/django-vue3-admin

### 4.4 权限引擎（Phase-2 选项）：Casbin

- PyCasbin（授权引擎本体，适合做 ABAC/RBAC with domains）
  - https://github.com/casbin/pycasbin
- FastAPI 集成中间件（参考 enforce 接入点）
  - https://github.com/pycasbin/fastapi-authz
- SQLAlchemy adapter（将 policy 落库，表结构 ptype/v0..v5 是业界常见形态）
  - https://github.com/pycasbin/sqlalchemy-adapter

### 4.5 refresh token 的现实建议（Phase-1 不强推）

- fastapi-jwt-auth 提供 refresh token 形态，但依赖约束偏老（PyJWT < 2.0），更建议“借鉴接口语义”，不要强依赖。
  - https://github.com/IndominusByte/fastapi-jwt-auth

## 5. 我建议你们最终选择的权限路线（与测试管理匹配）

Phase-1（测试管理框架）：
- 先做最小 RBAC（admin/user）+ tenant 资源隔离（防 IDOR）
- 先不做“菜单/按钮权限”的复杂体系（交给 AntD Pro 前端路由与后端简单权限即可）

Phase-2（走向通用中台）：二选一

1) Role-Menu/Role-API（类似 vue-fastapi-admin）：直观、易运营，适合中台
2) Casbin（policy 表）：更通用，适合权限矩阵复杂/需要 domain 的情况
