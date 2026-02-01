# 启动脚本 / 命令约定（Dev Commands）

目标：让开发者明确“自己在调什么”，并能在需要时快速联调。

你们已经确认：
- 日常 AI/graph 开发完成后再联通平台功能是合理的
- 但需要可同步开发：一条命令启动前后端（必要时），也支持分别启动（常态）

本文档给出推荐的命令约定（不强制“一条命令拉起四件套”）。

---

## 1) 两种开发模式（推荐）

### 模式 A：Graph 开发模式（默认）

用途：迭代 Execution Plane（graph/prompt/tool/checkpoint/stream）。

组件：
- Execution Plane：`langgraph dev`
- Debug UI：`agent-chat-ui` 直连执行面

不要求：Control Plane、平台前端。

### 模式 B：平台联调模式（同步开发/验收）

用途：验证平台语义（Auth/Tenant、409 busy、cancel、snapshot、HITL、审计）。

组件：
- Execution Plane：`langgraph dev`（本地）或 Docker Agent Server（预发/生产）
- Control Plane：FastAPI Gateway
- 平台前端：AntD Pro

---

## 2) 推荐的命令清单（实现方式不限）

建议在仓库根目录提供统一入口（Makefile 或 scripts/）：

- `dev.exec`：启动 Execution Plane（langgraph dev）
- `dev.debug-ui`：启动 agent-chat-ui（直连执行面）
- `dev.cp`：启动 Control Plane（FastAPI Gateway）
- `dev.frontend`：启动平台前端（AntD Pro）
- `dev.platform`：启动 exec + cp + frontend（平台联调）
- `dev.db`：启动本地依赖（Postgres + Redis）并创建数据库
- `cp.smoke`：平台 API 冒烟测试（用于快速验证平台跑批链路）
- `fe.tsc`：前端 TypeScript typecheck（用于 CI/本地快速验证）

说明：
- `dev.platform` 是“最常用的一键联调”，不强制包含 debug-ui。
- 如确实需要，也可提供 `dev.all`（包含 debug-ui），但不作为默认。

---

## 3) 每个模块的自启动约定

约定：每个模块都应支持独立启动，避免耦合。

### Execution Plane

- 本地：`langgraph dev --port 8123 --no-browser`
- 上线：Docker（LangGraph Agent Server + Postgres + Redis）

### Control Plane

- uv 管理依赖，Python 3.13
- 推荐启动方式：`uv run uvicorn gateway.main:app --reload --port 8000`
 - 推荐启动方式：`make dev.cp`（会先执行 `alembic upgrade head`）

### Frontend

- npm 管理依赖
- 推荐启动方式：`npm --prefix frontend run dev`（端口由前端工程决定）
 - 推荐启动方式：`make dev.frontend`（首次需要 `make fe.install`）

---

## 4) 跨域联调关键点

你们已选择跨域，因此必须确保：
- Control Plane 开启 CORS allowlist
- 允许 `Authorization` 头
- 前端统一注入 `Authorization: Bearer <token>`
- 建议前端每次请求带 `X-Request-Id`，用于审计与排障

---

## 5) Makefile（推荐的落地方式）

仓库根目录已提供 `Makefile`，目标是“能一键拉起平台联调”，同时保留单组件启动的灵活性：

- `make dev.platform`：默认用 tmux 拉起 exec + cp + frontend（没有 tmux 则 fallback 到后台 pidfile 模式）
- `make dev.cp`：只启动 Control Plane
- `make dev.frontend`：只启动 Frontend
- `make dev.exec`：只启动 LangGraph dev
- `make cp.smoke`：只跑平台 API 冒烟测试（会先 migrate）
- `make fe.tsc`：只做前端 typecheck

uv 虚拟环境策略（最佳实践，结合你们的诉求）：

- 默认（本仓库已落地）：**uv workspace + 根目录单一 `.venv` + 单一 `uv.lock`**
  - 好处：一处锁文件/一处环境，启动脚本（Makefile）可以稳定工作
  - 代价：依赖集合更大；需要克制“随手升级某个子项目依赖”带来的连锁冲突

