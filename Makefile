.PHONY: help \
  py.sync py.sync-active \
  dev.db dev.db-stop \
  cp.migrate \
  fe.install \
  fe.tsc \
  cp.smoke \
  dev.check dev.check-loop \
  dev.checkup \
  dev.exec dev.exec-stop dev.cp dev.cp-stop dev.frontend dev.agui-ui dev.agui-ui-stop \
  dev.exec-bg dev.exec-bg-stop dev.cp-bg dev.cp-bg-stop dev.frontend-bg dev.frontend-bg-stop dev.frontend-stop \
  ep.prod.build ep.prod.up ep.prod.down ep.prod.logs ep.prod.health \
  dev.platform dev.platform-stop dev.platform-bg dev.platform-bg-stop \
  test-apps1.up test-apps1.down test-apps1.clean test-apps1.test.api test-apps1.test.ui \
  test-apps2.up test-apps2.down test-apps2.clean test-apps2.test.ci \
  test-apps.up test-apps.down

# ==================== 中文说明（给新同学） ====================
#
# 这个 Makefile 的目标：把“本地开发/联调”涉及的命令放在一个入口里，避免口口相传。
#
# 三个核心进程：
# - Execution Plane（LangGraph dev）：make dev.exec
# - Control Plane（FastAPI）：make dev.cp
# - Frontend（Ant Design Pro）：make dev.frontend
#
# 常用两种启动方式：
# - 一键联调：make dev.platform（优先 tmux；无 tmux 会自动 fallback 到后台模式）
# - 手动启动：先 make dev.db，然后分别在两个终端启动 dev.cp 与 dev.frontend
#
# 常用环境变量（都可以在 make 命令后覆盖）：
# - CP_PORT：Control Plane 端口（默认 8000）
# - CP_DB_URI：Control Plane 连接串（默认本机 5432/control_plane_db）
# - DEV_DB：是否自动启动 docker 依赖（默认 1；设为 0 表示你自备 DB/Redis）
# - DEV_HEALTH：是否额外开一个 health-check pane（默认 0；设为 1 会跑 dev.check-loop）
#
# 详细“执行顺序/命令清单”请看：docs/dev-commands.md

# ==================== Config ====================

TMUX_SESSION ?= platform-dev

# Prefer python3 (macOS usually has no `python` shim)
PY ?= python3

# Start local infra by default (Docker: Postgres + Redis)
DEV_DB ?= 1

# DEV_HEALTH=1: add a health-check pane in tmux, or run checks once in bg mode.
DEV_HEALTH ?= 0

CP_HOST ?= 127.0.0.1
CP_PORT ?= 8000

# Comma-separated list of allowed CORS origins for Control Plane.
# Example: make CORS_ALLOW_ORIGINS=http://127.0.0.1:3002 dev.cp
CORS_ALLOW_ORIGINS ?=

CP_DB_URI ?= postgresql+psycopg://postgres:postgres@127.0.0.1:5432/control_plane_db

LG_HOST ?= 127.0.0.1
LG_PORT ?= 8123

# Frontend port is controlled by Ant Design Pro; keep as a hint only.
FE_HOST ?= 127.0.0.1
FE_PORT ?= 8001

# If you want to use ONE shared venv at repo root:
#   source .venv/bin/activate
#   make UV_ACTIVE=1 py.sync-active
#   make UV_ACTIVE=1 dev.cp
UV_ACTIVE ?= 0

RUN_DIR ?= .run

# 默认打开：在 CP 启动时额外 seed deep_agent / learn_*，用于“完整体检”联调。
BOOTSTRAP_EXTRA_AGENTS ?= 1

# ==================== Helpers ====================

ifeq ($(UV_ACTIVE),1)
UV_ACTIVE_FLAG := --active
else
UV_ACTIVE_FLAG :=
endif

