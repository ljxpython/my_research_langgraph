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

---

## 3.3 数据库与基础设施拓扑（Phase-1/生产级约定）

你们已敲定：
- 方案 A：一个 Postgres 实例 + 两个数据库（执行面/控制面隔离） + 一个 Redis
- 开发：`langgraph dev` 走 in-memory
- 平台联调/上线：Docker Compose（LangGraph Agent Server + Redis + Postgres + Control Plane）

推荐拓扑：

```
                +---------------------+
                |     Postgres        |
                |  (single instance)  |
                +----------+----------+
                           |
            +--------------+----------------+
            |                               |
   +--------v---------+            +--------v---------+
   | langgraph_db     |            | control_plane_db |
   | (execution plane)|            | (metadata/audit) |
   +------------------+            +------------------+

   +------------------+
   | Redis             |
   | (pub-sub broker)  |
   +------------------+

Control Plane  -> control_plane_db
LangGraph API  -> langgraph_db + redis
```

为什么要分两个数据库：
- Execution Plane 的 Postgres 由 LangGraph server 管理表结构与语义（assistants/threads/runs/state/queue）。
- Control Plane 的 Postgres 由你们管理元数据与审计（users/tenants/agents/threads/runs/audit_events），避免双写 messages/state。

环境变量命名建议（减少混淆）：
- Control Plane（FastAPI）
  - `CONTROL_PLANE_DATABASE_URI=postgresql://.../control_plane_db`
  - `LANGGRAPH_API_URL=http://langgraph-api:8000`（docker 内网）
  - `JWT_SECRET=...`
  - `CORS_ALLOW_ORIGINS=...`

- Execution Plane（LangGraph Agent Server）
  - `DATABASE_URI=postgresql://.../langgraph_db`
  - `REDIS_URI=redis://redis:6379/0`
  - 其他模型/工具相关 key

约定：
- Control Plane **不复用** LangGraph 的 `DATABASE_URI`（避免误连误写）。
- 两个 DB 使用不同数据库名（最清晰）；不要混到同一个 DB 里。

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
| concurrency_manager       | 同 thread 单 active run；busy->409；stale lock recovery   |
| api                       | 对外 API：run/snapshot/cancel/agents/threads              |
| audit                     | append-only 审计事件：run start/cancel/snapshot read       |
| config                    | 执行面地址、密钥引用、超时、限流参数                      |
| observability             | request_id/trace_id，结构化日志（OTel 可后置）            |
+---------------------------+----------------------------------------------------------+
```

---

## 4.1 Control Plane 代码目录结构（建议，Phase-1）

你们已确定：
- `control_plane/` 使用 uv 管理依赖，Python 3.13
- Python 包名使用 `gateway/`
- 跨域 + Bearer token（Phase-1 简化 login，后续迁移 OIDC/SSO）

建议目录结构（可直接落地）：

```
control_plane/
  gateway/
    main.py                  # FastAPI app：挂载 routers/middleware；生命周期
    settings.py              # 配置：CORS、JWT、DB、LangGraph URL、超时等

    middleware/
      cors.py                # CORS allowlist（跨域 Bearer 必需）
      request_id.py          # X-Request-Id 贯穿（日志/审计）
      logging.py             # 结构化日志（Phase-1 可简化）

    schemas/                 # Pydantic：请求/响应/错误码（对齐 shared/ 示例）
      errors.py
      auth.py                # /v1/auth/login, /v1/me
      agents.py              # /v1/agents
      threads.py             # /v1/threads, /snapshot
      runs.py                # :run, :cancel

    deps/                    # FastAPI Depends：AuthN/AuthZ 收口
      auth.py                # get_current_user（Bearer）
      permissions.py         # require_admin / require_thread_owner（Phase-1）

    db/
      engine.py              # SQLAlchemy engine/session
      models.py              # tenants/users/agents/threads/runs/audit_events
      migrations/            # Alembic

    repos/                   # 数据存取（只做 CRUD + 锁位，不写业务规则）
      agents_repo.py
      threads_repo.py
      runs_repo.py
      audit_repo.py

    adapters/                # 外部系统适配（LangGraph server SDK/HTTP）
      langgraph_adapter.py

    services/                # 平台语义（你们已敲定的策略都在这里）
      auth_service.py        # Phase-1 简化 login（签发 JWT），Phase-2 替换为 OIDC 校验
      agent_service.py       # agent registry
      thread_service.py      # thread 创建/列表/归属校验（防 IDOR）
      run_service.py         # 409 busy + streaming + 收尾清理
      snapshot_service.py    # get_state -> 结构化 JSON（AG-UI messages + state）
      cancel_service.py      # 幂等 cancel + best-effort + 清 busy
      audit_service.py       # append-only 审计
  tests/
