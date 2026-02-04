"""MCP shared helpers.

说明：
- MCP 工具的加载/连接策略应统一收敛在这里，避免每个 agent 自己 new client。
- Execution Plane 只负责“跑图”，鉴权/租户隔离由 Control Plane 负责。
"""
