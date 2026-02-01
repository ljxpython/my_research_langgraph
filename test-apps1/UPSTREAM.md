# Upstream

本目录为练手靶场（SUT）用途，从上游项目“整仓迁入”（vendor copy），并移除了嵌套的 `.git/`，以避免子仓库语义。

- Upstream repo: https://github.com/fastapi/full-stack-fastapi-template
- Imported ref: `1c6d656482d9ab7d885138d4fd27cf0fdd9ea2fa`
- License: MIT（见 `test-apps1/LICENSE`）

注意：上游项目自带大量工程化能力（Traefik、Docker Compose、多环境配置）。我们不在本仓库主干里“二次抽象”它，只把它当作可运行的被测系统。
