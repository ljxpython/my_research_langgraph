# 安全与密钥管理约定

平台化的底线：任何执行面/观测面的服务端密钥都不能下发到终端用户。

## 1. 密钥来源

- 开发环境：`.env`（仅本地），禁止提交到仓库
- 生产环境：Secret Manager（K8s Secret / Vault / AWS/GCP Secret Manager 等）

## 2. 访问控制

- 平台 token（面向用户/前端）与执行面 token（面向 LangGraph/LangSmith）必须分离
- Gateway 负责鉴权与授权；执行面只信任 Gateway 的服务端身份

## 3. 审计（建议硬性要求）

每次 run 至少记录：
- tenant_id / project_id / user_id
- agent_id（平台逻辑）与 graphId/deployment（执行映射）
- thread_id / run_id / trace_id
- 工具调用摘要（工具名、耗时、是否成功；必要时脱敏输入输出）

## 4. 代码层注意事项

当前 demo/示例里存在“将第三方 token/URL 写死在代码里的风险模式”。
平台化实现时必须改为：
- 统一从 env/secret manager 读取
- 启动时校验必需配置（缺失直接 fail-fast）
- 生产禁用任何调试用的硬编码 key
