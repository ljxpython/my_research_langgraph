from __future__ import annotations

import json
import unittest
from pathlib import Path

from gateway.schemas.errors import ErrorResponse
from gateway.schemas.threads import SnapshotResponse


class TestContractExamples(unittest.TestCase):
    def _repo_root(self) -> Path:
        # control_plane/tests/ -> repo root
        return Path(__file__).resolve().parents[2]

    def test_busy_error_example_parses(self):
        p = self._repo_root() / "shared" / "contracts" / "http" / "examples" / "busy.response.json"
        data = json.loads(p.read_text(encoding="utf-8"))
        parsed = ErrorResponse.model_validate(data)
        self.assertEqual(parsed.error.code, "THREAD_BUSY")
        self.assertIn("threadId", parsed.error.details)
        self.assertIn("activeRunId", parsed.error.details)

    def test_snapshot_example_parses(self):
        p = self._repo_root() / "shared" / "contracts" / "http" / "examples" / "snapshot.response.json"
        data = json.loads(p.read_text(encoding="utf-8"))
        parsed = SnapshotResponse.model_validate(data)
        self.assertIsInstance(parsed.threadId, str)
        self.assertIsInstance(parsed.busy, bool)
        self.assertIsInstance(parsed.messages, list)
        self.assertIsInstance(parsed.state, dict)
