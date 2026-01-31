from __future__ import annotations

import unittest

from gateway.adapters.langgraph_adapter import normalize_snapshot


class TestSnapshotNormalization(unittest.TestCase):
    def test_normalize_minimum_messages(self):
        messages, state = normalize_snapshot(
            langgraph_state={
                "values": {
                    "messages": [
                        {"type": "human", "content": "hi"},
                        {"type": "ai", "content": "hello"},
                    ],
                    "ui": {"panel": {"activeTab": "tools"}},
                    "app": {},
                    "debug": {},
                }
            }
        )

        self.assertEqual(messages[0]["role"], "user")
        self.assertEqual(messages[0]["content"], "hi")
        self.assertEqual(messages[1]["role"], "assistant")
        self.assertEqual(messages[1]["content"], "hello")

        self.assertIn("ui", state)
        self.assertIn("app", state)
        self.assertIn("debug", state)
        self.assertNotIn("messages", state)