help:
	@echo "常用命令（中文）:";
	@echo "  make dev.db         - 启动本地依赖（docker: Postgres+Redis，并创建数据库）";
	@echo "  make dev.cp         - 启动 Control Plane（会自动跑 cp.migrate）";
	@echo "  make dev.cp-stop    - 停止占用 CP_PORT 的 Control Plane（按进程特征安全匹配）";
	@echo "  make dev.frontend   - 启动前端（首次需 make fe.install）";
	@echo "  make dev.debug-ui   - 启动 agent-chat-ui（首次需 make debug-ui.install）";
	@echo "  make dev.debug-ui-manual - 启动 agent-chat-ui（手动输入 URL/graph）";
	@echo "  make dev.agui-ui     - 启动 AG-UI demo UI（Next.js, 端口默认 3002）";
	@echo "  make dev.agui-ui-stop - 停止占用 AGUI_UI_PORT 的 demo UI（按端口+进程特征匹配）";
	@echo "  make dev.platform   - 一键启动 exec+cp+frontend（有 tmux 更舒服）";
	@echo "  make test-apps.up   - 一键启动两个练手靶场（test-apps1 + test-apps2）";
	@echo "  make test-apps.down - 停止两个练手靶场（不清理 volume）";
	@echo "  make cp.smoke       - 平台 API 冒烟测试（需要 Postgres）";
	@echo "";
	@echo "Targets:";
	@echo "  py.sync            - Sync Python deps (root + control_plane)";
	@echo "  py.sync-active     - Sync Python deps into ACTIVE venv (UV_ACTIVE=1)";
	@echo "  dev.exec           - Run LangGraph dev (execution_plane)";
	@echo "  dev.exec-stop      - Stop LangGraph dev listening on LG_PORT (safe match)";
	@echo "  ep.prod.build      - Build Execution Plane docker image";
	@echo "  ep.prod.up         - Start Execution Plane (docker compose)";
	@echo "  ep.prod.down       - Stop Execution Plane (docker compose)";
	@echo "  ep.prod.logs       - Tail Execution Plane logs";
	@echo "  ep.prod.health     - Check Execution Plane /ok";
	@echo "  dev.db             - Start local infra (docker: postgres+redis, create DBs)";
	@echo "  dev.db-stop        - Stop docker infra containers";
	@echo "  dev.cp             - Run Control Plane (FastAPI)";
	@echo "  dev.cp-stop        - Stop Control Plane listening on CP_PORT (safe match)";
	@echo "  cp.migrate         - Run Alembic migrations for Control Plane";
	@echo "  fe.install         - Install frontend dependencies (npm install)";
	@echo "  fe.tsc             - Typecheck frontend (tsc --noEmit)";
	@echo "  dev.frontend       - Run Frontend (AntD Pro)";
	@echo "  debug-ui.install   - Install agent-chat-ui dependencies (pnpm)";
	@echo "  dev.debug-ui       - Run agent-chat-ui (auto connect)";
	@echo "  dev.debug-ui-manual - Run agent-chat-ui (manual setup form)";
	@echo "  agui-ui.install    - Install AG-UI demo UI deps (pnpm)";
	@echo "  dev.agui-ui        - Run AG-UI demo UI (Next.js)";
	@echo "  dev.agui-ui-stop   - Stop AG-UI demo UI listening on AGUI_UI_PORT (safe match)";
	@echo "  dev.platform       - Start exec+cp+frontend (tmux if available)";
	@echo "  cp.smoke           - Smoke test platform APIs (requires Postgres)";
	@echo "  dev.check          - Health check (ports + CP /healthz)";
	@echo "  dev.check-loop     - Health check loop (watch)";
	@echo "  dev.platform-stop  - Stop tmux session (if used)";
	@echo "  dev.platform-bg    - Start exec+cp+frontend in background (pidfiles)";
	@echo "  dev.platform-bg-stop - Stop background dev (pidfiles)";
	@echo "  dev.checkup        - Run full-checkup smoke (sql_agent + deep_agent + learn_semantic_search)";
	@echo "  dev.cp-bg          - Run Control Plane in background (pidfile/log)";
	@echo "  dev.cp-bg-stop     - Stop background Control Plane (pidfile/port-safe)";
	@echo "  dev.exec-bg        - Run Execution Plane in background (pidfile/log)";
	@echo "  dev.exec-bg-stop   - Stop background Execution Plane (pidfile/port-safe)";
	@echo "  dev.frontend-bg    - Run Frontend in background (pidfile/log)";
	@echo "  dev.frontend-bg-stop - Stop background Frontend (pidfile/port-safe)";
	@echo "  test-apps1.up       - Start SUT1 (FastAPI+React+Playwright)";
	@echo "  test-apps1.down     - Stop SUT1 (keep volumes)";
	@echo "  test-apps1.clean    - Stop SUT1 (remove volumes)";
	@echo "  test-apps1.test.api - Run SUT1 backend API tests (Pytest in container)";
	@echo "  test-apps1.test.ui  - Run SUT1 UI E2E (Playwright in container)";
	@echo "  test-apps2.up       - Start SUT2 app (Cypress RWA: frontend+backend)";
	@echo "  test-apps2.down     - Stop SUT2 app (keep volumes)";
	@echo "  test-apps2.clean    - Stop SUT2 app (remove volumes)";
	@echo "  test-apps2.test.ci  - Run SUT2 CI pipeline (types/lint/unit/api/ui in Docker)";
	@echo "";
	@echo "Env hints:";
	@echo "  CP:   http://$(CP_HOST):$(CP_PORT)";
	@echo "  LG:   http://$(LG_HOST):$(LG_PORT)";
	@echo "  FE:   http://$(FE_HOST):$(FE_PORT)";
	@echo "  EP:   docker compose (port $(EP_API_PORT))";
	@echo "";
	@echo "Note: frontend uses /v1 proxy to CP by default (frontend/config/proxy.ts).";
	@echo "      CP uses LANGGRAPH_API_URL to talk to LangGraph (default in settings)."
	@echo "      Use: DEV_HEALTH=1 make dev.platform"
	@echo "      EP prod-like: make ep.prod.build && make ep.prod.up"
	@echo "      Training SUT docs: docs/test-apps.md"


# ==================== Training SUTs (test-apps1 / test-apps2) ====================

TEST_APPS1_PROJECT ?= test-apps1
TEST_APPS1_COMPOSE := docker compose -p $(TEST_APPS1_PROJECT) -f test-apps1/compose.yml -f test-apps1/compose.training.override.yml

