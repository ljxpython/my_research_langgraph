# Infra（本地/测试环境）

目标：用最少的依赖，在本机快速准备 Control Plane 与 Execution Plane 所需的基础设施。

你们已敲定：
- Redis：不要求持久化（主要用作 LangGraph 执行面的 pub-sub broker）
- Postgres：需要持久化（Control Plane 元数据 + LangGraph 执行面数据库）
- DB 方案：一个 Postgres 实例 + 两个数据库：
  - `langgraph_db`：Execution Plane（LangGraph Agent Server）
  - `control_plane_db`：Control Plane（FastAPI Gateway）

> 注意：以下命令面向 macOS（你当前环境）。

---

## 1) 启动 Redis（不持久化）

```bash
docker run -d --name langgraph-redis \
  --restart unless-stopped \
  -p 6379:6379 \
  redis:6
```

检查：

```bash
docker logs -f langgraph-redis
```

---

## 2) 启动 Postgres（持久化）

说明：加了 Docker volume，确保容器删除后数据仍在。

```bash
docker run -d --name langgraph-postgres \
  --restart unless-stopped \
  -p 5432:5432 \
  -e POSTGRES_DB=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -v langgraph-postgres-data:/var/lib/postgresql/data \
  postgres:16
```

检查：

```bash
docker logs -f langgraph-postgres
```

---

## 3) 创建两个数据库（符合方案 A）

等待 Postgres 启动后执行：

```bash
docker exec -it langgraph-postgres psql -U postgres -d postgres -c "CREATE DATABASE langgraph_db;"
docker exec -it langgraph-postgres psql -U postgres -d postgres -c "CREATE DATABASE control_plane_db;"
```

验证：

```bash
docker exec -it langgraph-postgres psql -U postgres -d postgres -c "\l"
```

---

## 4) 连接串约定（与文档一致）

### 4.1 Execution Plane（LangGraph Agent Server）

- `DATABASE_URI=postgres://postgres:postgres@host.docker.internal:5432/langgraph_db?sslmode=disable`
- `REDIS_URI=redis://host.docker.internal:6379/0`

### 4.2 Control Plane（FastAPI Gateway）

- `CONTROL_PLANE_DATABASE_URI=postgres://postgres:postgres@host.docker.internal:5432/control_plane_db?sslmode=disable`

说明：
- `host.docker.internal` 适用于 Docker 容器访问宿主机（macOS/Windows 常用）。
- 如果后续你们把服务都放进同一个 Docker network，可以用容器名 `langgraph-postgres` / `langgraph-redis` 替代。

---

## 5) 常用运维���令

查看运行状态：

```bash
docker ps --filter "name=langgraph-"
```

重启：

```bash
docker restart langgraph-redis
docker restart langgraph-postgres
```

停止/删除（谨慎）：

```bash
docker stop langgraph-redis langgraph-postgres
docker rm langgraph-redis langgraph-postgres
```

删除 Postgres 数据（会丢数据，谨慎）：

```bash
docker volume rm langgraph-postgres-data
```
