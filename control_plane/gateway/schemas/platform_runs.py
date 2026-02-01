from __future__ import annotations

from pydantic import BaseModel, Field


class CreatePlatformRunRequest(BaseModel):
    client_run_id: str
    environment_id: str
    runner: str = "dummy"
    params: dict = Field(default_factory=dict)


class PlatformRunResponse(BaseModel):
    run_id: str
    tenant_id: str
    project_id: str
    environment_id: str
    status: str
    runner: str
    client_run_id: str
    params: dict
    created_at: int
    started_at: int | None
    finished_at: int | None
    summary_json: dict


class CancelPlatformRunResponse(BaseModel):
    ok: bool
    run_id: str
    status: str


class RunEventResponse(BaseModel):
    event_id: str
    seq: int
    ts: int
    type: str
    payload: dict


class RunEventsPageResponse(BaseModel):
    # Note: frontend platform module expects camelCase pagination fields.
    runId: str
    events: list[RunEventResponse]
    nextCursor: str
    hasMore: bool