TEST_APPS2_PROJECT ?= test-apps2
TEST_APPS2_APP_COMPOSE := docker compose -p $(TEST_APPS2_PROJECT) -f test-apps2/compose.app.yml
TEST_APPS2_CI_COMPOSE := docker compose -p $(TEST_APPS2_PROJECT) -f test-apps2/compose.training.yml

test-apps1.up:
	@docker info >/dev/null 2>&1 || (echo "Docker daemon not running. Start Docker Desktop." && exit 1)
	@echo "Starting test-apps1 (SUT1) ...";
	@$(TEST_APPS1_COMPOSE) up -d --build --wait db backend frontend mailcatcher
	@echo "OK: SUT1 frontend=http://127.0.0.1:15173 backend=http://127.0.0.1:18000 (docs: test-apps1/TRAINING.md)";

test-apps1.down:
	@docker info >/dev/null 2>&1 || (echo "Docker daemon not running. Start Docker Desktop." && exit 1)
	@echo "Stopping test-apps1 (SUT1) ...";
	@$(TEST_APPS1_COMPOSE) down

test-apps1.clean:
	@docker info >/dev/null 2>&1 || (echo "Docker daemon not running. Start Docker Desktop." && exit 1)
	@echo "Cleaning test-apps1 (SUT1) containers + volumes ...";
	@$(TEST_APPS1_COMPOSE) down -v

test-apps1.test.api:
	@docker info >/dev/null 2>&1 || (echo "Docker daemon not running. Start Docker Desktop." && exit 1)
	@echo "Running test-apps1 backend API tests (Pytest) ...";
	@$(TEST_APPS1_COMPOSE) run --rm backend-tests

test-apps1.test.ui:
	@docker info >/dev/null 2>&1 || (echo "Docker daemon not running. Start Docker Desktop." && exit 1)
	@echo "Running test-apps1 UI E2E tests (Playwright) ...";
	@$(TEST_APPS1_COMPOSE) run --rm playwright bunx playwright test

test-apps2.up:
	@docker info >/dev/null 2>&1 || (echo "Docker daemon not running. Start Docker Desktop." && exit 1)
	@echo "Starting test-apps2 (SUT2) app ...";
	@# 如果之前手动 docker run 过同名容器，compose 会报 name conflict；这里先清理掉。
	@docker rm -f $(TEST_APPS2_PROJECT)-app-1 >/dev/null 2>&1 || true
	@$(TEST_APPS2_APP_COMPOSE) up -d
	@echo "OK: SUT2 frontend=http://127.0.0.1:3000 api=http://127.0.0.1:3001 (docs: test-apps2/TRAINING.md)";

test-apps2.down:
	@docker info >/dev/null 2>&1 || (echo "Docker daemon not running. Start Docker Desktop." && exit 1)
	@echo "Stopping test-apps2 (SUT2) app ...";
	@$(TEST_APPS2_APP_COMPOSE) down

test-apps2.clean:
	@docker info >/dev/null 2>&1 || (echo "Docker daemon not running. Start Docker Desktop." && exit 1)
	@echo "Cleaning test-apps2 (SUT2) app containers + volumes ...";
	@$(TEST_APPS2_APP_COMPOSE) down -v

test-apps2.test.ci:
	@docker info >/dev/null 2>&1 || (echo "Docker daemon not running. Start Docker Desktop." && exit 1)
	@echo "Running test-apps2 CI pipeline (types/lint/unit/api/ui) ...";
	@$(TEST_APPS2_CI_COMPOSE) run --rm ci

test-apps.up: test-apps1.up test-apps2.up
	@echo "OK: test-apps1 + test-apps2 are started";

test-apps.down:
	@$(MAKE) test-apps1.down || true
	@$(MAKE) test-apps2.down || true
	@echo "OK: test-apps1 + test-apps2 are stopped";


# ==================== Health checks ====================

dev.check:
	@port_rc=0; api_rc=0; \
	$(PY) -c "import socket,sys; exec(\"checks=[(\\\"CP\\\",\\\"$(CP_HOST)\\\",$(CP_PORT)),(\\\"LG\\\",\\\"$(LG_HOST)\\\",$(LG_PORT)),(\\\"FE\\\",\\\"$(FE_HOST)\\\",$(FE_PORT)),(\\\"PG\\\",\\\"127.0.0.1\\\",5432),(\\\"REDIS\\\",\\\"127.0.0.1\\\",6379)]\\n\
 bad=0\\n\
 for name,host,port in checks:\\n\
   s=socket.socket(); s.settimeout(0.5); rc=s.connect_ex((host,port)); s.close(); ok=(rc==0)\\n\
   print(f\\\"{name}: {host}:{port} \\\" + (\\\"OK\\\" if ok else \\\"FAIL\\\"))\\n\
   bad += (0 if ok else 1)\\n\
 sys.exit(0 if bad==0 else 2)\\n\")" || port_rc=$$?; \
	if command -v curl >/dev/null 2>&1; then \
		curl -sf "http://$(CP_HOST):$(CP_PORT)/healthz" >/dev/null && echo "CP /healthz: OK" || api_rc=2; \
		if [ $$api_rc -eq 0 ]; then \
			curl -sf "http://$(CP_HOST):$(CP_PORT)/openapi.json" | \
				$(PY) -c "import json,sys; d=json.load(sys.stdin); paths=(d.get(\\\"paths\\\") or {}); want=\\\"/v1/auth/login\\\"; ok=(want in paths); print(\\\"CP openapi has \\\"+want+\\\": \\\"+(\\\"OK\\\" if ok else \\\"FAIL\\\")); (not ok and \\\"/agent\\\" in paths) and print(\\\"Hint: this looks like teach/agui demo server, not Control Plane (port conflict).\\\"); sys.exit(0 if ok else 3)" \
				|| api_rc=$$?; \
		fi; \
	else \
		echo "curl not found; skipping HTTP /healthz"; \
	fi; \
	rc=$$port_rc; if [ $$api_rc -ne 0 ]; then rc=$$api_rc; fi; exit $$rc

