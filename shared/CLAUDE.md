# shared/

这个目录用于放“跨前后端共享的契约资产”，目标是减少对接漂移。

原则：
- 只放 **契约与示例**（JSON examples、错误码表、事件注册表、字段说明）。
- 不放业务代码，不引入运行时依赖。
- 前后端实现以 `docs/` 的协议为准，`shared/` 用于提供可复制的样例与枚举清单。

目录结构：

```
shared/
  contracts/
    http/
      errors.md
      examples/
        run.request.json
        busy.response.json
        snapshot.response.json
        cancel.response.json
        resume.request.json
    agui/
      custom-events.md
```
