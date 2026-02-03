# 02 - invoke / stream / playground：怎么调 LangServe

本章目标：用 `curl` 调通 `/invoke` 和 `/stream`，并知道 playground 在哪。

以下示例以 demo 的 `/joke` endpoint 为例。

## 1) invoke：一次请求一次响应

```bash
curl -s \
  -H 'Content-Type: application/json' \
  -d '{
    "input": {"topic": "sql"}
  }' \
  http://127.0.0.1:8001/joke/invoke
```

你会得到一个 JSON 响应，里面包含输出（具体字段随版本略有差异）。

## 2) stream：流式输出（SSE/分块）

```bash
curl -N \
  -H 'Content-Type: application/json' \
  -d '{
    "input": {"topic": "langserve"}
  }' \
  http://127.0.0.1:8001/joke/stream
```

说明：

- `-N` 表示不要在客户端缓冲输出，否则你会误以为“没在 stream”。

## 3) playground：在线试接口

通常 LangServe 会提供 playground 页面（路径随版本可能不同）。

你可以从 `http://127.0.0.1:8001/docs` 里点对应 route 看看是否有 playground 链接。

如果你希望做成“聊天式 playground”，需要让 runnable 输入 schema 是 `messages` 形式（这超出本章范围）。
