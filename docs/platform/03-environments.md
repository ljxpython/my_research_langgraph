# 环境管理（Environments）

Environment 是执行目标与复现边界：每次 Run 必须固化到某个 environment。

本章给出 Phase A（Dummy Runner）阶段的“通用且可定制”的 Environment 设计。

## 0) 已收敛决策（当前版本冻结）

- Environment type：MVP 只支持 `type=generic`（避免过早绑定特定执行面）
- 配置形态：核心字段稳定 + `config_json` 可扩展，但必须受控（schema 校验 + 禁止明文敏感信息）
- 配置扩展：允许 `config_json.extensions` 作为扩展命名空间（避免顶层字段野蛮生长）
- 健康检查：MVP 只做“配置级健康”（validate 配置结构与 secret 引用格式），不做真实连通性探测
- 并发锁：按 Environment 锁（同一 environment 同时只允许 1 个 active run）
  - busy 错误：HTTP 409 `ENVIRONMENT_BUSY`，details：`{ environmentId, activeRunId }`
  - 锁具备 TTL，避免因进程崩溃导致永久 busy；并提供人工解锁（owner/admin）

锁 TTL（MVP 默认）：2 小时（可配置）。

## 0.1 Phase B 演进（已收敛方向）

- environment 并发上限从 1 扩展到 N：由 `config_json.policy.maxConcurrentRuns` 控制
- 锁语义从“active_run_id 单值”扩展为“active_runs（最多 N 个）”
- 当达到并发上限时仍返回 409 `ENVIRONMENT_BUSY`（不引入队列；队列后置为 Phase C 级能力）

## 1) 设计原则

- Environment 必须 project scoped（避免全 tenant 混用导致权限与复现混乱）
- 配置不落明文敏感信息：只存引用（secret ref）
- 必须有健康状态与最后错误（便于排障）

补充（部署形态）：

- 当前阶段允许单机部署，但后续会演进为多副本。
- 因此 environment lock 不能依赖进程内内存锁。
- 推荐做法：锁字段在 DB 中原子更新（例如基于事务 + 条件更新），确保多副本一致。

补充解释（面向中台新人）：

- Environment 的核心价值是“可复现”：Run 绑定 Environment（最好再绑定 revision），否则环境改动后历史 run 无法解释。
- Environment 的核心风险是“配置泥潭”：如果允许随便塞 JSON，最终没人能知道哪些字段生效、哪些字段危险。

## 2) MVP 范围

- Environment CRUD（active/disabled）
- Health check：至少支持手动触发与状态展示
- 执行目标映射：environment -> execution_target_id（后续可扩展多 region）

MVP 不做：环境模板/审批流/跨环境 promotion。

## 2.1 `type=generic` 的定位

`generic` 的目标不是“什么都能配”，而是：

- 提供一组通用字段（executionTargetId/timeoutMs/labels/policy/secrets）
- 允许在 `extensions` 下扩展
- 平台核心只依赖通用字段；扩展字段只对特定 runner/resolver 生效

## 3) 数据模型（建议）

- environments
  - environment_id
  - tenant_id
  - project_id
  - name
  - type
  - status
  - config_json
  - health_status
  - last_heartbeat_at
  - last_error

并发锁相关字段（MVP 建议直接放在 environments 表上，便于原子更新）：

- active_run_id（当前占用此环境的 run）
- lock_acquired_at
- lock_expires_at

说明：锁字段不允许通过普通 PATCH 修改，只能由“触发 run / cancel / unlock”这类受控动作更新。

## 3.1 config_json（受控扩展）

MVP 建议 config_json 的最小集合（不代表只能有这些，但顶层只允许这些 + extensions）：

- executionTargetId: string
  - 例："local-dev" / "docker-dev" / "prod-cn"
- timeoutMs: number（毫秒）
- labels: object<string,string>（用于过滤/报表/归类，不参与执行）
- policy: object
  - maxConcurrentRuns: number（MVP 固定为 1；未来可扩展到 N）
- secrets: object<string,string>
  - value 必须是 SecretRef（引用），禁止明文
- extensions: object（任意 JSON object，必须走命名空间）

建议的 SecretRef 形式（MVP 只校验格式，不解析取值）：

- `secret://project/<secret_id>#<key>`
- `secret://tenant/<secret_id>#<key>`

注意：为了避免误把敏感信息落库，平台在保存 config_json 时应做两类检查：

1) 结构检查：只允许上述顶层字段
2) 明文敏感信息检查：
   - `secrets` 以外出现疑似 secret 的字段（例如 key 名为 password/token/apiKey）应拒绝或要求改为 SecretRef

## 4) API 草案（讨论用）

- `GET /v1/projects/{project_id}/environments`
- `POST /v1/projects/{project_id}/environments`
- `GET /v1/environments/{environment_id}`
- `PATCH /v1/environments/{environment_id}`
- `POST /v1/environments/{environment_id}:disable`
- `POST /v1/environments/{environment_id}:enable`
- `POST /v1/environments/{environment_id}:check`（手动健康检查）

并发锁相关（MVP 建议增加）：

- `POST /v1/environments/{environment_id}:unlock`
  - 仅 owner/admin 可用
  - 目的：处理极端情况下的“锁遗留”（例如服务崩溃导致 lock_expires_at 前一直 busy）
  - 必须写审计（audit）

## 5) Open Questions

- 是否要区分“环境模板（tenant 级）”和“项目环境（project 级）”？（MVP 先不做模板）
