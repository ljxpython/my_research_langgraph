# Upstream

本目录为练手靶场（SUT）用途，从上游项目“整仓迁入”（vendor copy），并移除了嵌套的 `.git/`，以避免子仓库语义。

- Upstream repo: https://github.com/cypress-io/cypress-realworld-app
- Imported ref (branch `develop`): `39fc97dfcb5e35f83e0fa05319fc0e2e117b9af9`
- License: MIT（见 `test-apps2/LICENSE`）

这个项目本身就是为了演示“如何做真实世界测试”而生，包含 API 与 UI 的 Cypress 用例，非常适合作为被测系统（SUT）。
