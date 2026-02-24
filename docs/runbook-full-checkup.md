# Full Checkup Runbook（验收跑通手册）

目标：用一套固定步骤，在本地把 CP/EP/FE 全链路跑通，并验证 AG-UI 事件、Reasoning/Plan/MCP 面板、以及 learn 模块的基本可用性。

## 0. 先决条件

- Python 3.13 + `uv`
- Node.js + npm
- Docker（本地 Postgres + Redis）

## 1. 一键启动（推荐）

```bash
make py.sync
make fe.install

make dev.db

# Execution Plane（LangGraph dev）
nohup make dev.exec > .run/exec.log 2>&1 & echo $! > .run/exec.pid

# Control Plane（FastAPI）
BOOTSTRAP_EXTRA_AGENTS=1 nohup make dev.cp > .run/cp.log 2>&1 & echo $! > .run/cp.pid

# Frontend
nohup make dev.frontend > .run/frontend.log 2>&1 & echo $! > .run/frontend.pid
```

端口：
- CP: `http://127.0.0.1:8000`
- FE: `http://127.0.0.1:8001`
- EP: `http://127.0.0.1:8123`

## 2. 冒烟验证（脚本）

```bash
uv run --project control_plane python control_plane/scripts/e2e_smoke.py --agent-id sql_agent
uv run --project control_plane python control_plane/scripts/e2e_smoke.py --agent-id deep_agent
uv run --project control_plane python control_plane/scripts/e2e_smoke.py --agent-id learn_semantic_search
```

说明：
- `BOOTSTRAP_EXTRA_AGENTS=1` 会在 CP 启动时额外 seed `deep_agent` / `learn_semantic_search`。
- `deep_agent` 当前在 EP 层为 `sql_agent` 的临时别名，用于 unblock 平台 UI/契约联调（见“已知限制”）。

## 3. 手动验收（UI）

1) 打开前端：`http://127.0.0.1:8001`
2) 登录（默认 dev 账号）：`test` / `test`
3) 进入：
- `SQL Agent -> Workbench`：验证 Plan/MCP/Reasoning tabs 可见
- `Deep Agent -> Workbench`：验证 Reasoning 面板能消费 `CUSTOM name=reasoning_summary`
4) 在 Chat 输入：
- 触发 Plan："Write a plan using write_todos"（应在 Plan 面板出现）
- 触发工具：正常 SQL 查询（应出现 TOOL_CALL_* 事件，若前端有对应展示）

## 4. 日志与排障

- CP 日志：`.run/cp.log`
- EP 日志：`.run/exec.log`
- FE 日志：`.run/frontend.log`

常见问题：
- 端口占用：用 `make dev.cp-stop FORCE=1` / `make dev.exec-stop FORCE=1` 清理
- CP 只看到 `sql_agent`：确认 CP 启动时带了 `BOOTSTRAP_EXTRA_AGENTS=1`

## 5. 已知限制（当前版本）

- DeepAgents graph 在 LangGraph API 的 `/assistants/{id}/graph` 校验中返回 424（"Graph 'deep_agent' is not valid"）。
  - 为 unblock CP/FE 端到端验收，EP 中 `deep_agent` 暂时映射到 `sql_agent` graph。
  - 后续恢复 deep_agent 真正 DeepAgents 版本后，需要重新验证：interrupt/resume、plan 捕获、MCP rich resource。
