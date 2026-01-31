from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any

import httpx


def _die(msg: str) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(1)


def _sse_iter_lines(resp: httpx.Response):
    for line in resp.iter_lines():
        if not line:
            continue
        yield line


def _parse_sse_data_line(line: str) -> dict[str, Any] | None:
    if not line.startswith("data: "):
        return None
    payload = line[len("data: ") :]
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Control Plane e2e smoke: login->me->agents->thread->run->snapshot->cancel")
    parser.add_argument("--base-url", default=os.getenv("CONTROL_PLANE_URL", "http://localhost:8000"))
    parser.add_argument("--username", default=os.getenv("CP_USERNAME", "test"))
    parser.add_argument("--password", default=os.getenv("CP_PASSWORD", "test"))
    parser.add_argument("--agent-id", default=os.getenv("CP_AGENT_ID", ""))
    parser.add_argument("--execution-target-id", default=os.getenv("CP_EXECUTION_TARGET_ID", "local-dev"))
    parser.add_argument("--dry-run", action="store_true", help="Only validate args; do not call network")
    args = parser.parse_args(argv)

    if args.dry_run:
        print("dry-run ok")
        return 0

    base_url = args.base_url.rstrip("/")

    with httpx.Client(base_url=base_url, timeout=30.0) as client:
        # 1) login
        r = client.post("/v1/auth/login", json={"username": args.username, "password": args.password})
        if r.status_code != 200:
            _die(f"login failed: {r.status_code} {r.text}")
        token = r.json().get("access_token")
        if not isinstance(token, str) or not token:
            _die("login returned no access_token")

        headers = {"Authorization": f"Bearer {token}", "X-Request-Id": f"req-e2e-{int(time.time())}"}

        # 2) me
        r = client.get("/v1/me", headers=headers)
        if r.status_code != 200:
            _die(f"me failed: {r.status_code} {r.text}")

        # 3) agents
        r = client.get("/v1/agents", headers=headers)
        if r.status_code != 200:
            _die(f"agents failed: {r.status_code} {r.text}")
        agents = r.json()
        if not isinstance(agents, list) or not agents:
            _die("agents list empty")

        agent_id = args.agent_id or agents[0].get("agentId")
        if not isinstance(agent_id, str) or not agent_id:
            _die("could not determine agentId")

        # 4) create thread
        r = client.post(
            "/v1/threads",
            headers=headers,
            json={"agentId": agent_id, "executionTargetId": args.execution_target_id},
        )
        if r.status_code != 200:
            _die(f"create thread failed: {r.status_code} {r.text}")
        thread_id = r.json().get("threadId")
        if not isinstance(thread_id, str) or not thread_id:
            _die("create thread returned no threadId")

        # 5) run (SSE)
        run_id = f"run_e2e_{int(time.time())}"
        run_body = {
            "thread_id": thread_id,
            "run_id": run_id,
            "messages": [{"id": "m-user-1", "role": "user", "content": "Hello"}],
            "state": {"ui": {}, "app": {}, "debug": {}},
            "context": [],
            "forwarded_props": {},
        }

        with client.stream("POST", f"/v1/agents/{agent_id}:run", headers=headers, json=run_body) as resp:
            if resp.status_code != 200:
                _die(f"run failed: {resp.status_code} {resp.text}")

            # Read a few events (don’t hang forever in smoke).
            start = time.time()
            got_started = False
            for line in _sse_iter_lines(resp):
                evt = _parse_sse_data_line(line)
                if not evt:
                    continue
                if evt.get("type") == "RUN_STARTED":
                    got_started = True
                if time.time() - start > 3.0:
                    break
            if not got_started:
                _die("did not receive RUN_STARTED within timeout")

        # 6) snapshot
        r = client.get(f"/v1/threads/{thread_id}/snapshot", headers=headers)
        if r.status_code != 200:
            _die(f"snapshot failed: {r.status_code} {r.text}")

        # 7) cancel
        r = client.post(f"/v1/threads/{thread_id}/runs/{run_id}:cancel", headers=headers)
        if r.status_code != 200:
            _die(f"cancel failed: {r.status_code} {r.text}")

    print("e2e smoke ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
