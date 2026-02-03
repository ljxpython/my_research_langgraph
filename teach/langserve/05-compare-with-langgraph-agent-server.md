# 05 - LangServe vs LangGraph Agent Server：你到底在服务什么？

如果你主要困惑是“理论听不懂”，可以用下面这个判断方法：

## 1) 你要不要 threads/runs/persistence？

如果你要：

- thread（对话会话）
- run（一次执行的生命周期）
- checkpoint（断线恢复 / HITL / 后台继续跑）

那你更接近要的是 **LangGraph Agent Server**（本仓库 execution_plane 的方向）。

如果你不要这些，只要：

- 一个输入 -> 一次输出
- 可选 stream

那 **LangServe** 就够了，而且很省事。

## 2) 在平台架构里怎么共存？（推荐）

推荐形态：

1) Execution Plane：LangGraph Agent Server（跑 graph、状态、streaming、持久化）
2) Control Plane：FastAPI 网关（鉴权、租户、allowlist、审计、对前端输出稳定契约）
3) LangServe（可选）：把某些稳定的“小能力”拆成内部子服务，被 LangGraph 当 tool 调用

这样你不会为了“一个简单能力”把整个 graph runtime 搞得太重，也不会为了“一个复杂 agent”去自建 threads/runs。
