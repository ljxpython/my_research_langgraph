# Execution Plane Roadmap（演进规划）

本文档的目标：把 Execution Plane 的后续扩展路线写清楚，避免“只看一期实现”造成误解。

原则（不变）：
- Control Plane（CP）负责：鉴权/租户/RBAC、审计、对外契约（AG-UI）、并发治理（busy/cancel/snapshot）。
- Execution Plane（EP）负责：跑图 + 持久化 + streaming（LangGraph Agent Server）。
- EP 不承载平台语义；EP 不面向终端用户开放。

阅读建议：
- 先看 `docs/execution-plane.md` 理解执行层形态与 dev vs docker。
- 本文只讲“演进路线”，每个 Phase 都写清：目标/验收/不做什么/风险。

---

## Phase 1（一期 / 当前）：把执行层主干落地并跑通 SQL Agent

目标：
- 新建 `execution_plane/` 作为主实现（`examples/` 继续只做参考）。
- 以 `sql_agent` 跑通：
  - EP 可独立运行（`langgraph dev`）。
  - CP 通过 `LANGGRAPH_API_URL` 调用 EP，跑通 run/snapshot/cancel 链路。

验收标准：
- `langgraph dev` 能启动并暴露 graph（至少 `sql_agent`）。
- `agent-chat-ui` 直连 EP 可以稳定跑通 1-2 条 SQL 问答。
- CP 配置 `LANGGRAPH_API_URL` 后，平台入口能跑通：run -> snapshot -> cancel（best-effort）。

不做什么：
- 不引入 MCP / Node 依赖（避免一期把工具接入复杂化）。
- 不做多租户隔离（由 CP 负责；EP 暂不做服务到服务鉴权）。

主要风险：
- env/key 混乱导致读者无法复现；一期必须把 .env.example 和运行方式写清楚。

---

## Phase 2：生产化底座（服务到服务鉴权 + 保留策略 + 最小可观测）

目标：
- CP <-> EP 的服务到服务鉴权闭环：EP 只信任 CP（不承接终端用户鉴权）。
- EP 的数据保留策略落地：避免 checkpoints/store/thread 无限膨胀。
- EP 的运维可观测性基线：健康检查 + 指标采集。

验收标准：
- EP 对外接口启用服务级鉴权（最小策略即可），并明确禁止终端用户直连。
- TTL/retention 在 EP 生效（至少对 dev/预发有明确策略）。
- 能通过健康检查判断“服务活着且 DB 可用”（生产形态）。
- 指标可被抓取（用于后续容量规划与告警基线）。

不做什么：
- 不把审计写入 EP 数据库（审计仍由 CP 负责落库）。
- 不在 EP 做租户资源计费/配额裁决（仍由 CP 负责）。

主要风险：
- header/log 泄露 token/敏感信息；必须做 allowlist。
- 不做 TTL 会导致 Postgres 迟早爆仓。

---

## Phase 3：多 agent 与部署边界（multi-graph / multi-deployment）

目标：
- 支持多 graph：一个 EP 进程暴露多个 graph（SQL/Research/...），或拆分为多个可独立部署单元。
- 明确发布单元（deployment boundary）：避免“一次发版牵动所有 agent”。
- 引入 worker/queue 与容量模型（可抗峰值，避免 API 线程被阻塞）。

验收标准：
- 至少 2 个 graph 可同时在一个 EP 实例中对外提供。
- 新 graph 的引入不破坏既有 graph（版本/依赖可控）。
- 背景 run 在压力下仍可保持稳定（有最小的 soak/负载验证）。

不做什么：
- 不把 CP 的 agent registry/路由策略搬进 EP（EP 只暴露 graph，路由仍由 CP 决定）。

主要风险：
- “一个 EP 装所有 agent”会导致依赖升级与回归成本指数上升；必须尽早定义发布边界。

---

## Phase 4：能力沉淀（skills/MCP 规范化）

目标：
- 引入 `skills/` 目录与复用约定：把可复用能力沉淀为规范包（不绑定平台语义）。
- MCP 工具接入规范化：统一 registry/超时/失败策略/审计可观测字段（但不把密钥下发到终端用户）。

验收标准：
- 至少一个通用 skill 可被多个 agent 复用，且目录结构/文档清晰。
- MCP 工具接入遵循统一约定（可开关、可观测、可控风险）。

不做什么：
- 不让 skill 目录直接承载密钥或敏感配置（密钥来源必须是部署环境或 CP 的服务侧注入）。

---

## 文档放置约定（避免规划丢失）

- 设计说明：`docs/execution-plane.md`
- 演进规划（本文件）：`docs/execution-plane-roadmap.md`
- 文档入口索引：`docs/README.md`
