# teach/

这个目录用于放“教学/科普/实践指南”类文档，目标是让团队成员能快速上手，并能把概念映射到本仓库内的可运行示例。

目录结构（当前）：

```
teach/
  agui/
    README.md                  AG-UI 教学入口
    01-overview.md             概念与定位
    02-protocol-and-events.md  协议与事件模型
    03-fastapi-sse-server.md   FastAPI + SSE 的最小服务实现
    04-langgraph-integration.md 与 LangGraph 的集成方式与取舍
    05-pitfalls.md             常见坑与工程化注意事项
    06-mini-demo.md             最小可跑 demo（不接 LLM）
    07-sql-agent-demo.md        真实调用 demo（复用 SQL agent）
    demo_min_server/            最小 demo 代码（FastAPI + SSE）
    demo_sql_agent/             真实 demo 代码（SQL agent + LLM）
```

约定：
- 面向人的内容（文档）使用中文；代码/标识符保留英文。
- 文档要尽量引用本仓库内的示例路径，避免“只讲概念不落地”。
