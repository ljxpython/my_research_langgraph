# Execution Plane（执行面）

## 仓库状态说明

- `execution_plane/` 这部分执行面、LangGraph Agent Server 接入和 SQL Agent 验证方案，已经整合进 [ai-agent-test-platform](https://github.com/ljxpython/ai-agent-test-platform)。
- 当前目录下这份实现主要保留为历史方案参考，不再作为主线模块持续维护。
- 如果要继续推进执行面开发、运行时治理或正式环境集成，请直接以 `ai-agent-test-platform` 为准。

定位：执行面只负责“跑图 + streaming + 持久化”（LangGraph Agent Server）。

- 不做：鉴权/租户/RBAC、审计、对外协议收口（这些属于 Control Plane）。
- 对外开放策略：生产环境不建议对终端用户开放 Execution Plane；只允许 Control Plane 以服务身份调用。

## Phase 1：SQL Agent 验证

本目录以 `sql_agent` 作为一期验证用例。

- graph id：`sql_agent`
- 入口配置：`execution_plane/langgraph.json`

## 本地运行（dev / in-memory）

1) 配置环境变量（建议复制示例）：

```bash
cp execution_plane/.env.example execution_plane/.env
```

2) 启动执行面：

```bash
cd execution_plane
langgraph dev --host 127.0.0.1 --port 8123 --no-browser
```

3) 调试 graph（内部调试）：用 `agent-chat-ui` 直连 `http://127.0.0.1:8123`。

## 与 Control Plane 联调

Control Plane 通过环境变量指向执行面：

- `LANGGRAPH_API_URL=http://127.0.0.1:8123`

一期默认会在 Control Plane bootstrap 时创建 `agent_id=sql_agent`，并映射到 `graph_id=sql_agent`。

## SQL 数据源

默认策略：
- 如果存在 `Chinook.db`（本目录或 `examples/docker_single/` 下），SQL Agent 会优先使用它。
- 否则会在 `execution_plane/.data/sql_agent_demo.db` 自动生成一个小型 demo SQLite DB（用于快速验证链路）。

如需指定自己的数据库：设置 `SQL_AGENT_DB_URI`（支持任意 SQLAlchemy URI）。
