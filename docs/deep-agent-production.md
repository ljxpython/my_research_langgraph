# Deep Agent 生产化落地（EP 执行 / CP 翻译 / 前端展示）

本文件把官方 DeepAgents 文档的关键能力（planning / filesystem / subagents / skills / HITL / reasoning）落到本仓库的双 Plane 框架中。

适用链路：

前端（AG-UI Workbench） -> Control Plane（FastAPI Gateway, SSE/AG-UI） -> Execution Plane（LangGraph Agent Server, DeepAgents）

## 1. 官方能力对照表

来源：
- DeepAgents overview: https://docs.langchain.com/oss/python/deepagents/overview
- Middleware: https://docs.langchain.com/oss/python/deepagents/middleware
- Skills: https://docs.langchain.com/oss/python/deepagents/skills
- Human-in-the-loop: https://docs.langchain.com/oss/python/deepagents/human-in-the-loop
- Reasoning（模型输出块）：https://docs.langchain.com/oss/python/langchain/models#reasoning

| 能力 | 官方含义 | 本仓库落点（最佳实践） |
|---|---|---|
| Planning / ToDo | `TodoListMiddleware` 提供 `write_todos` | EP 侧启用 TodoListMiddleware；CP 侧把 ToDo 以 `CUSTOM name=plan` 事件推给前端（只展示，不让前端写回） |
| Filesystem | `FilesystemMiddleware` 提供 `ls/read_file/write_file/edit_file`；可用 StoreBackend 持久化 `/memories/` | EP 侧默认使用 StateBackend（线程内），需要跨线程记忆则用 CompositeBackend 路由 `/memories/` 到 StoreBackend；CP/前端只展示文件列表/变更摘要（避免泄露敏感文件） |
| Subagents | `SubAgentMiddleware` 提供 `task` 工具，可定义 subagent（name/desc/prompt/tools/model/middleware） | EP 侧定义一组“生产化 subagents”（research/runner/report_writer 等）；CP 侧映射为 `CUSTOM name=deep_agents`（状态、摘要、产出） |
| Skills | skills 目录 + `SKILL.md`（progressive disclosure） | EP 侧维护 `execution_plane/src/ep/skills/<skill>/SKILL.md`，并在 deep_agent 创建时指向 skills 目录；skills 不由前端传入 |
| HITL | `interrupt_on` + checkpointer；interrupt 产出 `__interrupt__`，resume 用 `Command(resume=...)` | EP 侧用 `interrupt_on` 控制敏感工具；CP 侧将 `__interrupt__` 映射为 AG-UI `CUSTOM name=interrupt`，前端通过 `forwarded_props.command.resume` 回传 |
| Reasoning | 部分模型会在 stream 里输出 reasoning block（与 tool/text block 同级） | 只展示“摘要 reasoning”，禁止原样展示 CoT；EP 侧将 reasoning block 归一化为 `CUSTOM name=reasoning_summary` 或 state.debug（仅 dev） |

## 2. 边界与安全（必须写死）

1) 密钥只存在于服务端 `.env`
- 前端不持有模型、LangSmith、MCP 的密钥。

2) 不在前端展示 raw chain-of-thought
- 只展示 reasoning summary（模型提供或 EP 摘要化）。

3) Skills 与 filesystem 是“能力包”，不是“前端可注入配置”
- 防止注入：skills 路径、文件内容、工具集都由 EP/CP 控制。

4) HITL 必须有 checkpointer
- 官方明确：checkpointer 是必需条件（MemorySaver 仅用于 dev）。

## 3. 生产化实现建议（最小闭环）

### 3.1 Execution Plane（DeepAgent Graph）

目标：新增 `deep_agent` graph（与 `sql_agent` 并列），使用 `create_deep_agent`，并显式启用：
- skills 目录
- `interrupt_on`（对高风险工具开启）
- 必要的 middleware 约束（限次/裁剪/上下文治理）

官方 middleware 默认会在 `create_deep_agent` 内自动附加：
- `TodoListMiddleware`
- `FilesystemMiddleware`
- `SubAgentMiddleware`

来源：https://docs.langchain.com/oss/python/deepagents/middleware

仓库落点：
- graph：`execution_plane/src/ep/agents/deep_agent/graph.py`
- skills：`execution_plane/src/ep/skills/`

配置建议（env）：
- `EP_DEEP_AGENT_ENABLE_HITL=1` 开启审批
- `EP_ENABLE_MCP_CHART=1` 开启 @antv/mcp-server-chart

### 3.2 Control Plane（事件翻译）

目标：从 LangGraph 的 streaming events 中提取：
- tool call lifecycle（TOOL_CALL_START/ARGS/RESULT/END）
- interrupts（`__interrupt__`）
- custom（plan/deep_agents/mcp/reasoning_summary）

并映射为 AG-UI SSE。

### 3.3 Frontend（DeepAgent Workbench）

目标：提供一个“与智能体交互”的工作台页：
- Chat（文本流）
- Plan（ToDo）
- Tools（工具调用记录）
- Reasoning（摘要）
- MCP（表格/图标，必要时降级 markdown）
- Artifacts（报告下载）
- HITL（interrupt modal -> resume）

备注：前端只做展示与交互，不参与执行。

仓库落点：
- 路由：`frontend/config/routes.ts`
- 页面：`frontend/src/pages/deep-agent/workbench.tsx`