- 需要强隔离时（可选）：对子项目使用独立 venv
  - `cd control_plane && uv sync`
  - `cd control_plane && uv run uvicorn ...`

---

## 6) 只启动后端 + 前端（平台测试模块）

目标：把“通用测试平台 / 平台测试模块（/platform）”跑起来。

注意：平台 Runs 是 polling 模式，不依赖 AG-UI SSE；因此只跑平台测试模块时，**可以不启动 `dev.exec`**。

### 6.1 推荐顺序（首次启动）

0)（可选）安装依赖（首次开发/依赖更新）

```bash
make py.sync
make fe.install
```

1) 启动本地依赖（Postgres + Redis）

```bash
make dev.db
```

2) 迁移数据库（Control Plane）

```bash
make cp.migrate
```

3) 启动后端（Control Plane）

终端 A：

```bash
make dev.cp
```

4) 启动前端（Ant Design Pro）

终端 B：

```bash
make dev.frontend
```

5) 验证（推荐）

```bash
make cp.smoke
```

### 6.2 一键启动（推荐给新同学）

```bash
make dev.platform
```

说明：
- 有 tmux：会自动开一个 session，把 exec/cp/frontend 分 pane 拉起。
- 没有 tmux：会自动 fallback 到后台模式（pid/log 在 `.run/`），停止用 `make dev.platform-bg-stop`。

---

## 7) 停止/清理（非常重要）

你会遇到两种启动形态：tmux 模式 和 后台 pidfile 模式。两者停止命令不同。

### 7.1 tmux 模式（`make dev.platform` 有 tmux 时）

- 停止全部：

```bash
make dev.platform-stop
```

说明：tmux 会直接 kill 整个 session，exec/cp/frontend 都会随之退出。

### 7.2 后台模式（`make dev.platform` 无 tmux 或手动 `make dev.platform-bg`）

- 停止全部：

```bash
make dev.platform-bg-stop
```

说明：pid/log 在 `.run/`，如果你想看日志：

```bash
ls -la .run
```

### 7.3 仅停止基础设施（Postgres/Redis）

```bash
make dev.db-stop
```

注意：如果你关掉了 Postgres/Redis，再启动 cp/frontend 可能会报 DB 不可达。

---

## 8) 常见问题排障（新人常踩）

### 8.1 端口冲突

现象：`make dev.cp` 提示端口占用，或启动后访问到“不是 Control Plane 的服务”。

处理：

- 看端口检查：

```bash
make dev.check
```

- 修改 Control Plane 端口（示例）：

```bash
make CP_PORT=18000 dev.cp
```

### 8.2 Postgres 不可达 / cp.migrate 失败

现象：`make cp.migrate` 提示 127.0.0.1:5432 不可达。

处理：

- 用 docker 起依赖：

```bash
make dev.db
```

- 或使用你自己的数据库：

```bash
make CP_DB_URI='postgresql+psycopg://user:pass@host:5432/control_plane_db' cp.migrate
make CP_DB_URI='postgresql+psycopg://user:pass@host:5432/control_plane_db' dev.cp
```

### 8.3 前端依赖没装（`cross-env` 不存在）

处理：

```bash
make fe.install
```

### 8.4 前端请求打不到后端（/v1 代理）

现象：前端能打开，但接口 404/502。

检查点：

- 默认前端通过 `frontend/config/proxy.ts` 把 `/v1/*` 代理到 Control Plane。
- 确保 Control Plane 在 `http://127.0.0.1:8000`（或你改过的 `CP_PORT`）。

快速检查：

```bash
make dev.check
```

### 8.5 只想跑“平台测试模块”，是否必须启动 exec？

不必须。

- 平台 Runs（项目域跑批）是 polling 模式，不依赖 AG-UI SSE。
- 你只想验收 `frontend/` 的 `/platform/*` 页面与 Control Plane 的平台 API 时：只启动 `dev.db` + `dev.cp` + `dev.frontend` 即可。
