"""Execution Plane (LangGraph graphs).

说明：
- 这里是执行面主干实现（跑图 + streaming + 持久化由 LangGraph Agent Server 负责）。
- 不承载平台语义（鉴权/租户/RBAC/审计等由 Control Plane 负责）。
"""
