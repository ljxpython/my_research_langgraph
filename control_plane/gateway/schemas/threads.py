from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel


class CreateThreadRequest(BaseModel):
    agentId: str
    executionTargetId: str = "local-dev"


class CreateThreadResponse(BaseModel):
    threadId: str


class SnapshotResponse(BaseModel):
    threadId: str
    busy: bool
    activeRunId: Optional[str]
    updatedAt: int
    agentId: str
    graphId: str
    messages: list[dict[str, Any]]
    state: dict[str, Any]


class ThreadSummary(BaseModel):
    threadId: str
    agentId: str
    busy: bool
    activeRunId: Optional[str]
    updatedAt: int
