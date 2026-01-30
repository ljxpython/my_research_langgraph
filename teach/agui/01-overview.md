# 01 - AG-UI 是什么（概念与定位）

## 1. AG-UI 解决的问题

AG-UI（Agent User Interaction Protocol）想解决的是：

- 前端要做“强交互 agent UI”时，需要标准化：
  - 流式消息（token streaming）
  - 工具调用生命周期（tool call start/args/end/result）
  - 状态同步（snapshot + delta/patch���
  - 步骤/节点可视化（step start/finish）
  - 人在回路（interrupt + resume）

在没有协议时，这些通常会变成：每个团队、每个 agent 框架都有自己的一套 event schema，UI 反复重写。

AG-UI 的核心价值是：**把“交互语义”独立成协议**，让 UI 能复用。

## 2. AG-UI 与 LangGraph 的关系

把问题拆成两层会更清楚：

1) 执行层：LangGraph 负责“跑图/状态机/中断/状态更新”。
2) 交互层：AG-UI 负责“把执行过程描述给 UI”。

因此 AG-UI 与 LangGraph 是互补关系。

## 3. 你们的现有方案（少造轮子）里，AG-UI 在哪一层？

你们当前方案的目标是：
- 执行面：LangGraph Agent Server（自托管/云）提供 threads/runs/persistence/streaming 能力
- 控制面：FastAPI Gateway 做鉴权/租户/路由/审计/限流

在这个方案下，引入 AG-UI 有两种典型姿势：

### 姿势 A：前端继续用 LangGraph SDK（不引入 AG-UI）

- Gateway 做 LangGraph API 透明代理（或反向代理）
- 前端协议就是 LangGraph SDK
- 优点：最省事
- 缺点：强交互能力受 LangGraph SDK / UI 形态限制（但对很多产品已足够）

### 姿势 B：前端用 AG-UI（引入强交互）

- Gateway 仍然只做治理，但对前端输出 AG-UI（SSE events）
- 执行面仍然是 LangGraph Server，只不过 Gateway 或前端用适配器把 LangGraph 的事件转换成 AG-UI

注意：姿势 B 不意味着你要自建执行面；AG-UI 可以“连远程 LangGraph deployment”。

## 4. 关键认知：AG-UI 与 LangGraph SDK 不是同一套协议

如果你希望“工作量少”：

- 不要试图让 AG-UI 端点“兼容” LangGraph SDK 端点。
- 选择一种对前端暴露的契约，然后另一种通过适配层实现。

后续章节会解释协议细节与适配方式。