dev.check-loop:
	@while true; do \
		date; \
		$(MAKE) dev.check || true; \
		echo "---"; \
		sleep 2; \
	done


# ==================== Local infra (Docker) ====================

dev.db:
	@docker info >/dev/null 2>&1 || (echo "Docker daemon not running. Start Docker Desktop, or set DEV_DB=0 and use your own Postgres." && exit 1)
	@echo "Starting local infra (docker)...";
	@docker start langgraph-redis >/dev/null 2>&1 || \
	  docker run -d --name langgraph-redis --restart unless-stopped -p 6379:6379 redis:6
	@docker start langgraph-postgres >/dev/null 2>&1 || \
	  docker run -d --name langgraph-postgres --restart unless-stopped \
	    -p 5432:5432 \
	    -e POSTGRES_DB=postgres \
	    -e POSTGRES_USER=postgres \
	    -e POSTGRES_PASSWORD=postgres \
	    -v langgraph-postgres-data:/var/lib/postgresql/data \
	    postgres:16
	@echo "Waiting for Postgres to become ready...";
	@i=0; \
	until docker exec langgraph-postgres pg_isready -U postgres -d postgres >/dev/null 2>&1; do \
		i=$$((i+1)); \
		if [ $$i -ge 60 ]; then \
			echo "Postgres did not become ready in time (60s). Check: docker logs -f langgraph-postgres"; \
			exit 1; \
		fi; \
		sleep 1; \
	done
	@echo "Ensuring databases exist (langgraph_db, control_plane_db)...";
	@db_exists=$$(docker exec langgraph-postgres psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'langgraph_db'"); \
	if [ "$$db_exists" != "1" ]; then \
		docker exec langgraph-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE langgraph_db;" >/dev/null; \
	fi
	@db_exists=$$(docker exec langgraph-postgres psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'control_plane_db'"); \
	if [ "$$db_exists" != "1" ]; then \
		docker exec langgraph-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE control_plane_db;" >/dev/null; \
	fi
	@echo "OK: Postgres/Redis ready"

dev.db-stop:
	@docker stop langgraph-redis langgraph-postgres >/dev/null 2>&1 || true


# ==================== Python deps ====================

py.sync:
	@# Workspace default: sync ALL packages into the root .venv
	uv sync --all-packages

py.sync-active:
	@# Requires an activated venv; uv will sync deps into it.
	uv sync --all-packages --active


# ==================== Dev - individual components ====================

dev.exec:
	@echo "Starting LangGraph dev on $(LG_HOST):$(LG_PORT)...";
	uv run $(UV_ACTIVE_FLAG) --directory execution_plane \
	  langgraph dev --host $(LG_HOST) --port $(LG_PORT) --no-browser

dev.exec-stop:
	@echo "Stopping LangGraph dev on port $(LG_PORT)...";
	@if ! command -v lsof >/dev/null 2>&1; then \
		echo "lsof not found; cannot reliably stop by port."; \
		exit 1; \
	fi
	@pid=$$(lsof -nP -iTCP:$(LG_PORT) -sTCP:LISTEN -t 2>/dev/null | head -n 1); \
	if [ -z "$$pid" ]; then \
		echo "No process is listening on port $(LG_PORT)."; \
		exit 0; \
	fi; \
	cmd=$$(ps -p $$pid -o command= 2>/dev/null || true); \
	echo "Found pid=$$pid"; \
	echo "cmd=$$cmd"; \
	case "$$cmd" in \
		*"langgraph"*"dev"*) \
			echo "Sending SIGTERM to pid=$$pid"; \
			kill $$pid 2>/dev/null || true; \
			;; \
		*) \
			echo "Refusing to kill: process does not look like langgraph dev."; \
			echo "If you really want to kill whatever is on port $(LG_PORT), run: FORCE=1 make dev.exec-stop"; \
			if [ "$$FORCE" = "1" ]; then \
				echo "FORCE=1: Sending SIGTERM to pid=$$pid"; \
				kill $$pid 2>/dev/null || true; \
			fi; \
			;; \
	esac


# ==================== Execution Plane - production-like (Docker) ====================

EP_IMAGE_TAG ?= ep-langgraph-api:local
EP_API_PORT ?= 8123
EP_COMPOSE_FILE ?= execution_plane/docker-compose.prod.yml
EP_COMPOSE_PROJECT ?= ep

