"""CORS configuration.

We run frontend and control plane cross-origin.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from gateway.settings import settings


def add_cors(app: FastAPI) -> None:
    # Default: no CORS unless configured.
    if not settings.cors_allow_origins:
        return

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_allow_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept", "X-Request-Id"],
    )
