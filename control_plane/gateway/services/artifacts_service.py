from __future__ import annotations

import hashlib
import os
from pathlib import Path

from fastapi import HTTPException

from gateway.settings import settings


def get_artifacts_root_dir() -> Path:
    # Keep default inside repo to avoid surprise writes elsewhere.
    raw = getattr(settings, "artifact_storage_dir", None) or os.getenv("ARTIFACT_STORAGE_DIR", "./.data/artifacts")
    return Path(raw)


def save_upload_to_storage(*, file_obj, max_bytes: int, dest_path: Path) -> tuple[int, str]:
    """Stream upload to disk, returning (size_bytes, sha256hex)."""

    dest_path.parent.mkdir(parents=True, exist_ok=True)

    h = hashlib.sha256()
    size = 0

    with dest_path.open("wb") as f:
        while True:
            chunk = file_obj.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail={"code": "ERROR", "message": "artifact too large"},
                )
            h.update(chunk)
            f.write(chunk)

    return size, h.hexdigest()
