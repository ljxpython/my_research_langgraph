# Execution Plane 设计（LangGraph 编排与部署）

目标：Execution Plane 只负责“跑图 + 持久化 + streaming”，不承担平台语义（Auth/Tenant/审计/409 busy）。

你们已确认的开发模式：
- Graph 调试：本地 `langgraph dev` + `agent-chat-ui` 直连执行面
- 平台联调/上线：Docker 部署 LangGraph Agent Server（Redis + Postgres）

本文基于官方文档与官方模板总结推荐的编排方式（使用最新 LangGraph/LangChain）。

官方参考：
- Application structure（目录结构 + `langgraph.json`）：https://docs.langchain.com/oss/python/langgraph/application-structure
- LangGraph CLI（`langgraph dev/build/up` + `langgraph.json` keys）：https://docs.langchain.com/langsmith/cli
- Run a LangGraph app locally（`langgraph dev` 是 in-memory）：https://docs.langchain.com/langsmith/local-server
- Self-host standalone servers（Docker/Compose；REDIS_URI + DATABASE_URI）：https://docs.langchain.com/langsmith/deploy-standalone-server

---

## 1) 官方推荐的“应用编排方式”是什么？

官方推荐以一个 `langgraph.json` 作为应用配置入口，描述：

- `dependencies`：运行所需依赖（本地包路径或 Python 包名）
- `graphs`：对外暴露的 graph 列表（graph_id -> `./path/to/file.py:attr`）
- `env`：开发/本地调试使用的 `.env`（生产建议用部署环境注入）
- 其他可选项：`python_version`、`auth`、`http`、`store`、`checkpointer`、`webhooks` 等（见 CLI 文档）

官方应用结构示例（Python + pyproject）大致如下：

```
my-app/
  my_agent/
    utils/
      tools.py
      nodes.py
      state.py
    agent.py
  .env
  langgraph.json
  pyproject.toml
```

（来源：Application structure 文档）

---

## 2) 建议你们的 execution_plane/ 目录结构（主干实现）

结合你们 repo 的总体规划（前后端分离 + 两 Plane）以及未来“多 agent + MCP + skills”，建议主干 Execution Plane 放在：

```
execution_plane/
  langgraph.json             # 执行面应用入口（多 graph 暴露）
  pyproject.toml             # 执行面依赖（建议独立于 control_plane）
  .env.example
  src/
    ep/
      __init__.py

      # 每个 agent 一个 graph（已敲定）
      agents/
        sql_agent/
          __init__.py
          graph.py            # export: graph 或 make_graph
          state.py
          prompts.py
          tools.py
          README.md
        research_agent/
          ...
        vision_agent/
          ...

      # Skills（deepagents 标准）：目录 + SKILL.md + 可选脚本/资源
      # 你们已敲定：skills 目录叫 ep/skills/
      skills/
        langgraph-docs/
          SKILL.md
        sql-analysis/
          SKILL.md
          templates/
            ...
        mcp-web-search/
          SKILL.md

      # 跨 agent 共享能力（MCP/LLM 工厂/通用工具）
      shared/
        llm/
          factory.py
        mcp/
          client.py
          registry.py
        tools/
          http.py
          sql.py
          artifacts.py
        runtime/
          config.py
```

理由：
- 和官方推荐的“应用结构”��致，后续用 `langgraph build` / `langgraph up` 最顺。
- graph code 与工具/状态拆分，避免单文件无限膨胀。
- `agents/<agent>/` 形成天然边界：角色/提示词/工具/状态不会互相污染。
- `ep/skills/` 用 deepagents 标准沉淀可复用能力包，支持 progressive disclosure。
- MCP 接入集中在 `shared/mcp/`，避免每个 agent 各自连 MCP 造成失控。

---

## 3) `langgraph.json`：多图编排（graph_id -> import string）

官方 `graphs` 规范：

- value 形如 `./your_package/your_file.py:graph`
- `graph` 可以是已编译的 graph 变量，也可以是 `make_graph(config)` 工厂函数（用于运行时重建）

你们可用一个 `langgraph.json` 暴露多图：

```json
{
  "$schema": "https://langgra.ph/schema.json",
  "python_version": "3.13",
  "dependencies": ["."],
  "graphs": {
    "sql_agent": "./src/ep/agents/sql_agent/graph.py:graph",
    "vision_agent": "./src/ep/agents/vision_agent/graph.py:graph",
    "research_agent": "./src/ep/agents/research_agent/graph.py:graph"
  },
  "env": "./.env"
}
```

注：
- `python_version` 在 CLI 文档中支持 `3.11/3.12/3.13`。

---

## 4) dev vs docker：官方建议怎么区分？

### 4.1 `langgraph dev`（in-memory）

官方说明：`langgraph dev` 启动的是 Agent Server 的 in-memory 模式，适合开发与测试。

（来源：Run a LangGraph app locally 文档）

### 4.2 生产/联调：Docker Agent Server（持久化后端）

官方自托管 standalone server 文档明确：

