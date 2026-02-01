from __future__ import annotations

from sqlalchemy import select

from gateway.db.models import PlatformRunEvent


def list_run_events_after_seq(
    db,
    *,
    tenant_id: str,
    run_id: str,
    after_seq: int,
    limit: int,
) -> list[PlatformRunEvent]:
    stmt = (
        select(PlatformRunEvent)
        .where(
            PlatformRunEvent.tenant_id == tenant_id,
            PlatformRunEvent.run_id == run_id,
            PlatformRunEvent.seq > after_seq,
        )
        .order_by(PlatformRunEvent.seq.asc())
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())
