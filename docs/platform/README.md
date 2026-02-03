# 通用测试管理（Platform）文档集

这组文档用于定义“通用测试管理/中台”的产品能力与工程边界。

目标：先把通用平台能力（项目/环境/运行/报告/审计/附件）做扎实，再把“智能体”作为一种可插拔执行器接入。

## 阅读顺序

1) `docs/platform/00-overview.md`：总纲（范围、术语、对象模型、MVP 验收、roadmap）
2) `docs/platform/01-auth-and-rbac.md`：身份与权限
3) `docs/platform/02-projects.md`：项目管理
4) `docs/platform/03-environments.md`：环境管理
5) `docs/platform/04-runs.md`：运行与日志事件
6) `docs/platform/05-artifacts.md`：产物与证据链
7) `docs/platform/06-reports.md`：报告与看板
8) `docs/platform/07-audit.md`：审计（写操作）
9) `docs/platform/08-settings-and-retention.md`：设置与保留期
10) `docs/platform/09-dummy-runner-e2e.md`：Dummy Runner 端到端链路
11) `docs/platform/10-quota-and-rate-limit.md`：配额与限流
12) `docs/platform/99-open-questions.md`：未决问题（需要评审收敛）

## 与现有 docs 的关系

- `docs/control-plane.md` / `docs/api-contract.md` 侧重“平台对前端/执行面的协议与控制面设计”。
- `docs/platform/*` 侧重“中台产品能力与数据模型的通用规划”。

两者需要一致：
- 控制面（Control Plane）必须遵守这里定义的对象模型与权限边界。
- 前端页面信息架构必须能映射到这里的模块划分。

## 工作约定（本地目录不纳入主干）

以下目录/文件是本地调研与临时产物，不纳入主干实现（后续会用仓库级 `.gitignore` 精确忽略）：

- `tmp/`
- `examples/` 下的部分外部参考目录（以 ignore 列表为准）
- `examples/docker_single/**/Chinook.db`

注意：`examples/` 不是一刀切忽略；我们只忽略明确“不纳入”的子目录，避免误伤未来要保留的示例。
