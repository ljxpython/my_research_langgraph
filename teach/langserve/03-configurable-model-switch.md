# 03 - configurable：在一次请求里切模型/温度

本章目标：理解 LangServe 的“请求级配置”是怎么进 runnable 的。

核心机制：

- 你在 runnable 上声明哪些字段是 configurable（例如 `model` / `temperature`）
- 调用 `/invoke` 或 `/stream` 时，在请求体里带 `config`（通常是 `config.configurable`）

## 1) demo 里做了什么

见 `teach/langserve/demo_min_server/server.py`：

- `llm` 通过 `.configurable_fields(...)` 声明：`model` 和 `temperature` 可以在请求时覆盖

这使得你可以这样调用：

## 2) 用 curl 覆盖 model / temperature

```bash
curl -s \
  -H 'Content-Type: application/json' \
  -d '{
    "input": {"topic": "tool calling"},
    "config": {
      "configurable": {
        "model": "gpt-4o-mini",
        "temperature": 0.2
      }
    }
  }' \
  http://127.0.0.1:8001/joke/invoke
```

注意：

- 这只是“机制演示”。生产里你通常不会允许前端随便传 model id。
- 更稳的做法是：由网关（Control Plane）做 allowlist，然后把选择后的结果下发给后端 runnable。

## 3) 为什么这能对应到“UI 下拉框切模型”？

UI 下拉框做的事通常就是：

1) 展示 allowlist（例如 `GET /v1/llms`）
2) 用户选中一个 `(provider, model)`
3) 每次请求把选项带在请求体 `config.configurable`（或网关自定义字段）里

LangServe 负责把这份 config 注入到 runnable 的运行参数里。
