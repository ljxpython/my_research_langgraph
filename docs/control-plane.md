# Control Plane 设计（通用测试平台 / FastAPI Gateway）

本文档给出一套“可实施”的 Control Plane（控制面）最佳方案，面向你们的定位：

- 产品形态：中台/测试平台（能配置 Agent、发起测试、回放对比、出报告）
- 前端协议：**仅 AG-UI v1**（已敲定）
- 执行面：LangGraph Agent Server（自托管），持久化/threads/runs/state 都在执行面
- 控制面：FastAPI Gateway + Postgres（元数据/安全/审计/并发锁），不存 messages/state 正文

已敲定的 Phase-1 语义（与 `docs/frontend-contract.md`、`docs/api-contract.md` 一致）：
- 同一 `thread_id` 只允许 1 个 active run（busy -> HTTP 409）
- 断线不取消 run（server-side continue）
- 提供 cancel endpoint
- 提供 snapshot endpoint（从 LangGraph server 拉 state/messages 并返回结构化 JSON）
- 工具全部后端执行（前端工具暂不做）
- HITL interrupt/resume 完整闭环

---

## 1. 控制面职责边界（不要把执行面重复造一遍）

控制面要“薄，但权威”：

- 权威：身份/租户、授权、对外契约、agent 注册表、thread/run 的归属关系、并发约束、审计、观测
- 薄：不承载图执行、不双写 messages/state、不自建 checkpoint 系统

一句话：

```
Control Plane = 安全 + 治理 + 契约 + 元数据 + 编排
Execution Plane = 运行 + 持久化 + 状态 + streaming
```

---

## 2. 通用测试平台应该包含哪些模块？（表单）

下面是一个“通用测试平台”常见功能模块清单，你们可以按优先级分阶段实现。

```
+------------------------+--------------------------+------------------------------+------------------------------+
| 模块                   | 目标                     | Phase-1 必须                 | Phase-2/后续                 |
+------------------------+--------------------------+------------------------------+------------------------------+
| 身份与权限(Auth)       | 谁能做什么               | Bearer token 校验；RBAC最小集 | OIDC/SSO；细粒度 ABAC         |
| 租户/项目(Tenant/Proj) | 资源隔离与配额           | tenant_id 绑定 thread/run     | project 级隔离、配额、计费     |
| Agent 注册表           | 管理可用 agent 入口       | GET /v1/agents；配置映射      | 版本/灰度、发布审批、下线      |
| Workbench 会话         | 交互式调试与人工介入       | run/snapshot/cancel/HITL      | 时间旅行、回放、对比、分支     |
| 数据集(Datasets)       | 测试用输入集              | 可后置（先手工输入）          | CRUD + version + tags         |
| 测试计划(Test Plans)   | 一组用例/场景的组织        | 可后置                         | 计划编排、批量执行、参数化     |
| 评测(Evals)            | 自动评分与回归            | 可后置（先人工观察）          | 指标/评分器、基线对比、报告     |
| 报告(Reports)          | 可视化结果                | 最小：run 列表/状态            | 趋势、diff、失败聚类           |
| 观测与审计             | 可追溯、可排障            | audit_events + request_id     | OTel + metrics + 告警          |
| 密钥与连接器           | 安全访问外部系统           | env/secret manager（文档约束）| tool registry、MCP、凭证轮换    |
+------------------------+--------------------------+------------------------------+------------------------------+
```

你们 Phase-1 的“测试平台框架”建议只做：Auth/RBAC、Agent Registry、Workbench（run/snapshot/cancel/HITL）、最小审计。

---

## 3. 推荐的 Control Plane 架构（可实施）

### 3.1 组件图

```
          (AG-UI SSE)
AntD Pro  -------------->  FastAPI Gateway  ---------------->  LangGraph Agent Server
  UI                         (Control Plane)                     (Execution Plane)
  - workbench                - auth/tenant/rbac                   - threads/runs/state
  - agents CRUD              - agent registry                     - streaming SSE
  - threads list             - concurrency (409)                  - PG+Redis
                             - snapshot adaptor
                             - cancel adaptor
                             - audit
                             - routing (future)
                             |
                             +--> Postgres (control metadata)
```

