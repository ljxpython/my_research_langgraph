from __future__ import annotations

import json
from typing import Any


def custom_event(name: str, value: Any) -> dict[str, Any]:
    """Create an AG-UI compatible CUSTOM event dict.

    Notes:
    - Keep payload JSON-serializable (LangGraph event stream requires this).
    - Do not include raw chain-of-thought or secrets.
    """

    return {"type": "CUSTOM", "name": name, "value": json.loads(json.dumps(value))}
