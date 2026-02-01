# 通用 AG-UI Demo UI 方案（对标 agent-chat-ui / chat.langchain.com）

目标读者：
- 写 LangGraph agent 的工程师（需要一个“统一的可用 UI”做调试与验收）
- 做平台中台（Control Plane / AG-UI）的工程师（需要一个稳定的契约消费者）
- QA / 产品（需要一个可复用的 demo 入口）

本文目标：
- 设计一个“通用 Demo 前端”，交互/布局尽量复刻 `agent-chat-ui`/`chat.langchain.com` 的体验。
- 但数据面只走你们的 **AG-UI v1**（经 Control Plane），而不是直连 LangGraph Agent Server API。

非目标（明确不做）：
- 不替代平台正式产品前端（AntD Pro）。这是“工程 demo/验收工具”。
- 不把执行面（Execution Plane）对终端用户开放；demo UI 也不应要求用户持有 LangSmith key。

---

## 1. 背景与核心矛盾

你观察到的事实是成立的：
- `agent-chat-ui`（LangGraph 原生 UI）可以测试任何 LangGraph agent（只要 server 暴露对应 graph/assistant）。
- 你们平台对外契约是 AG-UI（Control Plane 的 SSE），并且附带平台语义（Auth/Tenant、busy(409)、snapshot、cancel、审计等）。

因此我们需要一个“通用 demo UI”，满足：
1) 像 `agent-chat-ui` 一样通用、好用（线程列表、流式体验、工具展示、HITL 等）
2) 但像平台前端一样，只依赖 AG-UI 契约（保证平台语义可验收）

---

## 2. 对标产品：agent-chat-ui / chat.langchain.com 功能盘点

### 2.1 agent-chat-ui（MIT）主要功能

结论：它的“好用”来自一套稳定的信息架构与交互细节，不依赖特定 agent。

核心能力（按用户感知排序）：
- 连接/配置：Deployment URL、Assistant/Graph ID、（可选）LangSmith key；支持 env 直接跳过表单
- 线程管理：左侧 thread history（桌面 sidebar + 移动端 drawer/sheet），新建线程，URL `threadId` 驱动 restore
- 流式对话：发送后立即出现“assistant typing”占位；Stop 按钮；自动滚动与“Scroll to bottom”
- 工具可视化：Tool call + args + tool result（可折叠、JSON table、隐藏工具开关）
- HITL：interrupt 检测、审批/恢复（如果 agent 支持）
- 多模态：PDF/图片上传、预览、作为 message content block
- Artifacts：右侧面板（document/code/图表）

参考代码（便于后续复刻交互）：
- 线程历史：`examples/agent-chat-ui/src/components/thread/history/index.tsx`
- 主对话页：`examples/agent-chat-ui/src/components/thread/index.tsx`
- 工具展示：`examples/agent-chat-ui/src/components/thread/messages/tool-calls.tsx`
- 流式/连接 provider：`examples/agent-chat-ui/src/providers/Stream.tsx`

License：MIT（可以复用/改造，但需要保留 copyright notice）。

### 2.2 chat.langchain.com（体验对标）常见 UX 组件

该 UI 的关键“足够好用”的点（从公开资料/assistant-ui 文档与 agent-chat-ui 实现推断）：
- Thread list（可折叠）+ URL 驱动的 threadId
- Markdown + syntax highlight（代码块体验非常关键）
- 工具/产物在侧边栏/折叠区展示，而不是把所有内容塞进对话泡泡
- 清晰的 streaming 状态（typing、stop、错误提示去重）

我们不需要完全复刻“搜索/分享/云端持久化”等云服务能力；demo 的核心是：稳定、通用、可复用。

---

## 3. 我们要做的是什么（产品定义）

名字建议：`AG-UI Demo Chat`（内部 demo 工具）

一句话定义：
> 一个可以连接任意 Control Plane（AG-UI v1）的通用聊天 UI，体验对标 agent-chat-ui，但协议固定为 AG-UI。

