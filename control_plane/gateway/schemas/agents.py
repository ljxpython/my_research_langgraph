from __future__ import annotations

from pydantic import BaseModel


class Agent(BaseModel):
    agentId: str
    displayName: str
    status: str
