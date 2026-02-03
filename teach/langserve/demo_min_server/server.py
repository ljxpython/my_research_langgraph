"""LangServe 最小 demo。

提供一个 /joke runnable，并演示：

- /invoke
- /stream
- configurable fields（每次请求覆盖 model/temperature）

运行：
  export OPENAI_API_KEY=...
  python teach/langserve/demo_min_server/server.py
"""

from __future__ import annotations

import os

# ==================== 依赖导入（直观版） ====================
# 这个 demo 选择使用正常的 import 语句，方便阅读。
# 如果你看到 ModuleNotFoundError，请在仓库根目录用“根环境”安装：
#   .venv/bin/python -m pip install -r teach/langserve/demo_min_server/requirements.txt
# 如果你的根环境里没有 pip（报 No module named pip），先执行：
#   .venv/bin/python -m ensurepip --upgrade
# 或（传统 venv）：
#   source .venv/bin/activate && pip install -r teach/langserve/demo_min_server/requirements.txt
try:
    import uvicorn
    from fastapi import FastAPI
    from langserve import add_routes

    from langchain_core.output_parsers import StrOutputParser
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.runnables import ConfigurableField
    from langchain_openai.chat_models import ChatOpenAI
except ModuleNotFoundError as e:
    missing = e.name or "<unknown>"
    raise RuntimeError(
        "缺少依赖：%s。请在仓库根目录执行：\n"
        "  .venv/bin/python -m pip install -r teach/langserve/demo_min_server/requirements.txt\n"
        "（如果提示 No module named pip：先执行 .venv/bin/python -m ensurepip --upgrade）\n"
        "或：\n"
        "  source .venv/bin/activate && pip install -r teach/langserve/demo_min_server/requirements.txt"
        % missing
    ) from e


def build_joke_chain():
    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are a concise assistant. Reply in one short paragraph.",
            ),
            ("human", "Tell me a short joke about {topic}."),
        ]
    )

    # 默认走环境变量：OPENAI_API_KEY / OPENAI_MODEL。
    # 这里仅演示机制：把 model/temperature 标记为 configurable，允许调用方在一次请求中覆盖。
    llm = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=float(os.getenv("OPENAI_TEMPERATURE", "0")),
    ).configurable_fields(
        # LangChain 新版本里对应字段名是 model_name；这里把对外 config key 仍命名为 "model"，便于理解。
        model_name=ConfigurableField(
            id="model",
            name="Model",
            description="Model id for this request (demo only; production should whitelist)",
        ),
        temperature=ConfigurableField(
            id="temperature",
            name="Temperature",
            description="Sampling temperature for this request",
        ),
    )

    return prompt | llm | StrOutputParser()


def create_app() -> FastAPI:
    app = FastAPI(title="LangServe Minimal Demo", version="0.1.0")

    joke_chain = build_joke_chain()

    add_routes(
        app,
        joke_chain,
        path="/joke",
        # 允许请求体里携带 configurable 字段。
        config_keys=["configurable"],
    )
    return app


app = create_app()


def main() -> None:
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
