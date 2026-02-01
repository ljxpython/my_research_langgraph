# 前后端对接：降低阻碍的机制（shared 的作用与不足）

目标：让前后端对接“少踩坑、少扯皮、少返工”。

结论先说：
- `shared/` **能显著减少**对接漂移，但不能“自动保证”永远没问题。
- 你们还需要配套流程与自动化（契约测试、mock、CI 校验），才能把问题提前暴露。

---

## 1) shared/ 能解决什么？

`shared/` 的定位：共享“契约资产”，不是共享业务代码。

当前你们已有：
- `shared/contracts/http/examples/*`：请求/响应示例（run/snapshot/cancel/login/me 等）
- `shared/contracts/http/errors.md`：错误码与统一 error body
- `shared/contracts/agui/custom-events.md`：CUSTOM 事件注册表（interrupt/platform.*）
- `shared/contracts/frontend/*`：前端 store/state 的对齐资产

它能解决的核心问题：
- “字段长什么样”有统一样例，减少口头对齐
- 错误码/事件名固定下来，避免前后端各写各的
- 让新同学能快速理解接口与事件协议

---

## 2) shared/ 不能解决什么？（为什么仍然会出问题）

常见失败模式：
- 后端实现没严格遵守 shared 示例（示例是示例，代码是代码）
- 字段类型/大小/边界条件没在示例里体现（例如 state 很大、tool args 分片）
- streaming 时序差异（SSE 断线、重连、buffer）不是静态 JSON 能完全覆盖

因此你们需要“把 shared 变成可验证的契约”，而不仅是文档。

---

## 3) 我推荐的 4 个对接保障机制（Phase-1 就能做）

### 3.1 契约示例驱动的 Mock（前端不等后端）

- 前端开发时，直接用 `shared/contracts/http/examples/` 做 mock 数据源
- Workbench 的 event store 先在 mock 事件流上跑通（messages/tools/state/interrupt/busy）

### 3.2 后端契约校验（最小）

后端在单测里做两件事：
- response JSON 至少包含 shared 中规定的关键字段（例如 snapshot 必须含 messages/state/busy/activeRunId）
- error body 形状统一（见 `shared/contracts/http/errors.md`）

### 3.3 e2e 冒烟（本地/CI）

建议最小冒烟脚本：
- login -> me -> create thread -> run -> snapshot -> cancel

这条链路跑通，说明“契约闭环”是完整的。

### 3.4 CI 约束：示例与文档不得漂移

建议在 CI 做：
- 改动 API/事件名时，必须同步更新 `docs/` + `shared/` 示例
- 否则直接拒绝合并（这条非常管用）

补充（你们当前最重要的一条）：
- `shared/contracts/frontend/mapping.md` 定义了“接口/事件 -> 前端 store/UI 的映射”。
- 当接口逻辑或事件语义变更时，必须同步更新 mapping，否则前端无法感知变更。

落地方式（最小 CI 规则）：
- GitHub Actions: `.github/workflows/contract-guard.yml`

规范化说明：
- 关于“哪些变更算契约变更、必须同步哪些文件、CI 如何强制”的规则，统一见 `docs/standards.md`。

---

## 4) Phase-2 的更工业化方案（可选）

当平台逐渐稳定后，可进一步引入：

- OpenAPI（控制面）：从 FastAPI 自动导出 schema
- 生成前端 client（只生成 CRUD 类接口；SSE run 仍用自定义 client）
- Contract tests：用 OpenAPI schema 校验请求/响应

注意：
- streaming（SSE）部分通常不适合完全靠 OpenAPI 自动生成，仍建议保留 `@ag-ui/client` 的专用实现。
