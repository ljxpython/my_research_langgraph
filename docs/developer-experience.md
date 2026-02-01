# Developer Experience / 双入口调试

目标：提升研发效率，让“调 graph”与“调平台语义”解耦。

你们已经确认：
- 认可“双入口调试”工作流
- 接受取舍：直连执行面调试效率高，但与生产平台语义不完全一致

本文将这些理念固化为规范。

---

## 1. 双入口是什么？

我们同时维护两条访问链路：

1) Graph 调试入口（直连执行面）

- UI：偏 `agent-chat-ui`（LangGraph 原生）
- 协议：LangGraph SDK / Agent Server API（/info、threads、runs、stream 等）
- 目的：快速迭代 graph/agent（prompt、tool、state、checkpoint）

2) 平台入口（走 Control Plane）

- UI：平台中台（AntD Pro）
- 协议：AG-UI v1（你们对外唯一契约）
- 目的：验证平台语义（Auth/Tenant、409 busy、cancel、snapshot 结构化、审计、HITL）

这两条入口的共同点：
- 使用同一个 Execution Plane（LangGraph server）作为执行与持久化基础。

---

## 2. 为什么要双入口？

直连 Execution Plane 的好处：
- 调 graph 更快：省掉平台层的 auth/租户/审计/路由等噪音
- 更贴近 LangGraph 本体能力：threads/runs/stream 等功能原生可用

走 Control Plane 的好处：
- 贴近生产：你们对外承诺的是 AG-UI 契约与平台语义
- 能验证治理逻辑：busy/取消/快照/脱敏/审计/HITL 等

结论：双入口不是重复建设，而是把“效率”和“正确性”都保住。

---

## 3. 必须分工：哪些功能必须在 Control Plane？哪些必须在 Execution Plane？

### 3.1 必须在 Control Plane 的功能（平台语义/治理）

- 鉴权与租户隔离（AuthN/AuthZ，防 IDOR）
- Agent Registry（agent_id -> graph_id/assistant_id/执行面路由）
- 并发控制：同一 thread 单 active run（busy -> HTTP 409）
- cancel endpoint：`POST /v1/threads/{thread_id}/runs/{run_id}:cancel`
- snapshot endpoint：`GET /v1/threads/{thread_id}/snapshot`（结构化 JSON）
  - messages：AG-UI Message[]
  - state：任意 JSON，但 enforce 顶层 namespace（ui/app/debug）与保留字段
  - busy/activeRunId：来自控制面锁位
- 审计（audit_events）：run/snapshot/cancel 必须可追溯
- 对外契约守门：错误码、CUSTOM 事件命名空间、兼容性策略

### 3.2 必须在 Execution Plane 的功能（运行与持久化）

- 运行 LangGraph graphs（节点、子图、状态机）
- checkpoint / thread state 的持久化（生产环境：Redis + Postgres）
- streaming 事件输出（执行过程事件流）
- HITL 的执行语义（interrupt/resume 的图执行本体）

原则：
- Execution Plane 不知道 tenant/user/auth 这些平台概念。
- Control Plane 不重复实现 threads/checkpoint 系统。

---

## 4. 关键取舍（必须明确写在文档里）

直连执行面调试 != 生产语义一致。

差异来源：
- Control Plane 会做额外治理：tenant/权限、工具白名单/脱敏、409 busy、审计、结构化快照、错误码
- 因此，同一条输入在两条入口可能表现不同（尤其是权限/脱敏/并发/cancel）。

应对策略：
- 日常“调 graph”走直连入口
- 上线前/回归验证走平台入口

### 4.1 验收矩阵：每条入口“能证明什么 / 不能证明什么”

直连执行面（Execution Plane / agent-chat-ui）能证明：
- graph 本体可用：prompt/tool/state/checkpoint/interrupt-resume
- LangGraph Agent Server API 与 streaming 基础能力可用（threads/runs/stream）

直连执行面不能证明（平台语义一律不算）：
- 鉴权/租户隔离/RBAC（包括 IDOR 防护）
- 并发治理：`THREAD_BUSY` / HTTP 409、断线恢复、cancel/snapshot 平台语义
- 审计、脱敏、工具白名单/策略注入、配额与限流
- 对外契约稳定性（AG-UI 事件序列、错误码、CUSTOM 命名空间）

平台入口（Control Plane / AG-UI）能证明：
- 你们对外承诺的协议与平台治理语义是否正确（AG-UI SSE + busy/cancel/snapshot/audit 等）

### 4.2 生产安全边界（共识，必须写死）

- 对终端用户：只暴露 Control Plane（AG-UI）。
- Execution Plane 不作为对外入口；如需 `agent-chat-ui`，仅限内网/运维通道使用。

---

## 5. Graph 输入必须“可独立运行”的约束（为了解耦）

为了保证你能在不经过 Control Plane 的情况下调试 graph：

必须满足：
- graph 的最小输入闭环只依赖：`messages` + （可选）`state/context/forwarded_props`
- Control Plane 注入的元数据（tenant_id/trace_id/策略）必须是“可选增强”，不能成为 graph 必填依赖

建议：
- 把“平台策略”放在工具层/adapter 层，而不是 graph 逻辑里硬编码
- graph 里不要直接访问 Control Plane 的 DB 或 API

---

## 6. 本地开发工作流（推荐）

你们本地同时跑 4 个组件：

1) Execution Plane（LangGraph dev）

- `langgraph dev --port 8123 --no-browser`

2) Graph 调试 UI（agent-chat-ui）

- 直连 `http://127.0.0.1:8123`
- 用于快速调试 graph

3) Control Plane（FastAPI Gateway）

- 配置 `LANGGRAPH_API_URL=http://127.0.0.1:8123`
- 对外提供 AG-UI（run/snapshot/cancel）与简化 login

4) 平台前端（AntD Pro）

- 跨域调用 Control Plane（Bearer token）
- 验证平台语义

---

## 7. 关于 Dojo（AG-UI 原生）与“其他 LLM 框架”

当前建议：
- Graph 调试 UI 默认选 `agent-chat-ui`（LangGraph 原生，效率最高）

未来扩展：
- 如果你们引入其他执行引擎/LLM 框架（不再是 LangGraph server API），此时 Dojo（AG-UI 原生）会更通用。
- Dojo 可作为联调参考/对照工具：只要后端输出 AG-UI SSE，就能复用（但不替代平台语义验收）。
