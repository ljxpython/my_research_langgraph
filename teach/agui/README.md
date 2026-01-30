# AG-UI 教学文档

目标：帮助你在“不改变现有平台方案”的前提下，理解 AG-UI 是什么、解决什么问题，以及未来如果要引入它（或做兼容）应该怎么做。

你当前的倾向是“工作量少、不重复造轮子”，这份文档也会围绕这个目标解释取舍。

## 阅读顺序（建议）

1) `teach/agui/01-overview.md`
2) `teach/agui/02-protocol-and-events.md`
3) `teach/agui/04-langgraph-integration.md`
4) 需要动手时再看 `teach/agui/03-fastapi-sse-server.md`
5) 遇到问题查 `teach/agui/05-pitfalls.md`
6) 最小可跑 demo：`teach/agui/06-mini-demo.md`
7) 真实调用 demo（SQL agent）：`teach/agui/07-sql-agent-demo.md`
8) Dojo 直连 FastAPI：`teach/agui/08-dojo-connect.md`

## 本仓库内的“可对照”示例

- AG-UI + LangGraph（Python）事件翻译与 SSE endpoint：
  - `examples/ag-ui/integrations/langgraph/python/ag_ui_langgraph/agent.py`
  - `examples/ag-ui/integrations/langgraph/python/ag_ui_langgraph/endpoint.py`
- LangGraph 原生 SDK（agent-chat-ui）：
  - `examples/agent-chat-ui/src/providers/Stream.tsx`

## 一句话定位

- LangGraph SDK：一套“面向 LangGraph Agent Server API”的客户端协议与工具。
- AG-UI：一套“面向前端交互（消息/工具/状态/步骤/中断）”的事件协议。

两者并不等价，也不是互相替代关系；要共存需要明确“谁对前端提供契约”。
