# LangGraph API (Docker Single)

本目录用于**仅部署 LangGraph Agent Server API**（不包含控制台/UI）。

## 目录结构

- `langgraph.json`：LangGraph 部署配置（graphs/依赖/env）
- `.env`：环境变量（请自行填写密钥）
- `app/`：业务代码

## 前置条件

- 已安装 Docker
- 已安装 LangGraph CLI（用于构建镜像）

## 构建镜像

在本目录执行：

```bash
cd "/Users/bytedance/PycharmProjects/my_best/langgraph_teach/src/docker_single"
python -m langgraph_cli build -t langgraph-api:local
```

## 启动方式

### 方式 A：单独启动 Redis + Postgres（docker run）

启动 Redis：
```bash
docker run -d --name langgraph-redis -p 6379:6379 redis:6
```

启动 Postgres：
```bash
docker run -d --name langgraph-postgres -p 5432:5432 \
  -e POSTGRES_DB=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  postgres:16
```

启动 LangGraph API（后台运行）：
```bash
docker run -d --name "langgraph-api" -p 8123:8000 \
  --env-file ".env" \
  -e REDIS_URI="redis://host.docker.internal:6379/0" \
  -e DATABASE_URI="postgres://postgres:postgres@host.docker.internal:5432/postgres?sslmode=disable" \

  langgraph-api:local
```

查看状态：
```bash
docker ps --filter "name=langgraph-api"
```

查看日志：
```bash
docker logs -f "langgraph-api"
```

重启：
```bash
docker restart "langgraph-api"
```

### 方式 B：Docker Compose（一键启动三件套）

创建 `docker-compose.yml`（示例）：

```yaml
volumes:
  langgraph-data:
    driver: local

services:
  langgraph-redis:
    image: redis:6
    healthcheck:
      test: redis-cli ping
      interval: 5s
      timeout: 1s
      retries: 5

  langgraph-postgres:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: postgres
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - langgraph-data:/var/lib/postgresql/data
    healthcheck:
      test: pg_isready -U postgres
      start_period: 10s
      timeout: 1s
      retries: 5
      interval: 5s

  langgraph-api:
    image: langgraph-api:local
    ports:
      - "8123:8000"
    depends_on:
      langgraph-redis:
        condition: service_healthy
      langgraph-postgres:
        condition: service_healthy
    env_file:
      - .env
    environment:
      REDIS_URI: redis://langgraph-redis:6379
      DATABASE_URI: postgres://postgres:postgres@langgraph-postgres:5432/postgres?sslmode=disable
      LANGSMITH_API_KEY: ${LANGSMITH_API_KEY}
```

启动：
```bash
docker compose up -d
```

## 停止服务

### 方式 A（docker run）

停止 Redis / Postgres：
```bash
docker stop langgraph-redis langgraph-postgres
```

停止 LangGraph API：
```bash
docker stop "langgraph-api"
```

删除 LangGraph API 容器（可选）：
```bash
docker rm "langgraph-api"
```

删除容器（可选）：
```bash
docker rm langgraph-redis langgraph-postgres
```

### 方式 B（docker compose）

停止并清理：
```bash
docker compose down
```

## 健康检查

```bash
curl --request GET --url 0.0.0.0:8123/ok
```
返回：
```json
{"ok": true}
```

## 备注

- `.env` 里请填写必要的密钥与配置（例如 `LANGSMITH_API_KEY`、`ZHIPUAI_API_KEY`）。
- Redis / Postgres 可共享实例，但不同部署不能使用同一个 Redis DB 或同一个 Postgres 数据库。
- `app/agent.py` 中可能依赖特定环境变量（例如 `ZHIPUAI_API_KEY`），未配置会直接报错。
