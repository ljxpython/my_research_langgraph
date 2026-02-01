# 规范与标准（文档入口 / 契约同步 / 变更规则）

目标：把“模板仓库”长期维护时最容易漂移的部分（文档入口、契约、示例、实现）固定成规则。

本文件面向贡献者与维护者。读者/用户通常只需要看根目录 `README.md`。

---

## 1) 文档分工与权威来源

### 1.1 根目录 README.md（读者入口）

`README.md` 的职责：让第一次进入仓库的读者在 5 分钟内做到：

- 明白这是什么（模板定位、包含能力、非目标）
- 跑起来（最短命令链路）
- 知道去哪里继续看（只给少量关键链接）

规则：

- 根目录 `README.md` 是“读者入口的唯一入口”。
- 任何会影响“读者如何跑起来/怎么理解仓库边界”的变更，都必须同步更新 `README.md`。

### 1.2 docs/（维护者手册）

`docs/` 的职责：沉淀技术架构、设计思想、范式、协议与边界讨论。

规则：

- `docs/README.md` 是 `docs/` 的索引入口。
- `docs/` 允许存在“规划/演进路线”，但必须保证与当前实现不冲突（写清楚：现状 vs 规划）。

### 1.3 shared/（契约资产）

`shared/` 的定位：共享“契约资产”，不共享业务代码。

规则：

- `shared/` 只放契约与示例（JSON examples、错误码表、事件注册表、字段说明）。
- 不在 `shared/` 放业务逻辑与运行时代码依赖。

### 1.4 examples/（参考资料）

`examples/` 的定位：调研期示例、POC、外部参考与对照代码。

规则：

- `examples/` 允许“保持现状”。它不是主干实现依赖。
- 如果某个可运行示例被主干联调用到，必须在 `README.md` 明确指出（避免读者把 `examples/` 当成主干代码）。

---

## 2) 契约同步机制（必须执行）

本仓库强调“契约优先”。契约变更必须可被前端感知，并在 CI 中被强制。

### 2.1 什么是“契约变更”？

满足以下任意一条，都属于契约变更：

- API path/method 变更
- response shape / error body shape 变更
- error.code 新增/重命名/语义变化
- AG-UI 事件 type/name/payload 变更（包含 CUSTOM 事件）
- busy/cancel/snapshot/interrupt-resume 等交互语义变化

### 2.2 必须同步更新哪些文件？

契约变更时，必须同步更新（按影响面选择）：

- 规范文档：`docs/api-contract.md`、`docs/frontend-contract.md`
- 共享资产：
  - `shared/contracts/http/errors.md`
  - `shared/contracts/http/examples/*`
  - `shared/contracts/agui/custom-events.md`
- 前端映射表（必须）：`shared/contracts/frontend/mapping.md`

### 2.3 CI 强制规则（contract-guard）

GitHub Actions 已实现最小强制：

- 实现：`/.github/workflows/contract-guard.yml`
- 触发条件（任意改动都会触发要求）：
  - `docs/api-contract.md`
  - `docs/frontend-contract.md`
  - `shared/contracts/http/errors.md`
  - `shared/contracts/agui/custom-events.md`
  - `shared/contracts/http/examples/*`
- 强制要求：只要触发，必须同时改动 `shared/contracts/frontend/mapping.md`，否则 CI 失败。

这条规则的目的：让“契约变更”对前端是可见的，避免后端改完但前端毫无感知。

---

## 3) 变更检查清单（PR Checklist）

### 3.1 影响读者（入口/运行方式）

以下变更发生时，必须更新根目录 `README.md`：

- Makefile 新增/变更常用命令（例如 `dev.platform` 行为改变）
- 默认端口、env 变量、依赖要求改变
- 主干能力范围改变（平台模块增删、关键链路改变）

### 3.2 影响契约（前后端对接）

以下变更发生时，必须更新契约与 mapping：

- 任意 API/错误码/事件语义调整
- snapshot/cancel/busy/interrupt-resume 的字段或时序调整

并确保通过 contract-guard：`/.github/workflows/contract-guard.yml`。

---

## 4) 关联文档

- 文档索引：`docs/README.md`
- 对接机制背景：`docs/integration-guardrails.md`
- 前端映射表：`shared/contracts/frontend/mapping.md`