目标用户故事（User Stories）：
- 作为 agent 开发者：我想选择任意 agent，创建 thread，对话并看到工具调用与结果，必要时能取消/恢复。
- 作为平台工程师：我想用同一个 UI 验证 busy(409)、snapshot、cancel、HITL、错误码等平台语义。
- 作为 QA：我想复用同一个 UI 录制复现步骤，不依赖具体产品前端。

---

## 4. 约束与前置条件（AG-UI 视角）

### 4.1 协议约束

demo UI 只依赖 Control Plane 的 AG-UI 契约：
- `POST /v1/auth/login`、`GET /v1/me`
- `GET /v1/agents`
- `POST /v1/threads`
- `GET /v1/threads`（thread history）
- `GET /v1/threads/{threadId}/snapshot`
- `POST /v1/agents/{agentId}:run`（SSE）
- `POST /v1/threads/{threadId}/runs/{runId}:cancel`

参见：`docs/api-contract.md`。

### 4.2 执行面重启的“现实语义”

在 `langgraph dev`（in-memory）下：
- Execution Plane 重启会丢失 thread/state。
- Control Plane 仍会保存 thread 元数据（threadId 存在），但 snapshot 可能无法从 EP 拉回。

这不是 UI bug，而是 dev 形态的事实。

因此 demo UI 需要一个明确策略（二选一，必须写进契约与 UI 文案）：

1) `EP_THREAD_MISSING -> 200 empty snapshot`（推荐 dev 体验）
   - UI 提示“执行层已重启，历史不可恢复（dev/in-memory）”。
2) `EP_THREAD_MISSING -> 404`（更严格）
   - UI 提示“该 thread 在执行层不存在”。

---

## 5. 功能范围（Phase 划分）

为了让 demo 足够通用，我们把功能分成 3 个层次：

### Phase 1（必须有）：通用对话闭环 + 线程历史

功能：
- 连接配置：Control Plane Base URL（例如 `http://127.0.0.1:8000`）
- 登录：用户名/密码 -> token（或手工粘贴 token 也可）
- Agent 选择：从 `GET /v1/agents` 拉取；支持搜索/收藏
- Thread：新建 thread、thread history、URL `?threadId=` restore
- Chat：Markdown 渲染 + 代码高亮 + copy
- Streaming：typing 占位、Stop（cancel/abort）、自动滚动 + “scroll to bottom”
- Tool calls：折叠显示 tool name/id/args/result（best-effort）
- 错误处理：401/403/409/5xx；toast 去重；对 busy 给出明确下一步（wait/cancel/refresh snapshot）

### Phase 2（强烈建议）：HITL 与更完整的 AG-UI 事件集

功能：
- 支持标准 AG-UI 事件：`TEXT_MESSAGE_*`、`TOOL_CALL_*`、`STATE_DELTA`、`STEP_*`
- Interrupt/HITL UI：类似 agent-chat-ui 的 “interrupt card + resume form”
- 更稳定的 SSE 解析（按 SSE frame 而不是按行）

### Phase 3（可选）：Artifacts / 附件

功能：
- 类似 agent-chat-ui 的右侧 artifact 面板
- 附件上传（走 Control Plane artifacts API；避免 base64 大 payload）

---

## 6. UI 信息架构（复刻方向）

布局建议（桌面）：三栏结构（高度 100%）

```
┌──────────────────────┬───────────────────────────────┬──────────────────────┐
│ Thread Sidebar        │ Chat                          │ Inspector            │
│ - New Thread          │ - messages (markdown)         │ - tool calls/results │
│ - thread list         │ - typing placeholder          │ - state (ui/app/debug)│
│ - agent selector      │ - composer + send/stop        │ - errors/run status  │
└──────────────────────┴───────────────────────────────┴──────────────────────┘
```

移动端：sidebar/inspector 变为 Drawer。