ep.prod.build:
	@docker info >/dev/null 2>&1 || (echo "Docker daemon not running. Start Docker Desktop." && exit 1)
	@echo "Building Execution Plane image: $(EP_IMAGE_TAG)";
	uv run $(UV_ACTIVE_FLAG) \
	  langgraph build -t $(EP_IMAGE_TAG) -c execution_plane/langgraph.json

ep.prod.up:
	@docker info >/dev/null 2>&1 || (echo "Docker daemon not running. Start Docker Desktop." && exit 1)
	@if [ ! -f "execution_plane/.env" ]; then \
		echo "Missing execution_plane/.env. Create it from execution_plane/.env.example (do NOT commit secrets)."; \
		exit 1; \
	fi
	@if ! grep -Eq "^(LANGSMITH_API_KEY|LANGGRAPH_CLOUD_LICENSE_KEY)=" execution_plane/.env; then \
		echo "Missing LANGSMITH_API_KEY or LANGGRAPH_CLOUD_LICENSE_KEY in execution_plane/.env."; \
		echo "- For local production-like debug: set LANGSMITH_API_KEY (account must have LangGraph Cloud access)."; \
		echo "- For production: set LANGGRAPH_CLOUD_LICENSE_KEY."; \
		exit 1; \
	fi
	@echo "Starting Execution Plane (docker compose) on port $(EP_API_PORT)...";
	EP_IMAGE_TAG=$(EP_IMAGE_TAG) EP_API_PORT=$(EP_API_PORT) \
	  docker compose -p $(EP_COMPOSE_PROJECT) -f $(EP_COMPOSE_FILE) up -d --pull never
	@echo "OK: EP should be reachable at http://127.0.0.1:$(EP_API_PORT)";

ep.prod.down:
	@docker info >/dev/null 2>&1 || (echo "Docker daemon not running. Start Docker Desktop." && exit 1)
	@echo "Stopping Execution Plane (docker compose)...";
	docker compose -p $(EP_COMPOSE_PROJECT) -f $(EP_COMPOSE_FILE) down

ep.prod.logs:
	@docker info >/dev/null 2>&1 || (echo "Docker daemon not running. Start Docker Desktop." && exit 1)
	@echo "Tailing Execution Plane logs...";
	docker compose -p $(EP_COMPOSE_PROJECT) -f $(EP_COMPOSE_FILE) logs -f --tail=200

ep.prod.health:
	@if command -v curl >/dev/null 2>&1; then \
		curl -sf "http://127.0.0.1:$(EP_API_PORT)/ok?check_db=1" && echo "\nEP /ok: OK"; \
	else \
		echo "curl not found; open: http://127.0.0.1:$(EP_API_PORT)/ok"; \
	fi

dev.cp:
	@echo "Starting Control Plane on $(CP_HOST):$(CP_PORT)...";
	@if command -v lsof >/dev/null 2>&1; then \
		pid=$$(lsof -nP -iTCP:$(CP_PORT) -sTCP:LISTEN -t 2>/dev/null | head -n 1); \
		if [ -n "$$pid" ]; then \
			echo "Port $(CP_PORT) is already in use (pid=$$pid)."; \
			ps -p $$pid -o command= || true; \
			echo "Stop the process (recommended: make dev.cp-stop) or run with CP_PORT=<free_port>."; \
			exit 1; \
		fi; \
	fi
	@$(MAKE) cp.migrate
	LANGGRAPH_API_URL=http://$(LG_HOST):$(LG_PORT) \
	CONTROL_PLANE_DATABASE_URI=$(CP_DB_URI) \
	CORS_ALLOW_ORIGINS=$(CORS_ALLOW_ORIGINS) \
	uv run $(UV_ACTIVE_FLAG) --package control-plane --directory control_plane \
	  uvicorn gateway.main:app --reload --host $(CP_HOST) --port $(CP_PORT)

