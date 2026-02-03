# 通用测试管理模板（Control Plane + Frontend）

这个仓库的定位：提供一个“可复用的测试开发平台骨架（Template）”。

- 主干能力：项目/环境/运行/产物/审计等通用平台模块（更像“中台”，而不是某个单点 demo）。
- 技术架构：双 Plane（Control Plane vs Execution Plane），并坚持“契约优先”。
- 示例：包含一个 SQL Agent 小案例，用来示范“如何按照范式开发/联调”。
- `examples/`：主要用于保留调研期参考与借鉴代码（未来查阅资料时复用）。

## 文档规范（读者入口 / 同步规则）

原则：根目录 `README.md` 是给读者看的“唯一入口”；`docs/` 用于沉淀架构思想、范式与实现细节。

- 读者入口：先看本 README（定位 + 可运行命令 + 目录语义）。
- 深入材料：需要理解架构/范式/协议细节时，再看 `docs/README.md`。
- 规则与标准：统一写在 `docs/standards.md`（包含契约同步机制与变更清单）。

## 快速开始

### 依赖

- Python 3.13（后端）
- uv（Python 依赖/环境管理；Makefile 默认使用 `uv`）
- Node.js + npm（前端）
- Docker（本地 Postgres + Redis；如果你有自己的 DB，也可以不用 Docker）

可选：如果你需要运行/查看 `examples/ag-ui`（AG-UI 协议参考实现），请初始化 submodule：

```bash
git submodule update --init --recursive
```

### 一键联调（推荐给新同学）

```bash
make help

make py.sync
make fe.install
make dev.platform
```

常用校验：

```bash
make dev.check
make cp.smoke
```

### 只启动“平台骨架”（不启动执行面）

平台跑批（Dummy Runner）是 polling 模式，不依赖 AG-UI SSE；如果你只想跑平台模块（Projects/Environments/Runs/Artifacts/Audit）：

```bash
make py.sync
make fe.install

make dev.db
make dev.cp
make dev.frontend
```

更多命令与故障排查：`docs/dev-commands.md`。

## UI 与协议：先选对链路（避免最常见误区）

你们会同时看到两套 UI/协议，这是刻意设计的“双入口”，不是重复建设：

- 调 graph/agent（执行面）：用 `agent-chat-ui` 直连 Execution Plane（LangGraph Agent Server API）
  - 验证：prompt/tool/state/checkpoint/stream 是否正确
  - 不验证：鉴权/租户/RBAC、409 busy、审计、脱敏、对外错误码/事件契约

- 验收平台语义/对外契约：走 Control Plane（AG-UI v1）
  - 生产对外：只暴露 AG-UI（通过 Control Plane）；Execution Plane 不对终端用户开放
  -（可选）联调参考：可用 Dojo/最小 client 对照观察 AG-UI SSE 事件序列（不作为验收标准）

详细说明：`docs/developer-experience.md`、`docs/api-contract.md`。

## 仓库结构（你应该关心的目录）

```text
.
├── control_plane/    # Control Plane（FastAPI Gateway）：鉴权/租户隔离/平台 API/审计/并发语义
├── frontend/         # 前端（Ant Design Pro/Umi）：平台 UI（项目/环境/运行/审计等）
├── docs/             # 权威技术文档：架构、思想、范式、契约、联调说明
├── shared/           # 跨前后端共享契约资产（JSON examples、错误码、事件注册表、mapping）
├── test-apps1/        # 练手靶场 1（SUT）：Full Stack FastAPI Template（FastAPI + React + Postgres + Playwright）
├── test-apps2/        # 练手靶场 2（SUT）：Cypress Real World App（Express + React + lowdb + Cypress，含 API+UI 测试）
├── examples/         # 调研期示例与外部参考（保持现状；未来查阅资料可能用得上）
├── teach/            # 内部教学/实验记录（不要求读者关注）
├── tmp/              # 本地调研/临时产物（不属于主干实现）
└── Makefile          # 本地开发统一入口（强烈建议先看 `make help`）
```

## 练手靶场（独立被测项目）

`test-apps1/` 和 `test-apps2/` 是**完全独立**的被测业务系统（SUT, System Under Test），用于：

- 新同学练手：写 API 集成测试、写 UI E2E 测试
- 平台联调：未来可通过本仓库的平台（Control Plane）去触发/采集它们的测试运行（Runs/Artifacts/Reports）

它们不会参与本仓库的 `uv` workspace，也不会影响 Control Plane / Frontend / Execution Plane 的正常运行。

使用说明见：`docs/test-apps.md`

## 设计目标与边界

本仓库不是“单一测试类型”的专用项目；它更接近一个可演进的平台骨架。

- 目标（Phase A / MVP）：先把通用平台链路做扎实
  - Project：项目容器与团队协作
  - Environment：执行目标（含并发/锁位语义）
  - Run/RunEvent：可追溯的执行记录与事件流
  - Artifact：产物与证据链
  - RBAC/Audit：权限与关键写操作审计
- 非目标：在模板阶段不绑定复杂调度系统/评测体系/某个特定测试类型

更完整的产品/对象模型与 roadmap：`docs/platform/00-overview.md`。

## 文档入口（docs/）

`docs/README.md` 是技术文档索引，建议阅读顺序：

1) `docs/architecture.md`：总体架构、边界与落地路线（双 Plane / 契约优先）
2) `docs/platform/README.md`：通用测试管理文档集（产品能力与对象模型）
3) `docs/control-plane.md`：Control Plane（FastAPI Gateway）设计与语义
4) `docs/api-contract.md` + `docs/frontend-contract.md`：前后端契约（AG-UI / SSE / errors）
5) `docs/dev-commands.md`：本地开发与联调命令（与 Makefile 对齐）

## SQL Agent 小案例（示范范式）

执行面（Execution Plane）主干实现位于 `execution_plane/`：

- 入口配置：`execution_plane/langgraph.json`（包含 graph `sql_agent`）
- SQL Agent 实现：`execution_plane/src/ep/agents/sql_agent/graph.py`

本案例的目的：告诉读者“如何组织一个可运行的 agent/graph”，并可用于联调 Control Plane 到执行面的链路（具体联调方式见 `docs/dev-workflow.md` 与 `docs/developer-experience.md`）。

关于 `examples/` 的定位与查阅原则：`examples/README.md`。

## 契约与变更约定（shared/）

本仓库强调“契约优先”，`shared/` 用于存放可复制的协议资产：

- HTTP 错误码与示例：`shared/contracts/http/errors.md`、`shared/contracts/http/examples/`
- AG-UI 自定义事件注册表：`shared/contracts/agui/custom-events.md`
- 前端接口映射表：`shared/contracts/frontend/mapping.md`

CI 约束：如果改动了 `docs/*contract*` 或 `shared/contracts/**/examples/*`，需要同步更新 `shared/contracts/frontend/mapping.md`（见 `/.github/workflows/contract-guard.yml`）。