### 3.2 Phase-1 最佳实践

- 控制面只支持 AG-UI（你们已定），把“前端任意”锁死在协议层。
- 控制面存“元数据与安全映射”，不存 messages/state 正文。
- 并发约束不要只做内存：建议 Phase-1 直接用 Postgres 做 per-thread 锁位（后续多实例无需推翻）。

---

## 4. 模块拆分（代码/服务边界）

建议按模块拆（便于后续演进到多实例/多执行面）：

```
+---------------------------+----------------------------------------------------------+
| 模块                      | 职责                                                     |
+---------------------------+----------------------------------------------------------+
| auth                      | Bearer token 校验；解析 user_id/tenant_id/scopes         |
| rbac                      | 资源级授权（防 IDOR）：thread/run/agent 都必须 tenant 过滤 |
| agent_registry            | agent_id -> (assistant_id, graph_id, execution_target_id) |
| execution_adapter         | 封装 langgraph-sdk：threads/runs/state/history/cancel      |
| concurrency_manager        | 同 thread 单 active run；busy->409；stale lock recovery   |
| api                       | 对外 API：run/snapshot/cancel/agents/threads              |
| audit                     | append-only 审计事件：run start/cancel/snapshot read       |
| config                    | 执行面地址、密钥引用、超时、限流参数                      |
| observability             | request_id/trace_id，结构化日志（OTel 可后置）            |
+---------------------------+----------------------------------------------------------+
```

---

## 5. 数据模型（Phase-1 最小表）

目标：支持中台常见能力（登录/权限、agent 列表、thread/run 归属、busy/cancel、审计），并为 Phase-2 的 eval/dataset 预留扩展。

注意：messages/state 不落库（执行面是单一真相源）。

```
+------------------+----------------------------+---------------------------------------+
| 表               | 主键/关键字段               | 说明                                  |
+------------------+----------------------------+---------------------------------------+
| tenants          | id, name, status           | 可选：Phase-1 单租户也可以先简化       |
| users            | id, tenant_id, subject     | subject = token sub / oidc sub        |
| api_keys         | id, tenant_id, hashed_key  | 可选：Phase-1 可不做                   |
| agents           | agent_id, graph_id, assistant_id, execution_target_id, config_json, status |
| threads          | thread_id, tenant_id, agent_id, graph_id, assistant_id, execution_target_id, active_run_id, last_activity_at |
| runs             | run_id, thread_id, tenant_id, status, created_at, ended_at, error_code |
| audit_events     | id, tenant_id, actor_id, action, resource_id, created_at, details_json |
+------------------+----------------------------+---------------------------------------+
```

关键字段说明：
- `threads.active_run_id`：并发约束的“锁位”。
- `runs.status`：至少包含 `running|succeeded|failed|canceled|unknown`。
- `agents.*`：让前端不硬编码 agentId/graphId/assistantId。

---

## 6. 对外 API（Phase-1 建议完整集合）

你们已经在 `docs/api-contract.md` 固定了 run/cancel/snapshot，这里补齐“中台测试平台框架”必需的控制类接口：

```
+-----------------------------------------------+------------------------------+--------------------------+
| API                                           | 用途                         | 备注                     |
+-----------------------------------------------+------------------------------+--------------------------+
| GET  /healthz                                 | 探活                         | ops                      |
| GET  /v1/me                                   | 当前用户/租户/scopes         | 前端初始化               |
| GET  /v1/agents                               | agent 列表                   | 你已选择由后端提供        |
| GET  /v1/agents/{agent_id}                    | agent 详情                   | 可选                     |
| POST /v1/threads                              | 创建 thread                  | 建议由网关创建，防 IDOR   |
| GET  /v1/threads                              | thread 列表（分页）          | 中台排障必备              |
| GET  /v1/threads/{thread_id}/snapshot          | 断线恢复/刷新恢复            | 从 LangGraph 拉 state/messages |
| POST /v1/agents/{agent_id}:run                | 发起 run（SSE）              | busy->409                |
| POST /v1/threads/{thread_id}/runs/{run_id}:cancel | 取消 run                 | best-effort + 幂等        |
+-----------------------------------------------+------------------------------+--------------------------+
```