dev.cp-stop:
	@echo "Stopping Control Plane on port $(CP_PORT)...";
	@if ! command -v lsof >/dev/null 2>&1; then \
		echo "lsof not found; cannot reliably stop by port."; \
		exit 1; \
	fi
	@pid=$$(lsof -nP -iTCP:$(CP_PORT) -sTCP:LISTEN -t 2>/dev/null | head -n 1); \
	if [ -z "$$pid" ]; then \
		echo "No process is listening on port $(CP_PORT)."; \
		exit 0; \
	fi; \
	cmd=$$(ps -p $$pid -o command= 2>/dev/null || true); \
	echo "Found pid=$$pid"; \
	echo "cmd=$$cmd"; \
	case "$$cmd" in \
		*"uvicorn"*"gateway.main:app"*) \
			echo "Sending SIGTERM to pid=$$pid"; \
			kill $$pid 2>/dev/null || true; \
			ppid=$$(ps -p $$pid -o ppid= 2>/dev/null | tr -d ' '); \
			if [ -n "$$ppid" ] && [ "$$ppid" != "1" ]; then \
				pcmd=$$(ps -p $$ppid -o command= 2>/dev/null || true); \
				case "$$pcmd" in \
					*"uvicorn"*"gateway.main:app"*"--reload"*) \
						echo "Also stopping reloader pid=$$ppid"; \
						kill $$ppid 2>/dev/null || true; \
						;; \
					esac; \
			fi; \
			;; \
		*) \
			echo "Refusing to kill: process does not look like Control Plane (uvicorn gateway.main:app)."; \
			echo "If you really want to kill whatever is on port $(CP_PORT), run: FORCE=1 make dev.cp-stop"; \
			if [ "$$FORCE" = "1" ]; then \
				echo "FORCE=1: Sending SIGTERM to pid=$$pid"; \
				kill $$pid 2>/dev/null || true; \
			fi; \
			;; \
	esac
	@# Wait briefly for the port to be released (uvicorn reload can take a moment)
	@for i in 1 2 3 4 5 6 7 8 9 10; do \
		if ! lsof -nP -iTCP:$(CP_PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
			echo "OK: port $(CP_PORT) is free"; \
			exit 0; \
		fi; \
		sleep 0.2; \
	done; \
	echo "WARN: port $(CP_PORT) is still in use"; \
	exit 0

cp.migrate:
	@echo "Running Control Plane migrations (alembic upgrade head)...";
	@$(PY) -c "import socket,sys; s=socket.socket(); s.settimeout(0.5); rc=s.connect_ex(('127.0.0.1',5432)); s.close(); sys.exit(0 if rc==0 else 1)" \
	  || (echo "Postgres not reachable at 127.0.0.1:5432. Run: make dev.db (Docker) or set CP_DB_URI to your Postgres." && exit 1)
	CONTROL_PLANE_DATABASE_URI=$(CP_DB_URI) \
	PYTHONPATH=. \
	uv run $(UV_ACTIVE_FLAG) --package control-plane --directory control_plane \
	  python -m alembic -c alembic.ini upgrade head

dev.frontend:
	@echo "Starting Frontend (Ant Design Pro)...";
	@if [ ! -x "frontend/node_modules/.bin/cross-env" ]; then \
		echo "Missing frontend deps (cross-env not found). Run: make fe.install"; \
		exit 1; \
	fi
	@echo "FE: http://$(FE_HOST):$(FE_PORT) (connect: http://$(FE_HOST):$(FE_PORT)/connect)";
	@echo "NOTE: this target runs a long-lived dev server; stop with: make dev.frontend-stop";
	PORT=$(FE_PORT) npm --prefix frontend run dev


# ==================== Dev - debug UI (agent-chat-ui) ====================

DEBUG_UI_HOST ?= 127.0.0.1
DEBUG_UI_PORT ?= 3000

# AG-UI demo UI (Next.js)
AGUI_UI_HOST ?= 127.0.0.1
AGUI_UI_PORT ?= 3002

debug-ui.install:
	@echo "Installing agent-chat-ui dependencies (pnpm install)...";
	@if ! command -v pnpm >/dev/null 2>&1; then \
		echo "pnpm not found. Install pnpm (or enable corepack) then rerun: make debug-ui.install"; \
		exit 1; \
	fi
	pnpm -C examples/agent-chat-ui install

dev.debug-ui:
	@echo "Starting agent-chat-ui on $(DEBUG_UI_HOST):$(DEBUG_UI_PORT)...";
	@if [ ! -d "examples/agent-chat-ui/node_modules" ]; then \
		echo "Missing agent-chat-ui deps. Run: make debug-ui.install"; \
		exit 1; \
	fi
	LANGGRAPH_API_URL=http://$(LG_HOST):$(LG_PORT) \
	NEXT_PUBLIC_API_URL=http://$(DEBUG_UI_HOST):$(DEBUG_UI_PORT)/api \
	NEXT_PUBLIC_ASSISTANT_ID=sql_agent \
	pnpm -C examples/agent-chat-ui dev --port $(DEBUG_UI_PORT) --hostname $(DEBUG_UI_HOST)

dev.debug-ui-manual:
	@echo "Starting agent-chat-ui (manual setup form) on $(DEBUG_UI_HOST):$(DEBUG_UI_PORT)...";
	@if [ ! -d "examples/agent-chat-ui/node_modules" ]; then \
		echo "Missing agent-chat-ui deps. Run: make debug-ui.install"; \
		exit 1; \
	fi
	@echo "NOTE: You will be prompted to enter Deployment URL + Assistant/Graph ID in the UI.";
	pnpm -C examples/agent-chat-ui dev --port $(DEBUG_UI_PORT) --hostname $(DEBUG_UI_HOST)

agui-ui.install:
	@echo "Installing AG-UI demo UI dependencies (pnpm install)...";
	@if ! command -v pnpm >/dev/null 2>&1; then \
		echo "pnpm not found. Install pnpm (or enable corepack) then rerun: make agui-ui.install"; \
		exit 1; \
	fi
	pnpm -C examples/agui-chat-ui install

dev.agui-ui:
	@echo "Starting AG-UI demo UI on $(AGUI_UI_HOST):$(AGUI_UI_PORT)...";
	@if [ ! -d "examples/agui-chat-ui/node_modules" ]; then \
		echo "Missing AG-UI demo UI deps. Run: make agui-ui.install"; \
		exit 1; \
	fi
	@# NOTE: Avoid forwarding a literal `--` to Next.js (it treats args after `--` as positional).
	pnpm -C examples/agui-chat-ui dev --port $(AGUI_UI_PORT) --hostname $(AGUI_UI_HOST)

dev.agui-ui-stop:
	@echo "Stopping AG-UI demo UI on port $(AGUI_UI_PORT)...";
	@if ! command -v lsof >/dev/null 2>&1; then \
		echo "lsof not found; cannot reliably stop by port."; \
		exit 1; \
	fi
	@pid=$$(lsof -nP -iTCP:$(AGUI_UI_PORT) -sTCP:LISTEN -t 2>/dev/null | head -n 1); \
	if [ -z "$$pid" ]; then \
		echo "No process is listening on port $(AGUI_UI_PORT)."; \
		exit 0; \
	fi; \
	cmd=$$(ps -p $$pid -o command= 2>/dev/null || true); \
	echo "Found pid=$$pid"; \
	echo "cmd=$$cmd"; \
	case "$$cmd" in \
		*"next"*"dev"*"$(AGUI_UI_PORT)"*|*"node"*"next"*"dev"*"$(AGUI_UI_PORT)"*) \
			echo "Sending SIGTERM to pid=$$pid"; \
			kill $$pid 2>/dev/null || true; \
			;; \
		*) \
			echo "Refusing to kill: process does not look like the demo UI (next dev on port $(AGUI_UI_PORT))."; \
			echo "If you really want to kill whatever is on port $(AGUI_UI_PORT), run: FORCE=1 make dev.agui-ui-stop"; \
			if [ "$$FORCE" = "1" ]; then \
				echo "FORCE=1: Sending SIGTERM to pid=$$pid"; \
				kill $$pid 2>/dev/null || true; \
			fi; \
			;; \
	esac

