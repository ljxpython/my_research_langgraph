# AG-UI Chat UI (Demo)

This is a **generic demo chat UI** for testing any agent registered in the Control Plane.

It intentionally speaks **AG-UI v1** to the Control Plane (not the LangGraph Agent Server API).

Goals:
- agent-chat-ui-like UX (thread sidebar, typing placeholder, stop/cancel, tool visualization)
- Works for any agent: SQL agent, test-case agent, code-gen agent...

Non-goals:
- This is not the product frontend.
- No direct access to Execution Plane.

## Dev

1) Start Execution Plane (LangGraph dev)

```bash
make dev.exec
```

2) Start Control Plane (FastAPI)

```bash
# IMPORTANT: This demo runs cross-origin (default port 3002), so CORS must allow it.
make CORS_ALLOW_ORIGINS=http://127.0.0.1:3002 dev.cp
```

3) Start this UI

```bash
pnpm -C examples/agui-chat-ui install
pnpm -C examples/agui-chat-ui dev --port 3002
```

Open: http://127.0.0.1:3002

## Third-party notices

The UX/layout is inspired by `agent-chat-ui` (MIT License).
