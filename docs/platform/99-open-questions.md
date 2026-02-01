# 未决问题（Open Questions）

本文件用于记录“尚未评审收敛”的关键决策点。

规则：

- 每个问题必须能落到“需要做什么决定/影响哪些模块/默认建议是什么”
- 一旦收敛，应在对应分册中写死，并从此处移除

## Q1：环境模板（template/overlay）是否需要？

已明确：Phase A 不做环境模板。

未决点：

- 是否要支持 tenant/project 级环境模板 + project 环境 overlay（用于 dev/staging/prod 批量推广）
- 如果支持，merge 规则采用哪种（JSON merge patch / 显式字段覆盖 / 受限 overlay）

## Q2：SecretRef / Secrets 管理演进

已决定（Phase A）：

- 环境配置完全不存明文敏感信息，只存引用（SecretRef）
- 平台不存储 SecretRef 对应的明文值
- SecretRef 的解析由“部署环境/运行时”提供（例如运行进程环境变量、K8s Secret、CI 注入等）

未决点（Phase B/C）：

- 对接外部 Secret Manager（Vault/云 KMS/Parameter Store）
- 或引入 platform-managed secrets（需要加密、权限、轮换、审计与导出策略）
