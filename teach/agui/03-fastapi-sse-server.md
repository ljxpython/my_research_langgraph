# 03 - FastAPI + SSE：最小 AG-UI Server 怎么写

本章目的：让你能读懂“一个 AG-UI server 为什么长这样”，以及它与 LangGraph/平台 Gateway 的边界。

## 1. 典型结构

典型代码形态：

- FastAPI route 读取 `RunAgentInput`
- 根据 `Accept` 头选择事件编码格式（SSE content-type 等）
- 用 `StreamingResponse` 返回一个 async generator
- generator 内部不断 `yield encoder.encode(event)`

本仓库内最小示例（推荐直接读）：
- `examples/ag-ui/integrations/langgraph/python/ag_ui_langgraph/endpoint.py`

其核心逻辑（摘要）：

```python
from fastapi.responses import StreamingResponse
from ag_ui.encoder import EventEncoder

@app.post(path)
async def endpoint(input_data: RunAgentInput, request: Request):
    encoder = EventEncoder(accept=request.headers.get("accept"))

    async def event_generator():
        async for event in agent.run(input_data):
            yield encoder.encode(event)

    return StreamingResponse(event_generator(), media_type=encoder.get_content_type())
```

## 2. 放到你们平台里：Gateway 到底做什么？

如果你们仍然采用“少造轮子”的主方案（LangGraph Agent Server 作为执行面），那么：

- Gateway 负责：鉴权/租户/路由/审计/限流
- Gateway 不负责：重建 threads/runs/checkpoint 体系（除非你决定自建执行面）

因此，一个更稳妥的演进路线是：

1) Phase-1：Gateway 透明代理 LangGraph API（前端用 LangGraph SDK）
2) Phase-2（可选）：Gateway 增加一个“AG-UI 视图端点”
   - 内部通过 LangGraph SDK/HTTP 调用 LangGraph Server
   - 然后把事件翻译成 AG-UI（这部分可以复用 `ag_ui_langgraph` 的思路）

这样你不会在早期就承担“自建执行面”的工作量。

## 3. 必须关注的工程细节（SSE）

- 代理缓冲：Nginx/Ingress 需要禁用 buffering，否则 SSE 会被攒包导致 UI 卡顿。
- 心跳：长连接建议定期发送 ping（否则中间层可能断开）。
- backpressure：事件过快时要避免把内存撑爆（尤其是 state delta 很大时）。
