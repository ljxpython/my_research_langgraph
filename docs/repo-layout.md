# 代码仓库目录规划（前后端分离 + 双 Plane）

目标：把“调研/示例”与“主干实现”严格分离，方便中台平台化长期演进。

## 1. 顶层目录（规划）

说明：
- `examples/` 保留用于调研与外部仓库参考，不作为主干实现依赖。
- 主干实现新增三块：`frontend/`、`control_plane/`、`execution_plane/`。

```
repo/
  docs/                     # 平台化设计与契约（你们已在使用）
  shared/                   # 跨前后端共享的契约资产（JSON 示例、错误码表、CUSTOM 事件注册表）
  teach/                    # 教学/学习用文档与最小 demo
  examples/                 # 调研期示例代码/外部仓库参考（保留）

  frontend/                 # 前端（Ant Design Pro，中台壳 + Agent Workbench）
  control_plane/            # 控制面（FastAPI Gateway，平台核心）
  execution_plane/          # 执行面（LangGraph graphs + 本地 dev + Docker 部署配置）
```

## 2. frontend/（Ant Design Pro）

定位：中台壳（layout/auth/menu/CRUD） + Agent Workbench（消费 AG-UI 协议）。

建议结构：

```
frontend/
  config/                   # routes/menu/proxy 等
  src/
    pages/                  # agents/ threads/ workbench/ user/login
    services/               # 对接 control_plane 的 API client（Bearer token，错误码处理）
    agui/                   # AG-UI 对接层：HttpAgent + event store + UI components
    utils/
```

原因：
- 让“协议对接层（agui/）”独立于页面，便于未来替换 UI 框架仍复用核心逻辑。

## 3. control_plane/（FastAPI Gateway）

定位：平台核心（鉴权/租户/授权、agent registry、409 并发约束、cancel、snapshot、审计）。

约定：
- Python：3.13
- 环境/依赖管理：uv
- 包名：`gateway/`（避免与 examples 中的 `app/` 混淆）

建议结构：

```
control_plane/
  gateway/
    main.py                 # FastAPI app
    settings.py             # 配置（CORS、JWT、LangGraph URL、DB）
    routers/                # /v1/auth /v1/me /v1/agents /v1/threads /:run /:cancel /snapshot
    services/               # 业务规则（并发、snapshot 结构化、HITL 语义）
    adapters/               # LangGraph server 适配（SDK/HTTP）
    repos/                  # DB 访问（元数据、锁位、审计）
    db/                     # ORM models + migrations
    schemas/                # Pydantic 请求/响应/错误码（对齐 shared/ 示例）
    middleware/             # CORS / request_id / logging
  tests/
```

原因：
- router 薄、service 厚、adapter 隔离外部依赖、repo 专注存取；这是业界最稳的可维护结构之一。

## 4. execution_plane/（LangGraph）

定位：执行面只跑图，不承载平台鉴权/租户/审计逻辑。

开发/部署策略：
- 本地调试：`langgraph dev`
- 上线：Docker（LangGraph Agent Server + Postgres + Redis）

建议结构：

```
execution_plane/
  langgraph.json            # 多 graph 暴露入口（LangGraph CLI）
  pyproject.toml            # 执行面依赖
  .env.example
  src/
    ep/
      agents/               # 每个 agent 一个 graph（已敲定）
      skills/               # deepagents skills（ep/skills）
      shared/               # MCP/LLM 工厂/共享工具
```
