"""Minimal AG-UI input schema.

We validate only what's needed for Phase-1. The public contract lives in docs/shared.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class Message(BaseModel):
    id: str
    role: str
    content: str


class RunAgentInput(BaseModel):
    messages: list[Message]
    thread_id: str
    run_id: Optional[str] = None
    state: dict[str, Any] = Field(default_factory=dict)
    context: list[dict[str, Any]] = Field(default_factory=list)
    forwarded_props: dict[str, Any] = Field(default_factory=dict)
