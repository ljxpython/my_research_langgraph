from __future__ import annotations

from pydantic import BaseModel


class FlowChatThreadBinding(BaseModel):
    agentId: str
    threadId: str


class FlowChatThreadsResponse(BaseModel):
    flowInstanceId: str
    threads: dict[str, FlowChatThreadBinding]


class UpsertFlowChatThreadRequest(BaseModel):
    agentId: str
    executionTargetId: str = "local-dev"
