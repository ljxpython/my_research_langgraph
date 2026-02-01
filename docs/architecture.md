# 总体架构

目标：构建“真正的平台”，而不是某个 UI 直连某个图。

## 1. 分层：Execution Plane vs Control Plane

### Execution Plane（执行面）

职责：
- 运行 LangGraph graphs（状态机/子图/中断点）
- 负责线程状态（thread）、checkpoint、持久化（Redis/Postgres 等）
- 对外提供事件流（streaming）与线程查询能力

现有实现位置：
- `execution_plane/langgraph.json`

### Control Plane（控制面 / 平台核心）

形态：自建 **Platform Gateway（Python/FastAPI）**

职责（平台化必须项）：
- 鉴权：用户 token -> 平台身份（user/tenant/org/project）
- 授权：允许访问哪些 deployment/graph/tool/model
- 路由：把一次对话映射到具体 LangGraph deployment + graphId（以及 region/版本）
- 配额与限流：按 tenant/project/user 维度
- 审计：记录“谁在什么时间对哪个 agent 做了什么请求/执行了什么工具”
- 观测：请求链路 trace_id、LangSmith/自建 metrics、事件采样
- 协议收口：对前端输出稳定契约（推荐 AG-UI），对后端适配不同引擎（LangGraph 先行）

实现级设计详见：
- `docs/control-plane.md`

## 2. 为什么前端协议层建议用 AG-UI

平台化的 UI 需求通常包含：
- 流式消息（partial token）
- 工具调用生命周期（start/args/end/result）
- 状态同步（snapshot + delta/patch）
- 人在回路（interrupt + resume）
- 步骤/节点可视化（step start/finish）

这些在 AG-UI 里是“协议原语”，而不是某个 SDK 的私有回调。

本仓库内已经有 LangGraph -> AG-UI 的参考实现：
- `examples/ag-ui/integrations/langgraph/python/ag_ui_langgraph/agent.py`
- `examples/ag-ui/integrations/langgraph/python/ag_ui_langgraph/endpoint.py`

## 2.1 AG-UI 与 LangGraph SDK 的兼容边界（很关键）

结论：**AG-UI 与 LangGraph SDK 不是同一套协议，不能“互相完美替换”。**

- LangGraph SDK（例如 `@langchain/langgraph-sdk`）面向的是 **LangGraph Agent Server 的 HTTP API**（/info、threads、runs、stream 等）。
- AG-UI 面向的是 **事件协议（SSE/WS 等传输上的标准 event 序列）**。

因此：
- 你不能用 LangGraph SDK 直接连接一个“只输出 AG-UI events 的自建 FastAPI 服务”。
- 你也不能让 AG-UI 前端直接消费 LangGraph SDK 的事件格式，除非做适配。

可行的“少造轮子”方式，是引入适配层，而不是强行兼容：
- **前端选 AG-UI**：使用 `@ag-ui/langgraph`（AG-UI 的 LangGraph client 适配器）去连接 LangGraph deployment。
  - 参考：`examples/ag-ui/integrations/langgraph/typescript/README.md`
- **后端选 AG-UI server**：用 `ag_ui_langgraph` 把 LangGraph `astream_events` 翻译成 AG-UI events（FastAPI SSE）。
  - 参考：`examples/ag-ui/integrations/langgraph/python/ag_ui_langgraph/endpoint.py`

选择策略：**前端协议二选一**（AG-UI 或 LangGraph SDK），不要混成一锅。

## 6. 两条落地路线（推荐先走省事路线）

### 路线 A（推荐）：LangGraph Agent Server 作为执行面 + 平台 Gateway 仅做治理/代理

特点：工作量最小，不重复造轮子。

- 执行面：LangGraph Agent Server（自托管或云）
  - 持久化/线程/运行/回放由 server 统一提供（通常需要 Redis + Postgres）
- 控制面：你们的 FastAPI Gateway
  - 做鉴权/租户/路由/限流/审计
  - **对外要么**透明代理 LangGraph API（让 LangGraph SDK 可用）
  - **要么**对外提供 AG-UI（则由前端使用 `@ag-ui/langgraph` 这类适配器去打 LangGraph Server）

适用：你们当前目标是“平台化但少造轮子”，并且接受 LangGraph Server 的存储组件（Redis/Postgres）。

### 路线 B：自建 FastAPI 包 graph + 自己选 checkpointer/store（绕开 Agent Server）

特点：可控但工作量与坑点明显上升。

你需要自己补齐 Agent Server 提供的能力（至少）：
- threads/run 的资源模型与持久化策略（thread_id/run_id 的生成、幂等、并发控制）
- streaming 的可靠性（断线、重连、代理缓冲、backpressure）
- interrupt/resume 的协议与状态恢复
- 可观测与审计（trace_id、事件索引、成本）

适用：你们希望完全掌控 API/协议/存储，实现非 LangGraph Server 形态的执行面，或者需要深度定制运行时。

## 3. 平台最小数据模型（建议）

平台需要比 LangGraph 多的维度：

- Tenant/Project：隔离资源与配额
- Agent（逻辑层）：平台对外暴露的“能力入口”（可能映射到不同 graphId/version）
- Deployment（执行层）：LangGraph 实际部署地址、鉴权方式、region
- Session/Thread：用户侧会话；可映射到 LangGraph thread_id
- Run：一次执行；需要 run_id/trace_id，用于审计与重放

建议：平台自生成 `thread_id` 与 `run_id`，并把它们作为 **审计主键**。

## 4. 事件流与状态的边界

约定：
- LangGraph 负责“执行状态机与持久化”；平台不在控制面重复保存图状态（避免双写）
- 平台负责“对前端的可消费视图”：
  - 将 LangGraph 事件转换为 AG-UI 事件
  - 过滤/脱敏（例如内部 prompt、敏感工具输入）
  - 打标签（tenant_id/trace_id/cost）

## 5. 生产化的默认姿势

- 前端永远只连 Platform Gateway（同域），不直连 LangGraph deployment
- Platform Gateway 通过服务端凭证调用 LangGraph（避免把 LangSmith key 暴露给用户）
- 在 Gateway 做 CORS/CSRF/速率限制与审计
