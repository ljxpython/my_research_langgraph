# 02 - 协议与事件模型（RunAgentInput + SSE Events）

## 1. 传输层：HTTP + SSE

最常见的 AG-UI server 形态是：

- `POST /`（或 `/agent/...`）
- request body 是 `RunAgentInput`
- response 是 SSE（Server-Sent Events）

SSE 的本质：服务端不断 `yield` 一段段文本帧，客户端按 `event:` / `data:` 解析为事件。

在 AG-UI 里，事件数据（data）通常是 JSON。

## 2. 请求体：RunAgentInput 的思维方式

你可以把 `RunAgentInput` 当作“发起一次 run 的上下文”——它至少要解决：

- 我在跟谁聊？（thread_id）
- 这次 run 的标识是什么？（run_id）
- 用户说了什么？（messages）
- 前端当前状态是什么？（state / context，可选）
- 前端声明了哪些工具（UI 工具/前端执行工具）？（tools，可选）
- 如果这是一次 resume（中断恢复），恢复输入是什么？（通常在 forwarded_props 里）

工程建议：
- 在平台侧统一生成 `thread_id` / `run_id` 并回传，作为审计主键。
- 前端传入的 `thread_id` 只当作“续聊意图”，最终以平台校验为准。

## 3. 响应：事件序列（最小闭环）

一个最小可用的事件序列是：

1) `RUN_STARTED`
2) 若干 `TEXT_MESSAGE_*`（流式内容）
3) `RUN_FINISHED` 或 `RUN_ERROR`

强交互场景会穿插更多事件：
- 工具：`TOOL_CALL_*`
- 状态：`STATE_SNAPSHOT` / `STATE_DELTA`
- 步骤：`STEP_STARTED` / `STEP_FINISHED`
- 中断：`CUSTOM`（或者 AG-UI 对 interrupt 的约定事件）

## 4. 与 LangGraph 事件的映射（为什么需要“翻译器”）

LangGraph 自身也有 streaming event（例如 `astream_events` 输出的一系列事件），但它的事件结构是“执行框架内部视角”。

AG-UI 的事件是“UI 视角”。

因此通常会有一个“翻译器”，把 LangGraph 的事件流映射成 AG-UI 的事件流。

本仓库的参考实现：
- `examples/ag-ui/integrations/langgraph/python/ag_ui_langgraph/agent.py`
  - 这份代码做了大量事件映射：message、tool call、state snapshot/delta、interrupt 等。

## 5. 你需要重点关注的事件（平台化强交互）

如果你们 Phase-1 目标是强交互，建议优先验证以下能力：

- 状态同步：`STATE_SNAPSHOT` / `STATE_DELTA`
  - UI 侧能稳定渲染侧边栏/表单/流程状态
- HITL：interrupt -> 用户输入 -> resume
  - 中断必须有可序列化的 payload，并且能映射到 thread 的 checkpoint
- 工具调用生命周期：start/args/end/result
  - 用于“前端工具渲染”或“前端执行工具”
