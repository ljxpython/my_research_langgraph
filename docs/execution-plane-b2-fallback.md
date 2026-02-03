# 备用方案：B2（自建 Execution Plane 复刻 LangGraph API）

本文是“备用方案（Contingency Plan）”，用于记录：如果未来决定不再使用 LangGraph 官方 Agent Server 作为执行面（Execution Plane），而改为 **自建 FastAPI 服务来复刻 LangGraph API**，需要付出的成本与需要改造的模块。

当前结论（默认不选）：
- Phase-1/Phase-2 默认路线仍是 **A：LangGraph Agent Server（官方）+ Control Plane（平台 Gateway）**。
- B2 只有在满足某些“触发条件”时才启动评审与立项。

---

## 1. 背景与术语

路线命名（与 `docs/architecture.md` 保持一致）：

- **A**：Execution Plane 使用 LangGraph 官方 Agent Server（Docker/内网服务）对外提供 LangGraph API。
- **B1**：自建 FastAPI 执行面，但仅暴露平台协议（例如 AG-UI SSE + 必要的 snapshot/cancel），不追求 LangGraph SDK 兼容。
- **B2**：自建 FastAPI 执行面，并尽可能 **复刻 LangGraph Agent Server API 与行为**（threads/runs/assistants/checkpoints/stream_mode/...），使 LangGraph SDK（Python/JS）尽量“无改动可用”。

本文只讨论 B2。

---

## 2. 为什么 B2 昂贵（本质原因）

关键点：B2 的成本不在“写几个 HTTP 接口”，而在“复刻一个分布式运行时”。

LangGraph Agent Server 承担了：
- 线程/Run 生命周期的统一管理
- Checkpoint 与 durability 策略
- 多种 stream_mode 的事件组织与断线语义（stream_resumable / on_disconnect）
- cancel/interrupt 的一致性
- 与 LangGraph/LangChain callback 事件的兼容

如果自建 B2，上述能力都由平台自己长期维护（含回归测试、版本演进对齐）。

---

## 3. 成本评估（人月级别，保守估算）

这里按“目标兼容等级”拆分，便于后续立项时选择范围。

### 3.1 B2-lite（仅覆盖我们用到的 20% API；不承诺 SDK 全兼容）

- 目标：只覆盖核心路径：
  - assistants: search/get（足够 UI/调试选择 agent）
  - threads: create/get_state（足够 snapshot/恢复）
  - runs: stream/cancel/get（足够对话与取消）
- 允许：事件细节与官方 server 不完全一致；前端/Control Plane 允许适配。

粗略成本：2–4 人月（能跑通 + 基础稳定）

### 3.2 B2-compat（主路径兼容 langgraph_sdk / JS SDK）

- 目标：Python/JS SDK 主要调用无改动可用：
  - `client.assistants.search(...)`
  - `client.threads.create(...)` / `get_state(...)` / `search(...)`
  - `client.runs.stream(... stream_mode=...)` 的核心 stream_mode
  - `client.runs.cancel(...)` + busy/interrupt 的一致性

粗略成本：6–12 人月

### 3.3 B2-full（高度兼容 + 全量 stream_mode/checkpoints/tasks/debug/custom + 演进对齐）

- 目标：尽量对齐官方 server 行为，减少“升级即破”风险。

粗略成本：12–24+ 人月（且需要长期投入维持对齐）

---

## 4. 需要新增/重构的模块（工作分解）

### 4.1 新增：Execution Plane（自建 FastAPI 服务）

必须包含的子系统（建议拆成独立包/模块）：

1) **API Surface（对外 LangGraph API）**
- assistants：search/get/get_graph/get_schemas（最小先做 search/get）
- threads：create/get_state/update_state/search（最小先做 create/get_state）
- runs：stream/get/wait/cancel/join/join_stream（最小先做 stream/get/cancel）

2) **Run 执行引擎（graph runner）**
- 调用 LangGraph graph（in-process）
- 统一 run_id/thread_id 生成与幂等
- 多并发策略：同 thread 并发、跨 thread 并发、租户级限制
- cancel/interrupt 行为定义（何时生效、如何通知 stream、如何回收资源）

