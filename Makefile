.PHONY: help \
  py.sync py.sync-active \
  dev.db dev.db-stop \
  cp.migrate \
  fe.install \
  dev.check dev.check-loop \
  dev.exec dev.cp dev.frontend \
  dev.platform dev.platform-stop dev.platform-bg dev.platform-bg-stop

# ==================== Config ====================

TMUX_SESSION ?= platform-dev

# Start local infra by default (Docker: Postgres + Redis)
DEV_DB ?= 1

# DEV_HEALTH=1: add a health-check pane in tmux, or run checks once in bg mode.
DEV_HEALTH ?= 0

CP_HOST ?= 127.0.0.1
CP_PORT ?= 8000

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

# ==================== Helpers ====================

ifeq ($(UV_ACTIVE),1)
UV_ACTIVE_FLAG := --active
else
UV_ACTIVE_FLAG :=
endif

help:
	@echo "Targets:";
	@echo "  py.sync            - Sync Python deps (root + control_plane)";
	@echo "  py.sync-active     - Sync Python deps into ACTIVE venv (UV_ACTIVE=1)";
	@echo "  dev.exec           - Run LangGraph dev (examples/docker_single)";
	@echo "  dev.db             - Start local infra (docker: postgres+redis, create DBs)";
	@echo "  dev.db-stop        - Stop docker infra containers";
	@echo "  dev.cp             - Run Control Plane (FastAPI)";
	@echo "  cp.migrate         - Run Alembic migrations for Control Plane";
	@echo "  fe.install         - Install frontend dependencies (npm install)";
	@echo "  dev.frontend       - Run Frontend (AntD Pro)";
	@echo "  dev.platform       - Start exec+cp+frontend (tmux if available)";
	@echo "  dev.check          - Health check (ports + CP /healthz)";
	@echo "  dev.check-loop     - Health check loop (watch)";
	@echo "  dev.platform-stop  - Stop tmux session (if used)";
	@echo "  dev.platform-bg    - Start exec+cp+frontend in background (pidfiles)";
	@echo "  dev.platform-bg-stop - Stop background dev (pidfiles)";
	@echo "";
	@echo "Env hints:";
	@echo "  CP:   http://$(CP_HOST):$(CP_PORT)";
	@echo "  LG:   http://$(LG_HOST):$(LG_PORT)";
	@echo "  FE:   http://$(FE_HOST):$(FE_PORT)";
	@echo "";
	@echo "Note: frontend uses /v1 proxy to CP by default (frontend/config/proxy.ts).";
	@echo "      CP uses LANGGRAPH_API_URL to talk to LangGraph (default in settings)."
	@echo "      Use: DEV_HEALTH=1 make dev.platform"


# ==================== Health checks ====================

dev.check:
	@port_rc=0; api_rc=0; \
	python -c "import socket,sys; exec(\"checks=[(\\\"CP\\\",\\\"$(CP_HOST)\\\",$(CP_PORT)),(\\\"LG\\\",\\\"$(LG_HOST)\\\",$(LG_PORT)),(\\\"FE\\\",\\\"$(FE_HOST)\\\",$(FE_PORT)),(\\\"PG\\\",\\\"127.0.0.1\\\",5432),(\\\"REDIS\\\",\\\"127.0.0.1\\\",6379)]\\n\
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
				python -c "import json,sys; d=json.load(sys.stdin); paths=(d.get(\\\"paths\\\") or {}); want=\\\"/v1/auth/login\\\"; ok=(want in paths); print(\\\"CP openapi has \\\"+want+\\\": \\\"+(\\\"OK\\\" if ok else \\\"FAIL\\\")); (not ok and \\\"/agent\\\" in paths) and print(\\\"Hint: this looks like teach/agui demo server, not Control Plane (port conflict).\\\"); sys.exit(0 if ok else 3)" \
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
	uv run $(UV_ACTIVE_FLAG) --directory examples/docker_single \
	  langgraph dev --host $(LG_HOST) --port $(LG_PORT) --no-browser

dev.cp:
	@echo "Starting Control Plane on $(CP_HOST):$(CP_PORT)...";
	@if command -v lsof >/dev/null 2>&1; then \
		pid=$$(lsof -nP -iTCP:$(CP_PORT) -sTCP:LISTEN -t 2>/dev/null | head -n 1); \
		if [ -n "$$pid" ]; then \
			echo "Port $(CP_PORT) is already in use (pid=$$pid)."; \
			ps -p $$pid -o command= || true; \
			echo "Stop the process or run with CP_PORT=<free_port>."; \
			exit 1; \
		fi; \
	fi
	@$(MAKE) cp.migrate
	LANGGRAPH_API_URL=http://$(LG_HOST):$(LG_PORT) \
	CONTROL_PLANE_DATABASE_URI=$(CP_DB_URI) \
	uv run $(UV_ACTIVE_FLAG) --package control-plane --directory control_plane \
	  uvicorn gateway.main:app --reload --host $(CP_HOST) --port $(CP_PORT)

cp.migrate:
	@echo "Running Control Plane migrations (alembic upgrade head)...";
	@python -c "import socket,sys; s=socket.socket(); s.settimeout(0.5); rc=s.connect_ex(('127.0.0.1',5432)); s.close(); sys.exit(0 if rc==0 else 1)" \
	  || (echo "Postgres not reachable at 127.0.0.1:5432. Run: make dev.db (Docker) or set CP_DB_URI to your Postgres." && exit 1)
	CONTROL_PLANE_DATABASE_URI=$(CP_DB_URI) \
	uv run $(UV_ACTIVE_FLAG) --package control-plane --directory control_plane \
	  python -m alembic -c alembic.ini upgrade head

dev.frontend:
	@echo "Starting Frontend (Ant Design Pro)...";
	@if [ ! -x "frontend/node_modules/.bin/cross-env" ]; then \
		echo "Missing frontend deps (cross-env not found). Run: make fe.install"; \
		exit 1; \
	fi
	npm --prefix frontend run dev

fe.install:
	@echo "Installing frontend dependencies (npm install)...";
	HUSKY=0 npm --prefix frontend install


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


# Background mode: store pid/log under .run/
dev.platform-bg:
	@mkdir -p $(RUN_DIR)
	@echo "Starting exec/cp/frontend in background (logs: $(RUN_DIR)/*.log)";
	@nohup make dev.exec > $(RUN_DIR)/exec.log 2>&1 & echo $$! > $(RUN_DIR)/exec.pid
	@nohup make dev.cp > $(RUN_DIR)/cp.log 2>&1 & echo $$! > $(RUN_DIR)/cp.pid
	@nohup make dev.frontend > $(RUN_DIR)/frontend.log 2>&1 & echo $$! > $(RUN_DIR)/frontend.pid
	@echo "PIDs: exec=$$(cat $(RUN_DIR)/exec.pid) cp=$$(cat $(RUN_DIR)/cp.pid) frontend=$$(cat $(RUN_DIR)/frontend.pid)"

dev.platform-bg-stop:
	@set -e; \
	for name in exec cp frontend; do \
		pidfile="$(RUN_DIR)/$$name.pid"; \
		if [ -f "$$pidfile" ]; then \
			pid=$$(cat "$$pidfile"); \
			if kill -0 "$$pid" 2>/dev/null; then \
				echo "killing $$name ($$pid)"; \
				kill "$$pid" 2>/dev/null || true; \
			fi; \
			rm -f "$$pidfile"; \
		fi; \
	done