fe.install:
	@echo "Installing frontend dependencies (npm install)...";
	HUSKY=0 npm --prefix frontend install

fe.tsc:
	@echo "Typechecking frontend (tsc --noEmit)...";
	npm --prefix frontend run tsc

cp.smoke:
	@echo "Running Control Plane platform smoke test...";
	@$(MAKE) cp.migrate
	CONTROL_PLANE_DATABASE_URI=$(CP_DB_URI) \
	BOOTSTRAP_TENANT_NAME=default \
	BOOTSTRAP_ADMIN_USERNAME=test \
	BOOTSTRAP_ADMIN_PASSWORD=test \
	PYTHONPATH=. \
	uv run $(UV_ACTIVE_FLAG) --package control-plane --directory control_plane \
	  $(PY) -c "from fastapi.testclient import TestClient; from gateway.main import create_app; import time; app=create_app(); c=TestClient(app); r=c.post('/v1/auth/login', json={'username':'test','password':'test'}); assert r.status_code==200, r.text; token=r.json()['access_token']; h={'Authorization':'Bearer '+token,'X-Request-Id':'req_make_smoke'}; r=c.post('/v1/projects', json={'name':'Smoke Project','description':'smoke'}, headers=h); assert r.status_code==201, r.text; proj=r.json()['project_id']; r=c.post('/v1/projects/%s/environments'%proj, json={'name':'Smoke Env','type':'generic','config_json': {}}, headers=h); assert r.status_code==201, r.text; env_id=r.json()['environment_id']; r=c.post('/v1/projects/%s/runs'%proj, json={'client_run_id':'crun_smoke_make','environment_id': env_id,'runner':'dummy','params': {}}, headers=h); assert r.status_code in (200,201), r.text; run_id=r.json()['run_id']; \
  [ (lambda rr: (rr.status_code==200) or (_ for _ in ()).throw(AssertionError(rr.text)) )(c.get('/v1/runs/%s'%run_id, headers=h)) or (c.get('/v1/runs/%s'%run_id, headers=h).json().get('status') in ('succeeded','failed','canceled')) or time.sleep(0.5) for _ in range(30) ]; r=c.get('/v1/runs/%s/events'%run_id, headers=h); assert r.status_code==200, r.text; body=r.json(); assert 'events' in body and 'nextCursor' in body and 'hasMore' in body; print('CP_SMOKE_OK')"


# ==================== Dev - one-shot platform ====================

dev.platform:
	@if [ "$(DEV_DB)" = "1" ]; then \
		$(MAKE) dev.db; \
	else \
		echo "DEV_DB=0: skipping local infra startup"; \
	fi
	@if command -v tmux >/dev/null 2>&1; then \
		echo "Starting tmux session: $(TMUX_SESSION)"; \
		tmux has-session -t $(TMUX_SESSION) 2>/dev/null && tmux kill-session -t $(TMUX_SESSION) || true; \
		tmux new-session -d -s $(TMUX_SESSION); \
		tmux send-keys -t $(TMUX_SESSION):0.0 "make dev.exec" Enter; \
		tmux split-window -h -t $(TMUX_SESSION):0; \
		tmux send-keys -t $(TMUX_SESSION):0.1 "make dev.cp" Enter; \
		tmux split-window -v -t $(TMUX_SESSION):0.1; \
		tmux send-keys -t $(TMUX_SESSION):0.2 "make dev.frontend" Enter; \
		if [ "$(DEV_HEALTH)" = "1" ]; then \
			tmux split-window -v -t $(TMUX_SESSION):0.0; \
			tmux send-keys -t $(TMUX_SESSION):0.3 "make dev.check-loop" Enter; \
		fi; \
		tmux select-layout -t $(TMUX_SESSION) tiled; \
		tmux attach -t $(TMUX_SESSION); \
	else \
		echo "tmux not found; falling back to background mode"; \
		$(MAKE) dev.platform-bg; \
		if [ "$(DEV_HEALTH)" = "1" ]; then \
			$(MAKE) dev.check || true; \
		fi; \
		echo "Stop with: make dev.platform-bg-stop"; \
	fi

