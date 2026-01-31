from __future__ import annotations

import uuid


def make_id(prefix: str) -> str:
    """Generate a ULID-like ID with prefix.

    We prefer ULID for sorting, but keep a uuid fallback for bootstrap.
    """

    try:
        import ulid  # type: ignore

        return f"{prefix}_{ulid.new()}"
    except Exception:
        return f"{prefix}_{uuid.uuid4().hex}"
