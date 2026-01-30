import os
from dotenv import load_dotenv

load_dotenv()
# from langchain.chat_models import init_chat_model
from langchain_deepseek.chat_models import ChatDeepSeek
from langchain_openai.chat_models import ChatOpenAI


def get_default_model():
    model = ChatDeepSeek(model="deepseek-chat")
    # 为 SummarizationMiddleware 提供上下文上限，避免默认 170k 触发过晚。
    # DeepSeek 硬上限 131072，设 50k 使摘要在约 42.5k token 触发。
    model.profile = {"max_input_tokens": 50_000}
    return model

def get_zhipu_model():
    return ChatOpenAI(
        model='GLM-4.6',
        api_key=os.getenv("ZHIPUAI_API_KEY"),
        base_url="https://open.bigmodel.cn/api/paas/v4",
    )

# def get_doubao_model():
#     return ChatOpenAI(
#         model='doubao-seed-1-6-251015',
#         api_key=os.getenv("DOUBAO_API_KEY"),
#         base_url="https://ark.cn-beijing.volces.com/api/v3",
#     )

# doubao_llm = get_doubao_model()

# response = doubao_llm.invoke("你好")
# print(response)

# llm = get_default_model()
# response = llm.invoke("你好")
# print(response)
# for text in llm.stream("你好"):
#     print(text.content, end="", flush=True)
if __name__ == '__main__':
    from langchain_core.messages import HumanMessage
    content = "帮我研究一下langgraph的前景，最后完成一篇报告"
    messages = [HumanMessage(content=content)]
    response = get_zhipu_model().invoke(messages)
    for text in response.content:
        print(text, end="", flush=True)