3) **状态与 checkpoint 持久化**
- 线程 state schema
- checkpoint 存储（Postgres/Redis/对象存储）与 durability
- 重启恢复与回放（尤其是 stream_resumable）

4) **Streaming 系统（最难）**
- stream_mode 语义：values/updates/messages/events/... 的事件组织
- 事件顺序、去重、断线重连与 replay
- SSE/WS 实现与 backpressure

5) **观测与治理**
- trace/request_id/run_id/thread_id 贯通
- 指标：延迟、吞吐、失败率、cancel 成功率、队列长度
- 限流/配额：按 tenant/user/thread 的策略

### 4.2 Control Plane（Gateway）需要的改造

取决于你们是否仍坚持“Control Plane 输出 AG-UI v1”。

两种方向（二选一，避免双源）：

1) **CP 继续负责平台语义（推荐与现状一致）**
- tenant/用户隔离、thread owner、THREAD_BUSY、cancel/snapshot 对外契约
- EP 只负责跑图与 checkpoint

2) **语义下沉到 EP，CP 只做代理/鉴权**
- CP 变薄，但 EP 需要承担更多平台职责
- 需要重新定义：busy slot、owner、审计的落点

### 4.3 Frontend 需要的改造

取决于前端协议选型：

1) **前端继续走 AG-UI（平台统一协议）**
- Frontend 改造较小（继续消费 CP 的 AG-UI SSE）
- 但 B2 的“SDK 兼容优势”主要用于内部调试/生态集成

2) **前端转向 LangGraph SDK（类似 agent-chat-ui）**
- Frontend 需要��入 JS SDK 的 useStream/useClient 模式
- 对现有 AG-UI 会话内核/组件体系有较大冲击（事件体系不同）

---

## 5. 触发条件（什么时候才值得启动 B2）

只有满足下列之一，才建议启动 B2 的方案评审：

- **合规/部署限制**：无法接受官方 server 的部署模型或依赖（例如某些受限环境不允许）。
- **必须强定制 run/runtime 行为**：官方 server 无法满足（且无法通过扩展点解决），例如极端的审计、隔离、资源治理需求。
- **平台要对外提供 LangGraph SDK 兼容 API**：并且需要长期稳定承诺（生态/插件/第三方客户端依赖）。
- **官方演进节奏不可控且频繁破坏我们的契约**：并且成本无法通过 adapter 缓冲。

非触发条件（不要因为这些就上 B2）：
- “想要更可控/更像自己写的”
- “想让流式更顺滑”
  - 这类问题通常通过 stream_mode/events 适配或 AG-UI adapter 即可解决

---

## 6. 推荐的迁移路径（把风险降到最低）

如果未来真的要走 B2，建议按阶段推进：

1) 先做 **B1**（只输出 AG-UI），把自建执行的最小闭环跑通（run/interrupt/cancel/checkpoint）。
2) 再做 **B2-lite**：补齐 SDK 必需的少量 endpoints（assistants.search/threads.create/runs.stream）。
3) 最后评估是否需要 **B2-compat**：用黑盒回归测试锁住 SDK 行为。

---

## 7. 验收标准（立项前必须冻结）

建议在立项时冻结下列验收标准，否则范围会失控：

- 必须兼容的 SDK 调用清单（Python/JS，各列 10 条以内）
- 必须支持的 stream_mode 列表（例如：events + values + messages）
- 断线语义（on_disconnect=continue/cancel）与是否支持 stream_resumable
- checkpoint/durability 策略（sync/async/exit）
- cancel 的一致性：什么时候返回成功，SSE 必须补哪些终止事件

---

## 8. 决策记录（占位）

当未来讨论 B2 是否立项时，请在这里补充：

- 触发条件：
- 目标兼容等级：B2-lite / B2-compat / B2-full
- 范围冻结：
- 风险与回滚：
- 负责人/时间表：
