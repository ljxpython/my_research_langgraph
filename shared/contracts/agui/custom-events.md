# AG-UI CUSTOM 事件注册表（Phase-1）

本文档定义平台层 `CUSTOM` 事件的命名与 payload 约定。

原则：
- 标准事件（RUN/TEXT_MESSAGE/TOOL_CALL/STATE/STEP）遵循 AG-UI。
- 平台扩展必须使用 `CUSTOM`，并且 **只增不删**。

## 1) interrupt（HITL）

- `type`: `CUSTOM`
- `name`: `interrupt`

payload 建议字段：

```json
{
  "interruptId": "i-...",
  "title": "Approval Required",
  "description": "Please approve the action",
  "schema": {},
  "resumeHint": {}
}
```

说明：
- 前端收到该事件后，应弹出表单/对话框收集用户输入。
- resume 通过 `forwarded_props.command.resume` 回传（见 `shared/contracts/http/examples/resume.request.json`）。

## 2) 平台命名空间（预留）

命名规则：

- `name: platform.<domain>.<action>`

建议预留：
- `platform.auth.denied`
- `platform.quota.exceeded`
- `platform.rate_limited`
- `platform.billing.usage`

## 3) plan（任务规划 / ToDo）

用途：让前端以“结构化任务列表”的形式展示 agent 的计划，并允许后续扩展为人机协作（勾选/禁用步骤、审批后继续等）。

- `type`: `CUSTOM`
- `name`: `plan`

payload 建议字段：

```json
{
  "planId": "plan_01J...",
  "title": "生成测试报告",
  "items": [
    {"id": "t1", "title": "收集环境信息", "status": "pending"},
    {"id": "t2", "title": "运行测试套件", "status": "pending"},
    {"id": "t3", "title": "生成并上传报告", "status": "pending"}
  ]
}
```

说明：
- `items[].status` 推荐取值：`pending`/`in_progress`/`completed`/`cancelled`。
- v1 仅规定“展示”，不规定前端回传修改。

## 4) deep_agents（子代理/多技能工作流）

用途：当执行面内部启用 deepagents/多子代理协作时，让前端能够展示子任务的来龙去脉（谁在做、在做什么、产出是什么）。

- `type`: `CUSTOM`
- `name`: `deep_agents`

payload 建议字段：

```json
{
  "agents": [
    {"id": "research", "name": "Research", "status": "running", "summary": "检索最佳实践"},
    {"id": "runner", "name": "Runner", "status": "idle"}
  ]
}
```

## 5) mcp（MCP 调用与可视化内容）

用途：将 MCP tool 的调用过程与结果以可渲染的形式暴露给前端，支持表格/图标/markdown 等 rich content。

- `type`: `CUSTOM`
- `name`: `mcp`

payload 建议字段：

```json
{
  "serverId": "mcp_chart_server",
  "toolName": "render_table",
  "toolCallId": "call_01J...",
  "phase": "result",
  "content": {
    "mimeType": "text/html+mcp",
    "resourceUri": "mcp://mcp_chart_server/ui/table/abc123",
    "title": "Top Failures",
    "fallbackMarkdown": "|case|status|\n|---|---|\n|...|...|"
  }
}
```

说明：
- `mimeType`/`resourceUri` 对齐 MCP Apps（SEP-1865）思路：前端可通过 CP 代理拉取 `resourceUri` 对应资源。
- v1 推荐必须提供 `fallbackMarkdown`，保证没有 UI 渲染器时也能降级显示。

## 6) reasoning_summary（推理摘要）

用途：展示“可公开”的推理摘要（关键决策点），不展示 raw chain-of-thought。

- `type`: `CUSTOM`
- `name`: `reasoning_summary`

payload 建议字段：

```json
{
  "summary": "我将先生成计划，然后调用工具检索信息，最后产出报告并生成图表。",
  "highlights": [
    "需要先确认数据源与范围",
    "生成报告后通过 artifacts 提供下载"
  ]
}
```
