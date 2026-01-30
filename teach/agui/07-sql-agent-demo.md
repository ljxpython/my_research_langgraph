# 07 - 真实 Demo：复用 SQL Agent（真实调用 LLM）做一个 AG-UI Server

目标：用你现成的 `examples/docker_single/app/sql_agent.py` 思路，做一个“真实调用”的 AG-UI SSE server。

区别：
- 为了把 demo 控制在“最小学习成本”，我们 **不引入** `get_mcp_server_chart_tools()`（它会启动 `npx` 子进程，学习阶段容易踩坑）。
- DB ��件直接复用 `examples/docker_single/Chinook.db`（不存在时才下载）。

代码位置：
- `teach/agui/demo_sql_agent/server.py`
- `teach/agui/demo_sql_agent/sql_agent_graph.py`

## 0. 前置条件

### 0.1 准备 .env（你提到的做法）

你仓库里已有：`examples/docker_single/.env`

这个 demo 默认会读取它（不需要你复制），也支持你自己复制到任意位置：

- 默认：读取 `examples/docker_single/.env`
- 自定义：设置 `ENV_FILE=/path/to/.env`

`.env` 至少需要包含：

- `ZHIPUAI_API_KEY=...`

## 1. 安装依赖

建议复用本项目依赖（`langgraph/langchain/...` 已在 `pyproject.toml` 里）。

一种常见方式：

```bash
python -m venv .venv
source .venv/bin/activate

pip install -e .
pip install -r teach/agui/demo_sql_agent/requirements.txt
```

## 2. 启动服务

```bash
python teach/agui/demo_sql_agent/server.py
```

启动后打开浏览器：

- `http://127.0.0.1:8000/`

这是一个“零前端工具链”的最小页面，用来演示：

前端（HTML/JS） -> AG-UI（SSE events） -> FastAPI（/agent） -> LangGraph（SQL agent）

（可选）指定 .env：

```bash
ENV_FILE=examples/docker_single/.env python teach/agui/demo_sql_agent/server.py
```

健康检查：

```bash
curl -s http://127.0.0.1:8000/healthz
```

## 3. 发起一次真实对话（curl 观察 SSE）

```bash
curl -N \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{
    "thread_id": "t-sql-1",
    "run_id": "r-sql-1",
    "messages": [
      {"id":"m-user-1","role":"user","content":"Which genre on average has the longest tracks?"}
    ]
  }' \
  http://127.0.0.1:8000/agent
```

你会看到：
- `RUN_STARTED`
- `STEP_*`（节点/步骤）
- `TOOL_CALL_*`（SQL 工具调用与参数）
- `TEXT_MESSAGE_*`（最终回答流式输出）
- `MESSAGES_SNAPSHOT` / `STATE_SNAPSHOT`
- `RUN_FINISHED`

说明：
- 为了让学习更顺滑，这个 demo 的 `/agent` 端点允许你只传 `messages`（以及可选的 `thread_id` / `run_id`）。
- `state/tools/context/forwarded_props` 会在服务端补默认值。

## 4. 对照原例子

原例子：`examples/docker_single/app/sql_agent.py`

本 demo 的 graph 构建逻辑在：`teach/agui/demo_sql_agent/sql_agent_graph.py`

核心复用点：
- `SQLDatabaseToolkit(db=db, llm=get_zhipu_model())`
- `create_agent(llm, tools, system_prompt=...)`

主要差异点（为了教学与稳定性）：
- 显式传 `checkpointer=MemorySaver()`（让 thread_id 有意义）
- 不引入 MCP chart tools（避免引入 Node/npm 变量）
