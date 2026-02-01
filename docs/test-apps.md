# 练手靶场（SUT Projects）

本仓库除了“平台本身”（Control Plane + Frontend + Execution Plane）之外，还内置了两个**完全独立**的“被测业务系统”（SUT, System Under Test）。

它们的定位：

- 给使用者练手：写 API 集成测试 + 写 UI E2E 测试（两者都要）
- 给平台联调：未来平台侧实现真实 runner 后，可以把 SUT 当成外部目标，触发测试、采集日志/产物、生成报告

重要约束：

- 这两个目录不会加入本仓库 `uv` workspace，也不会被 `make py.sync` 影响。
- 这两个目录的依赖、启动方式、端口、数据，都由它们自己管理。
- 运行 SUT 可能占用一些常见端口（例如 8000/5173/3000/3001）。如果你同时在跑平台，请先确认端口不冲突。

## 目录

- `test-apps1/`: Full Stack FastAPI Template（FastAPI + React + Postgres + Playwright）
- `test-apps2/`: Cypress Real World App（Express + React + lowdb + Cypress；自带 API + UI 测试用例）

每个 SUT 目录下都有：

- `UPSTREAM.md`: 上游来源、commit、license
- `TRAINING.md`: 练手使用说明（启动/重置/跑 API 测试/跑 UI 测试）

快捷入口：

- `test-apps1/TRAINING.md`
- `test-apps2/TRAINING.md`

## 一句话跑通

推荐用 Makefile（更适合新同学，不用记 docker compose 参数）。

SUT1（FastAPI + React + Playwright）：

```bash
make test-apps1.up
make test-apps1.test.api
make test-apps1.test.ui
```

SUT2（Cypress RWA，一条命令跑 types/lint/unit/api/ui）：

```bash
make test-apps2.test.ci
```

## 一键启动 / 停止（仅启动服务，不跑测试）

如果你只想把两个被测系统跑起来，用浏览器手动点点：

```bash
make test-apps.up
```

停止：

```bash
make test-apps.down
```

分别启动/停止：

```bash
make test-apps1.up
make test-apps1.down

make test-apps2.up
make test-apps2.down
```

注意：

- `test-apps1` 使用 training 端口避让策略（避免和平台的 8000/5432 冲突），默认：frontend=15173, backend=18000, postgres=15432。
- `test-apps2` 默认：frontend=3000, backend=3001。

如果你希望清理容器 volume（重置数据库/依赖缓存）：

```bash
make test-apps1.clean
make test-apps2.clean
```

## 和平台怎么“解耦”

当前平台侧（Control Plane）Phase A 的 PlatformRun 只支持 `runner=dummy`（仅做事件模拟，不会真的去执行外部测试）。

你现在把 SUT 放进仓库，目的不是“立刻被平台自动执行”，而是先把：

1) 可重复运行的被测系统（SUT）
2) 可重复执行的测试（API + UI）

这两件事固定下来。

后续当你实现真实 runner（例如：docker runner / shell runner / playwright runner）时，再把它们接入到平台的 Runs/Artifacts/Reports 证据链即可。
