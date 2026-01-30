"""基于 `examples/docker_single/app/sql_agent.py` 的“真实调用”版本（教学用）。

目标：
- 使用真实 LLM（ZHIPUAI / OpenAI-compatible）
- 使用 SQLDatabaseToolkit + Chinook.db
- 输出一个 LangGraph CompiledStateGraph，供 AG-UI SSE server 包装

重要：
- 为了把 demo 控制在“最小学习成本”，这里不引入 MCP chart tool（原例子里会起 npx 子进程）。
- DB 文件默认复用 `examples/docker_single/Chinook.db`；若不存在再下载。
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv
import sys

from langchain.agents import create_agent
from langchain_community.agent_toolkits import SQLDatabaseToolkit
from langchain_community.utilities import SQLDatabase
from langgraph.checkpoint.memory import MemorySaver


CHINOOK_URL = "https://storage.googleapis.com/benchmarks-artifacts/chinook/Chinook.db"


def _repo_root() -> Path:
    # teach/agui/demo_sql_agent/sql_agent_graph.py -> repo root
    return Path(__file__).resolve().parents[3]


def ensure_chinook_db(db_path: Path, *, timeout_s: int = 30) -> None:
    if db_path.exists():
        return

    db_path.parent.mkdir(parents=True, exist_ok=True)

    resp = requests.get(CHINOOK_URL, timeout=timeout_s)
    resp.raise_for_status()
    db_path.write_bytes(resp.content)


def build_sql_agent_graph(*, env_file: Optional[Path] = None):
    """构建一个可直接执行的 SQL agent graph。

    - env_file: 指向包含 `ZHIPUAI_API_KEY` 的 .env 文件。
      如果不传，调用方需自行在环境变量里设置。
    """

    if env_file is not None:
        load_dotenv(env_file)

    # 复用官方 docker_single 的 Chinook.db（更贴近你现有例子）。
    db_path = _repo_root() / "examples" / "docker_single" / "Chinook.db"
    ensure_chinook_db(db_path)

    # 绝对路径：sqlite URI 三斜杠 + 以 / 开头的路径 == 四斜杠（SQLAlchemy 语义：绝对路径）。
    db = SQLDatabase.from_uri(f"sqlite:///{db_path}")

    # 复用现有模型定义（真实调用）。
    # docker_single 的代码使用 `from app.llms import ...`（PEP420 namespace package）。
    docker_single_dir = _repo_root() / "examples" / "docker_single"
    sys.path.insert(0, str(docker_single_dir))
    from app.llms import get_zhipu_model  # type: ignore

    llm = get_zhipu_model()
    if not getattr(llm, "api_key", None) and not (getattr(llm, "client", None) or getattr(llm, "_client", None)):
        # 不强依赖内部实现，仅做友好提示。
        # 真实报错通常会在第一次 invoke/stream 时抛出。
        pass

    toolkit = SQLDatabaseToolkit(db=db, llm=llm)
    tools = toolkit.get_tools()

    system_prompt = (
        "\n".join(
            [
                "You are an agent designed to interact with a SQL database.",
                "Given an input question, create a syntactically correct {dialect} query to run,",
                "then look at the results of the query and return the answer. Unless the user",
                "specifies a specific number of examples they wish to obtain, always limit your",
                "query to at most {top_k} results.",
                "",
                "You can order the results by a relevant column to return the most interesting",
                "examples in the database. Never query for all the columns from a specific table,",
                "only ask for the relevant columns given the question.",
                "",
                "You MUST double check your query before executing it. If you get an error while",
                "executing a query, rewrite the query and try again.",
                "",
                "DO NOT make any DML statements (INSERT, UPDATE, DELETE, DROP etc.) to the",
                "database.",
                "",
                "To start you should ALWAYS look at the tables in the database to see what you",
                "can query. Do NOT skip this step.",
                "",
                "Then you should query the schema of the most relevant tables.",
            ]
        )
    ).format(dialect=db.dialect, top_k=5)

    # teaching demo：使用 MemorySaver 让 thread_id 有意义（否则中断/历史无法演示）。
    return create_agent(
        llm,
        tools,
        system_prompt=system_prompt,
        checkpointer=MemorySaver(),
    )
