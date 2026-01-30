# AG-UI CUSTOM 事件注册表（Phase-1）

本文档定义平台层 `CUSTOM` 事件的命名与 payload 约定。

原则：
- 标准事件（RUN/TEXT_MESSAGE/TOOL_CALL/STATE/STEP）遵循 AG-UI。
- 平台扩展必须使用 `CUSTOM`，并且 **只增不删**。

## 1) interrupt（HITL）

- `type`: `CUSTOM`
- `name`: `interrupt`

payload 建议字段：

```json
{
  "interruptId": "i-...",
  "title": "Approval Required",
  "description": "Please approve the action",
  "schema": {},
  "resumeHint": {}
}
```

说明：
- 前端收到该事件后，应弹出表单/对话框收集用户输入。
- resume 通过 `forwarded_props.command.resume` 回传（见 `shared/contracts/http/examples/resume.request.json`）。

## 2) 平台命名空间（预留）

命名规则：

- `name: platform.<domain>.<action>`

建议预留：
- `platform.auth.denied`
- `platform.quota.exceeded`
- `platform.rate_limited`
- `platform.billing.usage`
