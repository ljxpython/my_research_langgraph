from __future__ import annotations

import os
from typing import Any

from langchain_deepseek.chat_models import ChatDeepSeek
from langchain_openai.chat_models import ChatOpenAI


def _set_profile_if_supported(model: Any, *, max_input_tokens: int) -> None:
    """Best-effort: some providers expose a profile dict."""

    try:
        model.profile = {"max_input_tokens": max_input_tokens}
    except Exception:
        return


def get_default_llm() -> Any:
    """Pick a default chat model based on available env vars.

    We intentionally keep selection env-driven to avoid hardcoding secrets.
    """

    provider = os.getenv("EP_LLM_PROVIDER", "").strip().lower()

    # Provider override (if set) wins.
    if provider in {"zhipu", "glm"}:
        return get_zhipu_llm()
    if provider in {"deepseek"}:
        return get_deepseek_llm()
    if provider in {"openai"}:
        return get_openai_llm()

    # Auto-detect.
    if os.getenv("ZHIPUAI_API_KEY"):
        return get_zhipu_llm()
    if os.getenv("DEEPSEEK_API_KEY"):
        return get_deepseek_llm()
    if os.getenv("OPENAI_API_KEY"):
        return get_openai_llm()

    raise ValueError(
        "未检测到可用的 LLM 配置。请设置以下任意一组环境变量：\n"
        "- ZHIPUAI_API_KEY（Zhipu/GLM）\n"
        "- DEEPSEEK_API_KEY（DeepSeek）\n"
        "- OPENAI_API_KEY（OpenAI）\n"
        "可选：EP_LLM_PROVIDER=zhipu|deepseek|openai 强制选择。"
    )


def get_deepseek_llm() -> Any:
    model = ChatDeepSeek(model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"))
    _set_profile_if_supported(model, max_input_tokens=int(os.getenv("EP_MAX_INPUT_TOKENS", "50000")))
    return model


def get_zhipu_llm() -> Any:
    api_key = os.getenv("ZHIPUAI_API_KEY")
    if not api_key:
        raise ValueError("环境变量 ZHIPUAI_API_KEY 未设置。")

    model = ChatOpenAI(
        model=os.getenv("ZHIPU_MODEL", "GLM-4.6"),
        api_key=api_key,
        base_url=os.getenv("ZHIPU_BASE_URL", "https://open.bigmodel.cn/api/paas/v4"),
    )
    _set_profile_if_supported(model, max_input_tokens=int(os.getenv("EP_MAX_INPUT_TOKENS", "50000")))
    return model


def get_openai_llm() -> Any:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("环境变量 OPENAI_API_KEY 未设置。")
    model = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        api_key=api_key,
        base_url=os.getenv("OPENAI_BASE_URL") or None,
    )
    _set_profile_if_supported(model, max_input_tokens=int(os.getenv("EP_MAX_INPUT_TOKENS", "50000")))
    return model
