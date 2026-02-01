from __future__ import annotations

from pydantic import BaseModel


class ArtifactResponse(BaseModel):
    artifact_id: str
    tenant_id: str
    project_id: str
    run_id: str | None
    kind: str
    filename: str
    content_type: str
    size_bytes: int
    created_at: int
    created_by: str
    download_url: str
