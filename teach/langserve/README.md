# LangServe 教程（动手向）

目标：把一个 LangChain runnable/chain 用 LangServe 暴露成 HTTP API，并理解：

- `/invoke` vs `/stream` 的区别
- playground 怎么用
- 如何在一次请求里动态切模型/温度等参数（`configurable`）
- 如何从请求头注入 per-request 配置（例如 API key）

提醒：本仓库的主干执行面是 **LangGraph Agent Server**（见 `execution_plane/README.md`）。

- LangServe 更像“把 runnable 变成 API”。
- LangGraph Agent Server 更像“带 threads/runs/persistence 的 agent runtime”。

本教程是为了让你能读懂/评估 LangServe，并能在需要时把它作为“内部子服务”接入到 LangGraph 里。

## 阅读顺序（建议）

1) `teach/langserve/01-quickstart.md`
2) `teach/langserve/02-invoke-stream-playground.md`
3) `teach/langserve/03-configurable-model-switch.md`
4) `teach/langserve/04-per-request-config-modifier.md`
5) `teach/langserve/05-compare-with-langgraph-agent-server.md`

## 可运行 demo

- `teach/langserve/demo_min_server/server.py`
