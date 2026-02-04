from __future__ import annotations

import os
from typing import Any

from langchain.agents import create_agent
from langchain.tools import tool

from ep.shared.llm.factory import get_default_llm


@tool
def semantic_search(query: str) -> str:
    """A minimal semantic search tool.

    Production note:
    - This is a stub to productize the Learn -> Semantic Search tutorial.
    - Replace with a real loader/splitter/embeddings/vector store pipeline.
    """

    # Keep it deterministic for smoke tests.
    q = query.strip().lower()
    if not q:
        return "No query"
    return f"[stub] semantic_search hit for: {query}"


def make_graph(config: Any | None = None):
    _ = config
    llm = get_default_llm()
    system_prompt = (
        "You are a semantic search assistant. "
        "Use the semantic_search tool to retrieve relevant passages and answer the user." 
    )

    return create_agent(
        model=llm,
        tools=[semantic_search],
        system_prompt=system_prompt,
    )


graph = make_graph
