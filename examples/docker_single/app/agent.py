# System prompt to steer the agent to be an expert researcher
import asyncio
import os

from langchain.agents import create_agent

from app.llms import get_default_model,get_zhipu_model
from deepagents import create_deep_agent
from langchain_deepseek import ChatDeepSeek
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents.middleware import (
    ContextEditingMiddleware,
    ClearToolUsesEdit,
    AgentMiddleware,
    ModelCallLimitMiddleware,
    ToolCallLimitMiddleware,
)
def get_zhipu_search_mcp_tools():
    """从 Zhipu 官方 MCP 服务加载 web-search-prime 工具。

    官方配置示例：
    {
        "$schema": "https://opencode.ai/config.json",
        "mcp": {
            "web-search-prime": {
                "type": "remote",
                "url": "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
                "headers": {
                    "Authorization": "Bearer your_api_key"
                }
            }
        }
    }

    这里从 .env 中读取 ZHIPUAI_API_KEY 来填充 Authorization 头。
    """

    api_key = os.getenv("ZHIPUAI_API_KEY")
    if not api_key:
        raise ValueError("环境变量 ZHIPUAI_API_KEY 未设置，请在 .env 中配置后重试。")

    client = MultiServerMCPClient(
        {
            "web-search-prime": {
                "url": "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
                # Zhipu MCP 官方为远程服务，这里采用 SSE 传输
                "transport": "sse",
                "headers": {
                    "Authorization": f"Bearer {api_key}",
                },
            }
        }
    )

    tools = asyncio.run(client.get_tools())
    return tools
# tools = get_zhipu_search_mcp_tools()


# client = MultiServerMCPClient(
#     {
#         "research": {
#             "transport": "streamable_http",  # HTTP-based remote server
#             "url": "https://mcp.tavily.com/mcp/?tavilyApiKey=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",
#         }
#     }
# )
# tools = asyncio.run(client.get_tools())
research_instructions = """You are an expert researcher. Your job is to conduct thorough research and then write a polished report.

Use this to run an internet search for a given query. You can specify the max number of results to return, the topic, and whether raw content should be included.
"""


model = get_default_model()
zhipu_model = get_zhipu_model()



# 告诉 LangChain 模型的上下文上限（低于 DeepSeek 131072 硬限制），
# 内置 SummarizationMiddleware 将按 85% 触发、保留 10%。
# try:
#     # 覆盖默认 profile（防止未读到 get_default_model 中设置）
#     model.profile = {"max_input_tokens": 50_000}
# except Exception:
#     pass

agent = create_deep_agent(
    model=zhipu_model,
    # tools=tools,
    system_prompt=research_instructions,
    # middleware=[
    #     ContextEditingMiddleware(
    #         edits=[
    #             ClearToolUsesEdit(
    #                 trigger=40_000,
    #                 keep=1,
    #                 placeholder="[cleared]",
    #                 clear_tool_inputs=True,
    #                 clear_at_least=8_000,
    #             )
    #         ]
    #     ),
        # 限制模型/工具调用次数，防止单轮过多调用导致上下文暴涨
        # ModelCallLimitMiddleware(run_limit=4, exit_behavior="end"),
        # ToolCallLimitMiddleware(run_limit=4, thread_limit=6, exit_behavior="end"),
        # # 硬剪长消息，避免单条工具输出撑爆上下文
        # type(
        #     "ClipMiddleware",
        #     (AgentMiddleware,),
        #     {
        #         "name": "clip_middleware",
        #         "awrap_model_call": staticmethod(
        #             lambda request, handler: (
        #                 (lambda clipped: handler(request.override(messages=clipped)))(
        #                     [
        #                         (
        #                             m.__class__(
        #                                 content=(
        #                                     (m.content[:4000] + "…[truncated]")
        #                                     if isinstance(m.content, str)
        #                                     and len(m.content) > 4000
        #                                     else m.content
        #                                 ),
        #                                 **{
        #                                     k: v
        #                                     for k, v in m.__dict__.items()
        #                                     if k not in {"content"}
        #                                 },
        #                             )
        #                             if hasattr(m, "content")
        #                             else m
        #                         )
        #                         for m in request.messages
        #                     ]
        #                 )
        #             )
        #         ),
        #     },
        # )(),
    # ],
)
# .with_config(
#     {
#         # 关闭工具同步调用，避免测试时 StructuredTool sync 调用异常。
#         "method": "async",
#         "recursion_limit": 1000,
#     }
# ))

agent_not_deep = create_agent(
    model=zhipu_model,
    # tools=tools,
    system_prompt=research_instructions,
)


if __name__ == '__main__':
    import asyncio
    from langchain_core.messages import HumanMessage

    async def main():
        content = "帮我研究一下langgraph的前景，最后完成一篇报告"
        messages = [HumanMessage(content=content)]
        response = await agent.ainvoke({"messages": messages})
        for text in response["messages"]:
            text.pretty_print()

    asyncio.run(main())