交互细节（必须复刻的“手感”）：
- Send 之后立刻出现一条“assistant typing”占位（直到第一条 token 或 snapshot）
- Stop 按钮在 streaming 时替换 Send（或并列）
- 错误 toast 去重（避免 SSE/retry 造成刷屏）
- Thread history 选择后立即切换 URL（可复��链接复现）
- 工具调用默认折叠，提供全局 toggle（hide tool calls）

---

## 7. 协议与状态机：AG-UI 如何在前端落地

### 7.1 前端状态机（建议）

单会话（per selected thread）状态：
- `connecting`：SSE 已发起但还没收到事件
- `streaming`：收到事件，且 run 未结束
- `busy`：Control Plane snapshot 表示 thread busy（可能是 server-side continue）
- `idle`：可提交新 run

注意：`busy` 与 `streaming` 不是同一回事。
- streaming = 我在这个浏览器 tab 正在消费 SSE。
- busy = thread 在平台层被占用（可能由其他 tab/客户端发起，或断线继续跑）。

### 7.2 事件归并（必须定义规则）

AG-UI 是事件流，UI 需要把事件归并成：
- `messages[]`
- `toolCalls[]`（属于某条 assistant message）
- `state`（ui/app/debug）

建议：以 `docs/api-contract.md` 的事件集为准，缺失事件时 fallback 到 snapshot。

---

## 8. 工程实现方案（推荐）

我们需要“最大程度复刻 agent-chat-ui 的交互/布局”。最省事、也最稳定的做法是：

### 方案 A（推荐）：Fork agent-chat-ui，替换数据源为 AG-UI

思路：
- 新增一个独立 demo app：`examples/agui-chat-ui/`
- 基于 agent-chat-ui（MIT）拷贝 UI 组件与布局
- 替换 provider：
  - 原来用 `@langchain/langgraph-sdk/react useStream`（LangGraph API）
  - 改为消费 Control Plane 的 `POST /v1/agents/{agentId}:run` SSE（AG-UI）
- thread list 不再调用 LangGraph `threads.search`，而调用 Control Plane `GET /v1/threads?agentId=...`
- agent selector 调用 Control Plane `GET /v1/agents`

优点：
- 交互/布局复刻成本最低（你要的“像”最容易达成）
- UI 工程独立于 AntD Pro，避免 antd v6 deprecation/样式问题
- demo app 可以独立发布（内部站点/运维通道）

风险/注意：
- 需要严格遵守 `docs/api-contract.md` 的“生产安全边界”：demo UI 不应要求终端用户持有服务端密钥。
- 需要把“LangSmith key”配置替换为“平台 token”（Bearer），并确保 token 不落日志。

### 方案 B：在现有 AntD Pro 里继续演进

优点：复用现有登录/菜单/权限。

缺点：
- 你想要的 agent-chat-ui 体验会被 AntD Pro 现成布局/组件风格拖累。
- antd v6 deprecation 与 ProLayout 行为会持续制造噪音。

结论：demo UI 属于工程工具，建议独立（方案 A）。

---

## 9. 与平台文档的关系（放置约定）

本文是 demo UI 方案，不取代平台前端规划：
- 平台前端（AntD Pro）仍按 `docs/frontend-plan.md` 演进。
- demo UI（通用调试/验收）按本���演进。

---

## 10. 开工前需要确认的决策点（避免返工）

1) demo UI 是否需要同时支持两种模式？
- mode-1：AG-UI（连接 Control Plane）
- mode-2：LangGraph API（直连 Execution Plane）

如果你只要平台验收：只做 mode-1。
如果你要“一个 UI 覆盖所有开发与验收”：可以支持 mode-1/mode-2，但必须明确这两条链路的安全边界与用途。

2) `EP_THREAD_MISSING` 的 snapshot 行为（见 4.2）
- 200 empty snapshot（dev 更友好）
- 404（更严格）

3) Phase-1 是否要包含 artifacts/附件上传
- 如果要，需要确认走 Control Plane artifacts API（而不是 base64 content blocks）。
