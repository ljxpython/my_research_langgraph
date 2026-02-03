# 04 - per_req_config_modifier：从请求属性注入配置

本章目标：演示“同一套服务代码，根据请求头/请求属性动态补 config”。

典型用途：

- 从 header 读取 API key（仅用于演示；生产里更建议服务端自己持有 key）
- 从 header 读取 tenant / cost-tier，然后在服务端决定用哪个模型

LangServe 支持在 `add_routes(...)` 时传入 `per_req_config_modifier`（函数签名以你使用的 LangServe 版本为准）。

在本仓库里，我们不把这块接到主干执行面（execution_plane），因为执行面是 LangGraph Agent Server。
但你可以用同样思路在 Control Plane 做“请求级配置注入”。

参考（官方示例风格，供你对照查证）：

- `langchain-ai/langserve` README（configurable chain / per-request config）