dev.platform-stop:
	@tmux kill-session -t $(TMUX_SESSION) 2>/dev/null || true


# Background mode: store logs under .run/ (no pidfiles)
dev.platform-bg:
	@mkdir -p $(RUN_DIR)
	@echo "Starting exec/cp/frontend in background (logs: $(RUN_DIR)/*.log)";
	@nohup make dev.exec > $(RUN_DIR)/exec.log 2>&1 &
	@nohup env BOOTSTRAP_EXTRA_AGENTS=$(BOOTSTRAP_EXTRA_AGENTS) make dev.cp > $(RUN_DIR)/cp.log 2>&1 &
	@nohup make dev.frontend > $(RUN_DIR)/frontend.log 2>&1 &
	@echo "OK: started (stop with: make dev.platform-bg-stop)"


# ==================== Background single-process helpers ====================

dev.exec-bg:
	@mkdir -p $(RUN_DIR)
	@echo "Starting exec in background (log: $(RUN_DIR)/exec.log)";
	@nohup make dev.exec > $(RUN_DIR)/exec.log 2>&1 &

dev.exec-bg-stop:
	@$(MAKE) dev.exec-stop FORCE=1

dev.cp-bg:
	@mkdir -p $(RUN_DIR)
	@echo "Starting cp in background (log: $(RUN_DIR)/cp.log, BOOTSTRAP_EXTRA_AGENTS=$(BOOTSTRAP_EXTRA_AGENTS))";
	@nohup env BOOTSTRAP_EXTRA_AGENTS=$(BOOTSTRAP_EXTRA_AGENTS) make dev.cp > $(RUN_DIR)/cp.log 2>&1 &

dev.cp-bg-stop:
	@$(MAKE) dev.cp-stop FORCE=1

dev.frontend-bg:
	@mkdir -p $(RUN_DIR)
	@echo "Starting frontend in background (log: $(RUN_DIR)/frontend.log)";
	@nohup make dev.frontend > $(RUN_DIR)/frontend.log 2>&1 &

dev.frontend-bg-stop:
	@$(MAKE) dev.frontend-stop FORCE=1 || true


dev.frontend-stop:
	@echo "Stopping Frontend on port $(FE_PORT)...";
	@if ! command -v lsof >/dev/null 2>&1; then \
		echo "lsof not found; cannot reliably stop by port."; \
		exit 1; \
	fi
	@pid=$$(lsof -nP -iTCP:$(FE_PORT) -sTCP:LISTEN -t 2>/dev/null | head -n 1); \
	if [ -z "$$pid" ]; then \
		echo "No process is listening on port $(FE_PORT)."; \
		exit 0; \
	fi; \
	cmd=$$(ps -p $$pid -o command= 2>/dev/null || true); \
	echo "Found pid=$$pid"; \
	echo "cmd=$$cmd"; \
	case "$$cmd" in \
		*"node"*|*"npm"*|*"pnpm"*|*"yarn"*) \
			echo "Sending SIGTERM to pid=$$pid"; \
			kill $$pid 2>/dev/null || true; \
			;; \
		*) \
			echo "Refusing to kill: process does not look like a frontend dev server."; \
			echo "If you really want to kill whatever is on port $(FE_PORT), run: FORCE=1 make dev.frontend-stop"; \
			if [ "$$FORCE" = "1" ]; then \
				echo "FORCE=1: Sending SIGTERM to pid=$$pid"; \
				kill $$pid 2>/dev/null || true; \
			fi; \
			;; \
	esac


# ==================== Full checkup ====================

dev.checkup:
	@echo "Running full-checkup smoke (requires CP+EP up) ...";
	@$(MAKE) cp.smoke || true
	@$(MAKE) dev.cp-stop FORCE=1 >/dev/null 2>&1 || true
	@$(MAKE) dev.cp-bg
	@sleep 3
	@uv run --project control_plane python control_plane/scripts/e2e_smoke.py --agent-id sql_agent
	@uv run --project control_plane python control_plane/scripts/e2e_smoke.py --agent-id deep_agent
	@uv run --project control_plane python control_plane/scripts/e2e_smoke.py --agent-id learn_semantic_search

dev.platform-bg-stop:
	@$(MAKE) dev.exec-stop FORCE=1 || true
	@$(MAKE) dev.cp-stop FORCE=1 || true
	@$(MAKE) dev.frontend-stop FORCE=1 || true
