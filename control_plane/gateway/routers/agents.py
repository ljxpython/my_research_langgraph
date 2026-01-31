from __future__ import annotations

from fastapi import APIRouter, Depends

from gateway.deps.auth import CurrentUser, UserContext
from gateway.deps.db import get_db
from gateway.schemas.agents import Agent as AgentOut
from gateway.services.agents_service import list_agents


router = APIRouter(prefix="/v1", tags=["agents"])


@router.get("/agents", response_model=list[AgentOut])
def get_agents(
    db=Depends(get_db),
    user: UserContext = CurrentUser,
):
    agents = list_agents(db, tenant_id=user.tenant_id)
    return [
        AgentOut(agentId=a.agent_id, displayName=a.display_name, status=a.status)
        for a in agents
    ]
