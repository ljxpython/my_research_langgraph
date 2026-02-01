# test-apps1：练手靶场 1（FastAPI + React + Postgres + Playwright）

这是一个“麻雀虽小，五脏俱全”的业务系统，用来练：

- API 集成测试（后端 Pytest）
- UI E2E 测试（Playwright）
- 平台联调（未来 runner 接入时：Runs/Artifacts/Reports）

上游来源与 license：见 `test-apps1/UPSTREAM.md`。

## 依赖

- Docker Desktop（必须）

可选（仅当你想在宿主机直接跑 Playwright，而不是用容器跑）：Node/Bun。

## 启动（推荐：Docker Compose，本地最稳）

在 `test-apps1/` 下运行：

```bash
docker compose -f compose.yml -f compose.training.override.yml up -d --build --wait db backend frontend mailcatcher
```

常用访问地址（training 端口直连，不依赖 Traefik 域名）：

- Backend API: `http://localhost:18000`
- Backend Swagger: `http://localhost:18000/docs`
- Frontend: `http://localhost:15173`
- Mailcatcher UI: `http://localhost:11080`

默认账号（仅用于练手，不要用于生产）：

- 用户名：`admin@example.com`
- 密码：`changethis`

来源：`test-apps1/.env`

## 停止与清理

```bash
docker compose -f compose.yml -f compose.training.override.yml down -v
```

`-v` 会清理 Postgres volume（对“可重复跑测试”很重要）。

## 跑 API 测试（Pytest）

上游 backend 镜像默认不包含 `./backend/tests/`。为了让练手者不安装本机 Python，本仓库提供一个专用测试容器（只挂载 tests 目录）。

在 `test-apps1/` 下运行：

```bash
docker compose -f compose.yml -f compose.training.override.yml run --rm backend-tests
```

它会执行上游脚本 `backend/scripts/tests-start.sh`，并在 `test-apps1/backend/htmlcov/` 生成覆盖率报告。

## 跑 UI E2E（Playwright）

上游 README 推荐用 Bun 在宿主机执行 `bunx playwright test`；为了减少本地依赖，本仓库建议用容器方式：

```bash
docker compose -f compose.yml -f compose.training.override.yml run --rm playwright bunx playwright test
```

测试产物目录（会写到宿主机 `test-apps1/frontend/` 下）：

- `test-apps1/frontend/test-results/`
- `test-apps1/frontend/blob-report/`

## 练手建议（给新人）

建议按这个顺序练：

1) API：补 2-3 个“鉴权 + CRUD + 错误码”用例（Pytest）
2) UI：补 1-2 个“登录 -> 新增 item -> 列表出现 -> 删除”的 E2E（Playwright）
3) 做一次“数据重置/隔离”练习：让测试可重复跑，不依赖手工清库
