from __future__ import annotations

import asyncio
import os
from functools import lru_cache
from typing import Any

from langchain_mcp_adapters.client import MultiServerMCPClient


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@lru_cache(maxsize=1)
def get_mcp_chart_tools() -> list[Any]:
    """Load tools from @antv/mcp-server-chart.

    This mirrors `examples/docker_single/app/tools.py:get_mcp_server_chart_tools`, but:
    - doesn't hardcode secrets
    - can be disabled by env

    Env:
    - EP_ENABLE_MCP_CHART=1 to enable (default: off)
    """

    if not _env_bool("EP_ENABLE_MCP_CHART", default=False):
        return []

    client = MultiServerMCPClient(
        {
            "mcp_chart_server": {
                "command": "npx",
                "args": ["-y", "@antv/mcp-server-chart"],
                "transport": "stdio",
            }
        }
    )

    # MultiServerMCPClient is async; we keep a sync entry point because graphs are
    # constructed at import-time under LangGraph Agent Server.
    return asyncio.run(client.get_tools())


def format_mcp_event(
    *,
    server_id: str,
    tool_name: str,
    tool_call_id: str | None,
    phase: str,
    content: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a CUSTOM mcp event payload.

    We keep this helper here so tools/middleware can emit a stable shape.
    The Control Plane will forward it as AG-UI CUSTOM name=mcp.
    """

    value: dict[str, Any] = {
        "serverId": server_id,
        "toolName": tool_name,
        "toolCallId": tool_call_id,
        "phase": phase,
    }
    if content is not None:
        value["content"] = content
    return {"type": "CUSTOM", "name": "mcp", "value": value}
