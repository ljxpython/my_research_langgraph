from __future__ import annotations

from pydantic import BaseModel


class ProjectCreateRequest(BaseModel):
    name: str
    description: str | None = None


class ProjectResponse(BaseModel):
    project_id: str
    tenant_id: str
    name: str
    description: str | None
    status: str
    created_by: str
    created_at: int
    updated_at: int


class ProjectMemberResponse(BaseModel):
    user_id: str
    role: str


class ProjectMemberUpsertRequest(BaseModel):
    user_id: str
    role: str  # owner/maintainer/viewer
