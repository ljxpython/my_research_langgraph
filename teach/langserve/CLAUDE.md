# teach/langserve/

这个目录用于沉淀 LangServe 的“动手教程”，目标是让读者能快速跑通：

- 最小 runnable -> HTTP API（invoke/stream/playground）
- 运行时配置（configurable fields）
- per-request 配置注入（从请求头/请求属性取值）

风格约定：

- 文档中文，代码标识符英文。
- 先能跑，再解释；每章都给可复制的 `curl` 或运行命令。
- 尽量引用本仓库路径与现有实践（但提醒：本仓库主干执行面是 LangGraph Agent Server，不是 LangServe）。

目录（约定）：

```
teach/langserve/
  README.md
  01-quickstart.md
  02-invoke-stream-playground.md
  03-configurable-model-switch.md
  04-per-request-config-modifier.md
  05-compare-with-langgraph-agent-server.md
  demo_min_server/
    requirements.txt
    server.py
```
