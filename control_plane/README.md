# Control Plane (FastAPI Gateway)

## 仓库状态说明

- `control_plane/` 这部分平台网关、鉴权、租户隔离与审计语义能力，已经整合进 [ai-agent-test-platform](https://github.com/ljxpython/ai-agent-test-platform)。
- 当前目录下这份实现主要保留为历史参考，不再作为主线模块持续维护。
- 如果要继续做企业级平台接入、对外 API 收口或治理能力扩展，请直接以 `ai-agent-test-platform` 中的实现为准。

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