- `REDIS_URI`：Redis 用作 pub-sub broker，支持后台 run 的实时 streaming
- `DATABASE_URI`：Postgres 用于 assistants/threads/runs/state/队列状态（exactly once）

你们的平台联调/上线可以按官方 compose 方式部署，并将该执行面作为 Control Plane 的一个 `execution_target`。

---

## 4.3 数据库与 Docker Compose 约定（你们的最终形态）

你们已敲定：
- 开发：graph 调试优先走 `langgraph dev`（in-memory，最快）
- 平台联调/生产：走 Docker Compose（LangGraph Agent Server + Redis + Postgres）

推荐拓扑（与 `docs/control-plane.md` 一致）：
- 一个 Postgres 实例（single instance）
  - `langgraph_db`：给 LangGraph Agent Server（执行面）
  - `control_plane_db`：给 Control Plane（平台元数据）
- 一个 Redis：给 LangGraph Agent Server（pub-sub broker）

执行面相关环境变量（LangGraph server 固定使用这些名字）：
- `DATABASE_URI=postgresql://.../langgraph_db`
- `REDIS_URI=redis://redis:6379/0`

官方说明（原因）：
- Redis 用于 pub-sub broker，支持后台 run 的实时 streaming
- Postgres 用于 assistants/threads/runs/state/队列状态（exactly once 语义）
  - 来源：Self-host standalone servers 文档

约定：
- `langgraph dev` 本地模式不强制依赖 Redis/PG（提升迭代速度）
- 真正联调/上线才启用 Redis/PG（与生产一致）

---

## 5) Execution Plane 的设计建议（与平台解耦）

### 5.1 graph 输入保持“可独立运行”

为了支持 `agent-chat-ui` 直连调试，graph 的最小输入闭环应仅依赖：
- `messages`（以及可选 `state/context/forwarded_props`）

不要让 graph 依赖 Control Plane 才能运行（tenant/权限/审计都在控制面）。

### 5.2 tool 组织方式

建议把 tools 组织为：
- agent 私有工具：`src/ep/agents/<agent>/tools.py`
- 共享工具：`src/ep/shared/tools/*.py`

并在 `tools.py` 中做“组合”：
- `shared.tools` + MCP tools + agent 特有工具
- 方便复用与测试
- 方便按 agent 组合工具白名单

### 5.3 checkpointer 的注意事项

你们走 Agent Server 形态时：
- 持久化由 server 统一负责（dev=in-memory；docker=redis/pg）

在“自包 FastAPI graph”这种模式下才需要你自己显式指定 checkpointer（但你们已经决定不走这条路）。

---

## 6) 与 Control Plane 的接口边界

Execution Plane 对外提供 LangGraph Agent Server API。
Control Plane 负责：
- auth/tenant/rbac
- agent registry 与 execution_target 路由
- 结构化 snapshot（AG-UI Message[]）
- 409 busy/cancel/audit

因此 Execution Plane 不需要知道：
- tenant_id/user_id
- busy 锁位/审计
- 前端 AG-UI 映射

---

## 7) Skills（deepagents 标准）如何抽象（你们的落地方式）

官方说明：skills 是“目录的集合”，每个 skill 目录包含一个 `SKILL.md`（frontmatter + 指令），并可附带脚本/模板/资源。

来源：
- https://docs.langchain.com/oss/python/deepagents/skills

你们的落地约定：
- skills 目录为 `src/ep/skills/`（已敲定）
- 每个 skill 是一个子目录，必须包含 `SKILL.md`
- skill 不直接存密钥；密钥来自 env 或由 Control Plane 注入

### 7.1 为什么 skills 要独立于 agent？

- skills 是“可复用能力包”，应该跨 agent 复用（例如 sql-analysis、report-writer、mcp-web-search）
- 通过 progressive disclosure 降低 token 消耗：只有当 prompt 触发 skill 时才读取详细内容

### 7.2 SKILL.md 模板（建议）

```md
---
name: sql-analysis
description: 用于 SQL 分析与结果解释的技能包，适合数据排障与报表生成。
---

# sql-analysis

## Overview
当用户问题需要查库/聚合/排名时使用本技能。

## Inputs
- 用户问题（自然语言）
- 可用表/字段信息（由工具返回）

## Steps
1. 先列出可用表
2. 再查 schema
3. 生成只包含必要列的 SQL
4. 执行 SQL
5. 解释结果并给结论

## Safety
- 禁止 DML（INSERT/UPDATE/DELETE/DROP）
- 输出前脱敏（如有 PII）
```

---

## 8) MCP 与 skills 的推荐结合方式

你们���来会有“多 agent + MCP + skills”，建议遵循：

- MCP 连接/认证/超时统一在 `src/ep/shared/mcp/`
- skills 只描述“什么时候用、怎么用、输出格式、安全约束”，不在 skill 里硬编码连接细节
- agent 在构建 tools 时从 `shared/mcp/registry.py` 取到工具集合

这样 MCP server 变更只改 registry，不会波及所有 agent。
