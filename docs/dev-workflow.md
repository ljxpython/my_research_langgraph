# 本地开发与联调工作流

目标：一条链路跑通（LangGraph 执行面 + Platform Gateway + 前端）。

另见：
- `docs/developer-experience.md`

## 1. Execution Plane：启动 LangGraph dev

在你们的 demo 结构里，graph 定义在：
- `execution_plane/langgraph.json`

典型启动方式（示例）：

```bash
cd execution_plane
langgraph dev --port 8123 --no-browser
```

## 2. Control Plane：启动 Platform Gateway（FastAPI）

建议 Gateway 在本地默认监听 `http://127.0.0.1:8000`。

开发模式建议：
- 通过 env 指向 LangGraph 执行面地址（例如 `LANGGRAPH_API_URL=http://127.0.0.1:8123`）
- 通过 env 配置 tenant/dev 用户的 mock auth（仅开发环境）

## 3. 前端：可选用 Dojo/最小客户端做参考

Phase-1（强交互）建议把验证重点放在“事件协议完整性”而不是 UI 漂亮：
- 能收到 token streaming
- 能看到 tool call 生命周期
- 能看到 state snapshot/delta
- 能触发 interrupt 并 resume

你们可以（可选）用 AG-UI 自带的 Dojo 或最小 Http client 来快速观察事件流，作为联调时的参考与对照。

注意：这里的 Dojo/最小 client 仅用于辅助排障与对照（例如观察事件序列、tool lifecycle、snapshot/delta、interrupt/resume），不作为平台语义/对外契约的验收标准。

- 如果你在调 graph/agent 本体能力（Execution Plane 的 threads/runs/stream、checkpoint 行为等），优先用 `agent-chat-ui` 直连执行面。
- `agent-chat-ui` 的通过不等价于平台语义通过（鉴权/租户/RBAC、busy(409)、审计/脱敏/配额等）。

## 4. 调试建议

- Gateway 打印：每个 run 的 `trace_id/thread_id/run_id`，并对事件流做采样日志（避免刷屏）
- 对 SSE：确认代理/网关不会 buffer（Nginx/Ingress 要关缓冲）
- 对中断：把 interrupt payload 单独打印成结构化日志，便于复现
