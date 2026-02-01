from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from langchain.agents import create_agent
from langchain_community.agent_toolkits import SQLDatabaseToolkit
from langchain_community.utilities import SQLDatabase

from ep.shared.llm.factory import get_default_llm


def _repo_root() -> Path:
    # execution_plane/src/ep/agents/sql_agent/graph.py -> execution_plane/
    return Path(__file__).resolve().parents[5]


def _seed_demo_sqlite_db(db_path: Path) -> None:
    """Create a tiny read-only demo DB for quick local validation.

    We intentionally do this only when no existing DB is provided.
    """

    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS customers (
              id INTEGER PRIMARY KEY,
              name TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS products (
              id INTEGER PRIMARY KEY,
              name TEXT NOT NULL,
              price_cents INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS orders (
              id INTEGER PRIMARY KEY,
              customer_id INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY(customer_id) REFERENCES customers(id)
            );
            CREATE TABLE IF NOT EXISTS order_items (
              order_id INTEGER NOT NULL,
              product_id INTEGER NOT NULL,
              quantity INTEGER NOT NULL,
              FOREIGN KEY(order_id) REFERENCES orders(id),
              FOREIGN KEY(product_id) REFERENCES products(id)
            );
            """
        )
        # Seed only if empty.
        cur.execute("SELECT COUNT(*) FROM customers")
        (n,) = cur.fetchone() or (0,)
        if int(n) == 0:
            cur.executemany(
                "INSERT INTO customers(id, name) VALUES(?, ?)",
                [(1, "Alice"), (2, "Bob"), (3, "Carol")],
            )
            cur.executemany(
                "INSERT INTO products(id, name, price_cents) VALUES(?, ?, ?)",
                [(1, "Keyboard", 9900), (2, "Mouse", 4900), (3, "Monitor", 19900)],
            )
            cur.executemany(
                "INSERT INTO orders(id, customer_id, created_at) VALUES(?, ?, ?)",
                [(1, 1, "2026-01-01"), (2, 2, "2026-01-03")],
            )
            cur.executemany(
                "INSERT INTO order_items(order_id, product_id, quantity) VALUES(?, ?, ?)",
                [(1, 1, 1), (1, 2, 2), (2, 3, 1)],
            )
        conn.commit()
    finally:
        conn.close()


def _resolve_db_uri() -> str:
    explicit = os.getenv("SQL_AGENT_DB_URI", "").strip()
    if explicit:
        return explicit

    # Prefer a local Chinook DB if present, otherwise bootstrap a tiny demo DB.
    candidates = [
        _repo_root() / "Chinook.db",
        _repo_root().parent / "examples" / "docker_single" / "Chinook.db",
    ]
    for p in candidates:
        if p.exists():
            return f"sqlite:///{p}"

    demo_path = _repo_root() / ".data" / "sql_agent_demo.db"
    if not demo_path.exists():
        _seed_demo_sqlite_db(demo_path)
    return f"sqlite:///{demo_path}"


def _build_system_prompt(*, dialect: str, top_k: int) -> str:
    return (
        "You are an agent designed to interact with a SQL database.\n"
        "Given an input question, create a syntactically correct {dialect} query to run,\n"
        "then look at the results of the query and return the answer. Unless the user\n"
        "specifies a specific number of examples they wish to obtain, always limit your\n"
        "query to at most {top_k} results.\n\n"
        "You can order the results by a relevant column to return the most interesting\n"
        "examples in the database. Never query for all the columns from a specific table,\n"
        "only ask for the relevant columns given the question.\n\n"
        "You MUST double check your query before executing it. If you get an error while\n"
        "executing a query, rewrite the query and try again.\n\n"
        "DO NOT make any DML statements (INSERT, UPDATE, DELETE, DROP etc.) to the\n"
        "database.\n\n"
        "To start you should ALWAYS look at the tables in the database to see what you\n"
        "can query. Do NOT skip this step.\n\n"
        "Then you should query the schema of the most relevant tables.\n"
    ).format(dialect=dialect, top_k=top_k)


_llm = get_default_llm()
_db_uri = _resolve_db_uri()
_db = SQLDatabase.from_uri(_db_uri)

_toolkit = SQLDatabaseToolkit(db=_db, llm=_llm)
_tools = _toolkit.get_tools()

_top_k = int(os.getenv("SQL_AGENT_TOP_K", "5"))
_system_prompt = _build_system_prompt(dialect=_db.dialect, top_k=_top_k)

# Exported graph for LangGraph Agent Server.
graph = create_agent(model=_llm, tools=_tools, system_prompt=_system_prompt)
