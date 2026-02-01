# test-apps2：练手靶场 2（Express + React + lowdb + Cypress）

这是 Cypress 官方维护的 Real World App（RWA），重点就是“真实场景下如何做测试”。

它自带：

- API 测试用例：`test-apps2/cypress/tests/api/`
- UI E2E 测试用例：`test-apps2/cypress/tests/ui/`

上游来源与 license：见 `test-apps2/UPSTREAM.md`。

目录结构说明：

- 后端代码在 `test-apps2/backend/`
- 前端代码在仓库根目录（上游就是这种布局；为了保持“可直接跑通”，这里不强行重排成 `frontend/`）

## 推荐的运行方式（Docker，一条命令跑通）

因为上游推荐的 Node 版本是 `^20 || ^22`（见 `test-apps2/.node-version`、`test-apps2/package.json`），而不同机器的 Node 版本差异会导致踩坑，本仓库提供一个“容器内一键执行”的方式：

在 `test-apps2/` 下运行：

```bash
docker compose -f compose.training.yml run --rm ci
```

它会在同一个容器里完成：

- 安装依赖
- types/lint/unit
- build
- 启动 app（`yarn start:ci`）并等待 `http://localhost:3000`
- 跑 API Cypress
- 跑 UI Cypress（默认 Electron headless；更稳定，不依赖容器内是否能探测到 Chrome）

首次运行可能会下载 Cypress 二进制（会比较慢）；后续会复用 `test-apps2_cypress-cache` 这个 Docker volume。

这适合：

- 新人练手（不污染本机 node/yarn 环境）
- 你未来在平台 runner 里做“外部脚本执行”时，直接复用这条命令

## 本地开发方式（可选）

如果你希望本地边改边看：

在 `test-apps2/` 下：

```bash
corepack enable
yarn
yarn dev
```

默认端口：

- Frontend: `http://localhost:3000`
- API: `http://localhost:3001`

然后另开终端跑测试：

```bash
yarn test:api
yarn test:headless
```

## 账号与数据

项目自带种子数据：`test-apps2/data/database.json`。

默认所有用户密码：`s3cret`（上游 README 有说明）。

## 练手建议（给新人）

建议按这个顺序练：

1) 先跑 `docker compose -f compose.training.yml run --rm ci`，把全链路跑通
2) API：新增 2-3 个覆盖“鉴权失败/边界条件/幂等”的用例（放在 `cypress/tests/api/`）
3) UI：新增 1-2 个“转账/评论/通知”等跨页面流程用例（放在 `cypress/tests/ui/`）
