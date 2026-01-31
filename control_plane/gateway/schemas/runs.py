from __future__ import annotations

from pydantic import BaseModel


class CancelResponse(BaseModel):
    ok: bool
    threadId: str
    runId: str
    status: str
