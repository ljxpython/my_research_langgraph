from __future__ import annotations

from pydantic import BaseModel, Field


class EnvironmentCreateRequest(BaseModel):
    name: str
    type: str = "generic"
    config_json: dict = Field(default_factory=dict)


class EnvironmentResponse(BaseModel):
    environment_id: str
    tenant_id: str
    project_id: str
    name: str
    type: str
    status: str
    config_json: dict
    health_status: str
    last_error: str | None
    active_run_id: str | None
    lock_expires_at: int | None
    created_at: int
    updated_at: int


class EnvironmentUpdateRequest(BaseModel):
    status: str | None = None  # active/disabled
    config_json: dict | None = None
