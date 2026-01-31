# Control Plane (FastAPI Gateway)

This service is the platform's Control Plane.

Responsibilities:
- AuthN/AuthZ (Phase-1: simplified login + Bearer token)
- Tenant isolation (IDOR prevention)
- Agent registry (agent_id -> execution target mapping)
- Platform semantics: THREAD_BUSY (409), cancel, snapshot (structured JSON)
- Audit trail (append-only)

Non-responsibilities:
- Running graphs or storing thread state (Execution Plane owns that)

Tech:
- Python 3.13
- Dependency/env management: uv
- Package name: `gateway`

Local run (example):

```bash
uv run uvicorn gateway.main:app --reload --port 8000
```
