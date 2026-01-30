# 04 - 与 LangGraph 的集成方式（以及如何少造轮子）

## 1. 两种集成路径

### 路径 A：AG-UI 前端直接连接 LangGraph deployment（推荐最省事）

做法：
- 执行面继续是 LangGraph Agent Server
- 前端使用 AG-UI 的 LangGraph 适配器（例如 `@ag-ui/langgraph`）
- 平台 Gateway 只做鉴权/路由（可以通过反向代理控制访问）

优点：
- 不需要你自建 threads/runs/persistence
- 不需要你手写 LangGraph event -> AG-UI event 的翻译

证据（仓库内 README）：
- `examples/ag-ui/integrations/langgraph/typescript/README.md`

里面的要点：
- `LangGraphAgent({ graphId, deploymentUrl, langsmithApiKey })`
- 支持 state management / interrupt handling / step tracking

### 路径 B：自建 FastAPI 包 graph（你自己是执行面）

做法：
- 你自己把 graph 编译出来并提供 endpoint
- 自己选 checkpointer（SQLite/Postgres等）
- 自己实现 threads/runs 的语义（最少要保证 thread_id + checkpoint 能恢复）
- 自己把 LangGraph 事件流翻译成 AG-UI

优点：
- 完全可控（协议、存储、鉴权都在你手上）

缺点：
- 工作量明显上升（而且“坑点”大多是工程问题，不是业务问题）

## 2. 与 LangGraph SDK 的关系：不要硬兼容

LangGraph SDK 客户端只适用于 LangGraph Agent Server API。

如果你输出的是 AG-UI events，就应该使用 AG-UI 客户端/组件来消费。

结论：
- 对前端暴露的协议二选一（LangGraph API 或 AG-UI）。
- 若要同时支持两种前端，建议提供两个入口：
  - `/api/langgraph/*`：透明代理 LangGraph API（给 LangGraph SDK 用）
  - `/api/agui/*`：AG-UI SSE（给强交互 UI 用）

## 3. 你们当前“少造轮子”的推荐组合

如果你现在主要目标是“最少工作量 + 先平台化起来”：

1) 执行面：LangGraph Agent Server（自托管）
2) 存储：Redis + Postgres（按照官方 server 的要求）
3) Gateway（FastAPI）：
   - 负责鉴权/租户/路由
   - 对外先提供 LangGraph API 代理（最省事）
4) AG-UI：先学习/验证，但不急着变更主链路

当你们 UI 确认需要强交互，再评估是否引入 AG-UI 路径 A。
