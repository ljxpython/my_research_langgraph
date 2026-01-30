# 08 - 用官方 Dojo 直连本地 FastAPI AG-UI Server

目标：用 AG-UI 官方前端 Dojo（Next.js）直接连接你本地的 FastAPI `/agent`，形成一条更“真实产品”形态的链路：

前端（Dojo） -> AG-UI SDK（HttpAgent） -> FastAPI（SSE /agent 或 /） -> LangGraph（SQL agent）

本仓库已做的改动：

- Dojo 新增一个集成项：`Teach: SQL Agent (FastAPI)`
  - `examples/ag-ui/apps/dojo/src/menu.ts`
  - `examples/ag-ui/apps/dojo/src/agents.ts`
  - `examples/ag-ui/apps/dojo/src/env.ts`
- 你的 FastAPI demo 已支持：
  - CORS（允许 Dojo 的 3000/9999 端口跨域访问）
  - `POST /` 作为 `POST /agent` 的别名（Dojo/HttpAgent 常用 root URL）
  - 兼容 snake_case / camelCase 的输入字段（Dojo 会发 camelCase）

## 1. 先启动后端（FastAPI + LangGraph）

用你真实 SQL agent demo：

```bash
python -m venv .venv
source .venv/bin/activate

pip install -e .
pip install -r teach/agui/demo_sql_agent/requirements.txt

# 默认读取 examples/docker_single/.env
python teach/agui/demo_sql_agent/server.py
```

确认后端可用：

```bash
curl -s http://127.0.0.1:8000/healthz
```

## 2. 启动官方 Dojo（前端）

Dojo 在本仓库的 vendored 路径里：`examples/ag-ui/`。

先安装依赖并构建 Dojo：

```bash
cd examples/ag-ui

# 第一次需要安装
pnpm i

# 只构建 dojo（官方 README 推荐这么做）
pnpm build --filter=demo-viewer
```

然后启动 Dojo：

```bash
cd apps/dojo

# 关键：让 Dojo 知道你的本地 AG-UI server 地址
TEACH_SQL_AGENT_URL=http://127.0.0.1:8000/agent pnpm dev
```

打开：

- `http://localhost:3000`

## 3. 在 Dojo 里选择你的后端

在 Dojo 左侧菜单选择：

- `Teach: SQL Agent (FastAPI)`
- Feature 选择：`agentic_chat`

然后输入问题（例如：
`Which genre on average has the longest tracks?`）

你应该能看到：
- 流式回答（TEXT_MESSAGE_CONTENT）
- 工具调用事件（SQL tools）
- step/state 等事件（取决于图的行为）

## 4. 常见问题

### 4.1 CORS 报错

如果浏览器控制台报跨域：
- 确认你是从 `teach/agui/demo_sql_agent/server.py` 启动的服务（它已经加了 CORS）
- 如果你改了端口（非 3000/9999），需要在 `teach/agui/demo_sql_agent/server.py` 里把新端口加入 allow_origins

### 4.2 Dojo 连上了但没流式输出

AG-UI HttpAgent 通过 `Accept: text/event-stream` 读取 SSE。

- 确认后端返回的 `Content-Type` 是 `text/event-stream`
- 确认你没有把请求通过某个会 buffer 的代理转发

## 5. 对照：Dojo 连接的是什么类型的 Agent？

这里 Dojo 用的是最通用的 `HttpAgent`（来自 `@ag-ui/client`），会对任意 AG-UI SSE server 生效。

你可以在 `examples/ag-ui/apps/dojo/src/agents.ts` 里看到：

- `agentic_chat: new HttpAgent({ url: envVars.teachSqlAgentUrl })`

这也是“Dojo 直连 FastAPI /agent”的最小形态。