关于 `POST /v1/threads`：
- 推荐前端先创建 thread，拿到 thread_id 再 run。
- 这样 thread 的 tenant/user/agent 绑定在控制面侧更清晰，且 thread_id 不再由客户端“随便填”。

---

## 7. 三条关键请求链路（实现级流程）

### 7.1 发起 run：POST /v1/agents/{agent_id}:run

目标：
- enforce 同 thread 单 active run（busy -> 409）
- server-side continue：客户端断线不影响执行
- 记录 audit
- streaming：把执行面的 SSE 转成 AG-UI SSE（或直接透传 AG-UI）

建议流程（事务边界清晰）：

```
1) AuthN/AuthZ: 解析 tenant_id/user_id，校验 agent_id 可用
2) Resolve thread_id:
   - 如果请求没 thread_id：创建 thread（LangGraph threads.create + DB threads insert）
   - 如果有 thread_id：校验 thread 属于当前 tenant（DB 查 threads）
3) Concurrency:
   - DB 事务：SELECT threads FOR UPDATE
   - 若 active_run_id 非空：返回 409 {THREAD_BUSY, activeRunId}
   - 否则创建 runs 记录（status=running），写 threads.active_run_id
4) Call execution plane:
   - runs.stream(thread_id, assistant_id, payload)
   - 从 Content-Location 得到执行面 run_id（如需）
5) Streaming:
   - 将执行面事件转成 AG-UI SSE 输出给前端
6) Finish:
   - 正常结束/错误/取消：更新 runs.status；清 threads.active_run_id
   - 写 audit_events
```

stale lock recovery（防永久 busy）：
- 如果 threads.active_run_id 存在，但执行面 thread.status 已非 busy，清锁并允许继续。

### 7.2 cancel：POST /v1/threads/{thread}/runs/{run}:cancel

```
1) AuthZ: 校验 run/thread 属于 tenant
2) 幂等：如果 runs.status 已是 finished/canceled，返回 already_finished
3) 调用执行面 runs.cancel(thread_id, run_id, action=interrupt)
4) 更新 runs.status=canceled；清 threads.active_run_id（如果匹配）
5) 写 audit
```

### 7.3 snapshot：GET /v1/threads/{thread}/snapshot

```
1) AuthZ: thread 属于 tenant
2) 从执行面拉：threads.get_state(thread_id)
3) 转换：ThreadState.values.messages -> AG-UI Message[]
4) 组装：state（不含 messages，且顶层 namespace ui/app/debug）
5) 合并：busy/activeRunId（来自控制面 threads.active_run_id）
6) 返回结构化 JSON
```

---

## 8. 与 LangGraph Agent Server 的最小对接点（Python）

建议统一用 `langgraph-sdk`（Python），不要手写 HTTP。

你们控制面需要的最小能力：
- `threads.create(metadata=...)`
- `threads.get(thread_id)`（拿 status/metadata）
- `threads.get_state(thread_id)`（snapshot 数据源）
- `threads.get_history(thread_id, ...)`（Phase-2 回放/对比时再用）
- `runs.stream(thread_id, assistant_id, ...)`（SSE）
- `runs.cancel(thread_id, run_id, action=interrupt)`

---

## 9. 安全与合规（测试平台也不能省）

必须做到：
- 资源级授权（IDOR 防护）：任何 thread/run 访问都必须 tenant 过滤
- 不信任前端传入的 `tools`：后端忽略或严格白名单
- snapshot 脱敏：state/messages 中可能包含敏感信息，至少要支持字段级过滤
- 内部密钥不下发：执行面 API key 只在控制面持有（见 `docs/security-and-secrets.md`）

---

## 10. 演进路线（不推翻 Phase-1）

Phase-2 常见扩展：
- 多实例：把并发锁从单库行锁演进到 Redis/DB 乐观锁都可以，但 API/ID 不变
- 数据集/评测：新增 datasets/test_plans/eval_runs 表；评测结果存控制面，不存 messages
- 报告与对比：基于 snapshot/history 做 diff，并把评分/指标落库
