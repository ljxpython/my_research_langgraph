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

- pnpm 管理依赖
- 推荐启动方式：`pnpm dev`（端口由前端工程决定）
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

uv 虚拟环境策略（最佳实践，结合你们的诉求）：

- 默认（本仓库已落地）：**uv workspace + 根目录单一 `.venv` + 单一 `uv.lock`**
  - 好处：一处锁文件/一处环境，启动脚本（Makefile）可以稳定工作
  - 代价：依赖集合更大；需要克制“随手升级某个子项目依赖”带来的连锁冲突

- 需要强隔离时（可选）：对子项目使用独立 venv
  - `cd control_plane && uv sync`
  - `cd control_plane && uv run uvicorn ...`
