# Examples / References

这个目录用于存放调研期的示例代码、POC、以及外部参考链接。

## 借鉴的开源仓库

- Ant Design Pro Components
  - https://github.com/ant-design/pro-components
- Ant Design Pro (Umi Max admin scaffold)
  - https://github.com/ant-design/ant-design-pro
- LangChain Agent Chat UI
  - https://github.com/langchain-ai/agent-chat-ui
- AG-UI Protocol
  - https://github.com/ag-ui-protocol/ag-ui

## 文档查阅原则

- 查阅资料时优先查阅官方文档及代码示例：
  - LangGraph 官方文档
  - LangChain 官方文档
- 外部博客/二手文章仅作补充参考，遇到冲突以官方文档/官方示例为准。

## 关于 agent-chat-ui 的定位（避免误区）

- `agent-chat-ui` 在本仓库主要用于“直连 Execution Plane（LangGraph Agent Server）调 graph/agent”，不用于验收平台语义。
- 平台对外入口以 Control Plane（AG-UI v1）为准；生产环境不建议对终端用户开放 Execution Plane。
- 双入口的取舍与原因见：`docs/developer-experience.md`、`docs/architecture.md`、`docs/api-contract.md`。
