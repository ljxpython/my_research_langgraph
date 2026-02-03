# 01 - Quickstart：最小 LangServe 服务

本章只做一件事：跑起来一个 LangServe 服务，并能用 `curl` 调到它。

## 0. 代码位置

- `teach/langserve/demo_min_server/server.py`
- `teach/langserve/demo_min_server/requirements.txt`

## 1. 安装依赖（使用仓库根环境）

在仓库根目录执行（推荐：uv workspace + 根目录单一 `.venv`）：

```bash
uv sync

# 如果你看到 "No module named pip"，先执行：
.venv/bin/python -m ensurepip --upgrade

.venv/bin/python -m pip install -r teach/langserve/demo_min_server/requirements.txt
```

如果你不使用 uv，也可以用传统 venv：

```bash
python -m venv .venv
source .venv/bin/activate

pip install -r teach/langserve/demo_min_server/requirements.txt
```

## 2. 配置环境变量

这个 demo 默认用 OpenAI。

```bash
export OPENAI_API_KEY='YOUR_KEY'
export OPENAI_MODEL='gpt-4o-mini'
```

说明：

- 如果你不想写死模型，可以不设置 `OPENAI_MODEL`，demo 会用默认值。

## 3. 启动服务

```bash
python teach/langserve/demo_min_server/server.py
```

如果你想确保一定用根 `.venv`，可以显式用解释器：

```bash
.venv/bin/python teach/langserve/demo_min_server/server.py
```

默认监听：`http://127.0.0.1:8001`

## 4. 打开 Swagger

浏览器访问：

- `http://127.0.0.1:8001/docs`

你会看到 LangServe 自动暴露的 endpoints（例如 `/joke/invoke`、`/joke/stream`）。
