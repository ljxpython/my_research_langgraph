from __future__ import annotations

import uuid
from typing import Any

from langchain_core.callbacks.base import BaseCallbackHandler


class CustomEventCallbackHandler(BaseCallbackHandler):
    """Emit LangChain 'custom events' so LangGraph stream_mode=events can forward them.

    Control Plane maps these to AG-UI CUSTOM in control_plane/gateway/routers/runs.py.
    This handler deliberately emits only well-known event names.
    """

    def __init__(self, *, enabled: bool = True):
        self.enabled = enabled

    # -------------------- plan --------------------
    def on_tool_end(self, output: Any, *, run_id: uuid.UUID, parent_run_id: uuid.UUID | None = None, **kwargs: Any) -> Any:
        if not self.enabled:
            return None

        # DeepAgents todo tool is expected to be named write_todos.
        tool_name = kwargs.get("name") or kwargs.get("tool")
        if tool_name != "write_todos":
            return None

        # Best-effort: the tool output should be JSON-serializable.
        try:
            # Emit a custom callback event that LangGraph will include in the events stream.
            # CP will translate event='plan' into AG-UI CUSTOM name=plan.
            self.on_custom_event(
                name="plan",
                data=output,
                run_id=run_id,
                parent_run_id=parent_run_id,
            )
        except Exception:
            # Never break agent execution due to observability.
            return None
        return None
