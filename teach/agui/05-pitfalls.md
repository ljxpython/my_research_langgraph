# 05 - 常见坑与痛点（务实版）

## 1. “AG-UI 能不能完美适配 LangGraph SDK？”

不能。

- LangGraph SDK 依赖 LangGraph Agent Server 的 REST/stream API。
- AG-UI 是事件协议。

如果你试图把一个端点同时满足两者，通常会把复杂度推爆：
- 既要实现 LangGraph 的 threads/runs 资源模型
- 又要实现 AG-UI 的事件序列

正确做法：分两个入口或明确选择其一。

## 2. SSE 被“代理缓冲”导致前端不流式

典型症状：服务端明明在 yield，浏览器端一大坨一起到。

原因：中间层（Nginx/Ingress/网关）buffer 了响应。

解决：
- 关闭代理缓冲
- 传输层加心跳（ping）

## 3. interrupt/resume 的隐性要求：必须有可恢复的 checkpoint

如果你是“自建 FastAPI 包 graph”，要支持 HITL：
- 必须启用持久化 checkpointer
- 必须稳定传 `thread_id`

否则 resume 只能变成“重新跑一遍”，语义就不对了。

LangGraph 的官方持久化文档强调：没有 thread_id 就无法持久化，也无法 resume。

## 4. 状态同步（STATE_DELTA）很容易把带宽打爆

策略建议：
- 不要把 UI 的大对象直接塞进 state
- delta/patch 要可控（必要时做节流、采样）
- 对敏感字段做过滤/脱敏

## 5. 多租户下 thread_id 的安全边界

无论你走哪条路：
- thread_id 都不能当作“猜不到的秘密”
- 必须做 tenant/user 级权限校验

建议：
- 平台生成 thread_id，并绑定 tenant_id/user_id
- 所有 thread 查询与 run 都先过授权