```

分工理由（简洁版）：
- `routers`（或直接在 main 挂载路由文件）：只做 HTTP 入口；避免巨型 controller。
- `services`：平台语义核心（并发/断线/取消/快照/审计）。
- `repos`：只做存取与行锁（例如 threads.active_run_id 锁位）。
- `adapters`：隔离 LangGraph server 的 SDK/协议变化。
- `schemas`：对齐 `shared/` 的 JSON 示例，减少前后端对接漂移。

---

## 4.2 Phase-1 权限策略（简单但像中台）

Phase-1 建议只做：
- AuthN：简化登录签发 JWT（`POST /v1/auth/login`），前端跨域使用 `Authorization: Bearer <token>`。
- AuthZ：最小 RBAC（admin/user）+ tenant 资源隔离（防 IDOR）。

强制约束：
- 任何 thread/run 相关的 API 都必须校验：`thread_id` 属于当前 tenant/user。
- agent 管理接口（CRUD）只允许 admin。

后续 Phase-2 才引入：Role-Menu/Role-API 或 Casbin。

---

## 5. 数据模型（Phase-1 最小表）

目标：支持中台常见能力（登录/权限、agent 列表、thread/run 归属、busy/cancel、审计），并为 Phase-2 的 eval/dataset 预留扩展。

注意：messages/state 不落库（执行面是单一真相源）。

### 5.1 ID 策略（已敲定：ULID）

你们已选择：使用 ULID 作为主键/资源 ID。

推荐约定：
- `tenant_id`、`user_id`、`thread_id`、`run_id`、`audit_event_id` 都使用 ULID���字符串）
- `agent_id` 保持“可读的 slug”（例如 `agent-sql`），便于中台运营

建议格式：
- ULID 原始 26 字符（Crockford Base32），也可加资源前缀便于排障：
  - `th_01J...`、`run_01J...`、`u_01J...`（前缀非必须，但强烈推荐）

### 5.2 表结构（建议 v1，不存 messages/state 正文）

下面是 Phase-1 推荐的最小表结构：

```
+--------------+-----------------------------------------------+---------------------------------------------+
| 表           | 关键字段                                        | 说明                                         |
+--------------+-----------------------------------------------+---------------------------------------------+
| tenants      | id(ULID), name, status                         | 即使 Phase-1 单租户也建议保留，避免返工        |
| users        | id(ULID), tenant_id, username, password_hash,  | Phase-1 简化 login；Phase-2 可迁移 OIDC       |
|              | is_admin, status, created_at, last_login_at    |                                             |
| agents       | agent_id(slug), tenant_id, graph_id/assistant_id, | agent registry：对前端暴露 agent_id       |
|              | execution_target_id, config_json, status       | config_json 用于存 agent 配置                |
| threads      | thread_id(ULID), tenant_id, created_by, agent_id, | 归属校验 + 并发锁位 active_run_id          |
|              | active_run_id, last_activity_at, created_at    | 建议创建 thread 时固定 graph/assistant       |
| runs         | run_id(ULID), tenant_id, thread_id, status,    | cancel 幂等；排障索引 request_id             |
|              | request_id, started_at, ended_at, error_code   |                                             |
| audit_events | id(ULID), tenant_id, actor_id, action,         | append-only：login/run/snapshot/cancel       |
|              | resource_type, resource_id, request_id, details_json | request_id 做链路关联                    |
+--------------+-----------------------------------------------+---------------------------------------------+
```

### 5.3 必须的索引/约束（Phase-1 就要做）

建议最小索引（能明显提升中台体验与排障效率）：

- users
  - `unique(tenant_id, username)`

- threads
  - `index(tenant_id, created_by, last_activity_at)`（线程列表/排障）
  - `index(tenant_id, agent_id, last_activity_at)`
  - `index(active_run_id)`（可选）

- runs
  - `index(tenant_id, thread_id, started_at)`
  - `index(request_id)`（强烈建议，用于排障关联）

- audit_events
  - `index(tenant_id, created_at)`
  - `index(request_id)`
  - `index(resource_type, resource_id)`

关键字段说明（与你们已敲定语义对齐）：
- `threads.active_run_id`：并发约束的“锁位”。
- `runs.status`：至少包含 `running|succeeded|failed|canceled|unknown`。
- `audit_events`：中台“可追溯”的骨架，Phase-1 就要有。

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
| POST /v1/artifacts                              | 上传附件（可选）            | 前端通过 context 引用附件 |
+-----------------------------------------------+------------------------------+--------------------------+
```

关于 `POST /v1/threads`：
- 推荐前端先创建 thread，拿到 thread_id 再 run。
- 这样 thread 的 tenant/user/agent 绑定在控制面侧更清晰，且 thread_id 不再由客户端“随便填”。

## 6.1 agent registry 与 execution_target（dev/prod 映射策略）

你们的开发方式已确定：
- 调试 graph：本地 `langgraph dev`（local-dev target）
- 平台联调/上线：Docker 部署 LangGraph Agent Server（docker-dev/prod target）

因此 Control Plane 必须引入 `execution_target` 概念，用于把请求路由到不同执行面。

推荐策略：
- 在 thread 创建时固化 `execution_target_id`
- 后续该 thread 的 run/snapshot/cancel 都必须打到同一个 target（避免状态割裂）

Agent Registry 建议拆分为两层（概念上；Phase-1 也可先用单表实现）：

1) `agents`：平台对外入口（稳定）
- `agent_id`（对前端）
- display_name/status/config_json

2) `agent_deployments`：按 target 的实际映射（可变化）
- `agent_id` + `execution_target_id`
- `assistant_id` / `graph_id`（允许 dev/prod 不同）
- status

Control Plane 的 resolve 逻辑：
- `agent_id` + `execution_target_id` -> (assistant_id/graph_id/base_url)

相关契约示例（JSON）：
- `shared/contracts/http/examples/login.request.json`
- `shared/contracts/http/examples/login.response.json`
- `shared/contracts/http/examples/me.response.json`
- `shared/contracts/http/examples/run.request.json`
- `shared/contracts/http/examples/snapshot.response.json`
- `shared/contracts/http/examples/cancel.response.json`
- `shared/contracts/http/examples/busy.response.json`

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

错误码与结构见：
- `shared/contracts/http/errors.md`

---

## 10. 演进路线（不推翻 Phase-1）

Phase-2 常见扩展：
- 多实例：把并发锁从单库行锁演进到 Redis/DB 乐观锁都可以，但 API/ID 不变
- 数据集/评测：新增 datasets/test_plans/eval_runs 表；评测结果存控制面，不存 messages
- 报告与对比：基于 snapshot/history 做 diff，并把评分/指标落库
