"""Runtime settings.

Phase-1 keeps settings minimal and env-driven.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    control_plane_database_uri: str
    langgraph_api_url: str
    jwt_secret: str
    cors_allow_origins: tuple[str, ...]

    # ==================== Platform defaults（env-driven, Phase A） ====================

    default_env_lock_ttl_seconds: int

    # Artifacts
    artifact_storage_dir: str
    artifact_direct_upload_max_bytes: int

    # Rate limit
    rate_limit_enabled: bool
    rate_limit_user_write_rpm: int
    rate_limit_user_read_rpm: int
    rate_limit_user_poll_rpm: int
    rate_limit_runner_ingest_rpm: int

    # Optional shared counter backend (multi-replica)
    redis_url: str | None

    @staticmethod
    def from_env() -> "Settings":
        origins = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
        allow_origins: tuple[str, ...] = tuple(
            [o.strip() for o in origins.split(",") if o.strip()]
        )

        return Settings(
            control_plane_database_uri=os.getenv(
                "CONTROL_PLANE_DATABASE_URI",
                # Prefer explicit psycopg (v3) driver to avoid psycopg2-only defaults.
                "postgresql+psycopg://postgres:postgres@localhost:5432/control_plane_db",
            ),
            langgraph_api_url=os.getenv("LANGGRAPH_API_URL", "http://localhost:8123"),
            jwt_secret=os.getenv("JWT_SECRET", "dev-insecure-secret"),
            cors_allow_origins=allow_origins,

            default_env_lock_ttl_seconds=int(os.getenv("DEFAULT_ENV_LOCK_TTL_SECONDS", "7200")),

            artifact_storage_dir=os.getenv("ARTIFACT_STORAGE_DIR", "./.data/artifacts"),
            artifact_direct_upload_max_bytes=int(os.getenv("ARTIFACT_DIRECT_UPLOAD_MAX_BYTES", "52428800")),

            rate_limit_enabled=os.getenv("RATE_LIMIT_ENABLED", "true").lower().strip() not in {"0", "false", "no"},
            rate_limit_user_write_rpm=int(os.getenv("RATE_LIMIT_USER_WRITE_RPM", "120")),
            rate_limit_user_read_rpm=int(os.getenv("RATE_LIMIT_USER_READ_RPM", "1200")),
            rate_limit_user_poll_rpm=int(os.getenv("RATE_LIMIT_USER_POLL_RPM", "60")),
            rate_limit_runner_ingest_rpm=int(os.getenv("RATE_LIMIT_RUNNER_INGEST_RPM", "6000")),

            redis_url=os.getenv("REDIS_URL") or None,
        )


settings = Settings.from_env()
