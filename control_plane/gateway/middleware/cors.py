"""CORS configuration.

We run frontend and control plane cross-origin.

Dev default policy: allow all origins.

Notes:
- This is intentionally permissive for local dev/demo ergonomics.
- If you need a stricter policy, set `CORS_ALLOW_ORIGINS` or `CORS_ALLOW_ORIGIN_REGEX`.
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from gateway.settings import settings


def add_cors(app: FastAPI) -> None:
    # Explicit allow-all.
    origins = list(settings.cors_allow_origins)
    if origins == ["*"]:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        return

    # Allow overriding with a regex (advanced).
    origin_regex = os.getenv("CORS_ALLOW_ORIGIN_REGEX", "").strip() or None
    if origin_regex:
        app.add_middleware(
            CORSMiddleware,
            allow_origin_regex=origin_regex,
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "Accept", "X-Request-Id"],
        )
        return

    # Default: allow all origins for dev ergonomics.
    if not origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        return

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept", "X-Request-Id"],
    )
