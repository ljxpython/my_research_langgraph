# MCP 与 Rich UI（表格/图标/Markdown）落地指南

目标：在不破坏本仓库“双 Plane + 契约优先”的框架下，让 Workbench 前端能正确展示：

- 工具调用（tool calls）
- 思考/推理提示（thinking，注意安全与脱敏）
- 计划/ToDo（plan）
- deep agents（子代理/多技能协作）
- MCP 调用与可视化内容（表格/图标等）
- 测试报告产物（artifact 下载）
- 支持打断与人机交互（interrupt/resume）

## 1. 总体原则（必须遵守）

1) 前端不直连 Execution Plane
- 生产对外只暴露 Control Plane（Gateway）。
- 前端所有 SSE/资源下载都经由 CP。

2) 契约优先
- 标准事件：优先用 AG-UI 标准事件（RUN/TEXT_MESSAGE/TOOL_CALL/STATE/STEP）。
- 平台扩展：一律走 `CUSTOM`（见 `shared/contracts/agui/custom-events.md`）。

3) Rich content 必须可降级
- 任何需要复杂渲染的内容必须提供 `fallbackMarkdown` 或可读的纯文本。
- 前端缺少某种渲染器时，不应导致页面不可用。

## 2. MCP 选型与集成路径

你们本次指定：使用 `examples/docker_single` 中的“生成表格的 MCP 工具”。

### 2.1 在 Execution Plane 集成 MCP

执行面应通过 `langchain-mcp-adapters`（示例：`examples/docker_single/app/tools.py`）构造 MCP tools，然后将 MCP tools 作为 agent tools 的一部分。

建议：将 MCP client/registry 统一收敛在 `execution_plane/src/ep/shared/mcp/`，避免每个 agent 自己连接 MCP。

### 2.2 事件与渲染：推荐模型

执行面调用 MCP tool 时，Control Plane 侧应把该过程映射为：

1) AG-UI `TOOL_CALL_*` 事件（通用可观测：tool name/args/result）
2) 如 MCP 工具返回 UI 资源（SEP-1865 风格），再额外发一条 `CUSTOM name=mcp`，携带：
- `mimeType: text/html+mcp`
- `resourceUri: mcp://...`
- `fallbackMarkdown: ...`

前端收到后：
- 优先用 `resourceUri` 拉取并渲染（通过 CP 代理），
- 否则展示 `fallbackMarkdown`。

## 3. 协议落点（CP 对前端的“冻结面”）

### 3.1 计划/ToDo

`CUSTOM name=plan`，payload 结构见：
- `shared/contracts/agui/custom-events.md`
- `shared/contracts/http/examples/custom.plan.event.json`

### 3.2 MCP rich content

`CUSTOM name=mcp`，payload 结构见：
- `shared/contracts/agui/custom-events.md`
- `shared/contracts/http/examples/custom.mcp.event.json`

### 3.3 报告下载

强烈建议用平台现有 artifacts 机制：
- 执行面生成报告文件 -> 由 CP 存储并登记 artifact（或走直传）
- 前端通过 `GET /v1/artifacts/{artifact_id}/download` 下载

## 4. 安全边界（不要踩坑）

- 不允许前端传任意 URL 让执行面下载（SSRF）。
- MCP 资源必须通过 CP 代理读取；CP 对 `resourceUri` 做白名单/校验。
- “思考链路”只允许输出经过脱敏与摘要化的内容（避免泄露系统 prompt/密钥/内部推理细节）。

## 5. 联调验证清单（必须跑通）

1) CP SSE：能看到 TOOL_CALL_START/RESULT，以及 CUSTOM(plan/mcp)
2) 前端：
- 工具调用可折叠查看参数/结果
- plan/ToDo 面板能展示状态
- MCP 表格内容能渲染（或 fallback markdown）
- artifact 下载可用
3) interrupt/resume：
- 中断事件可弹窗
- 恢复后继续同一 thread
