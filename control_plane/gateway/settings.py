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
        )


settings = Settings.from_env()
