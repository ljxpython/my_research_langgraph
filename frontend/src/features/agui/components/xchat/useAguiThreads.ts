import { useRequest } from '@umijs/max';
import * as React from 'react';

import { listThreads } from '@/services/controlPlane/threads';
import type { ControlPlaneThreadSummary } from '@/services/controlPlane/types';

export function useAguiThreads(params: {
  agentId?: string;
  limit?: number;
  enabled?: boolean;
}) {
  const { agentId, limit = 100, enabled = true } = params;

  const req = useRequest(
    async () => {
      return await listThreads(
        { agentId: agentId || undefined, limit },
        { skipErrorHandler: true },
      );
    },
    {
      refreshDeps: [agentId, limit],
      ready: enabled,
    },
  );

  const threads = React.useMemo(() => {
    const raw = (req.data || []) as any;
    return Array.isArray(raw) ? (raw as ControlPlaneThreadSummary[]) : [];
  }, [req.data]);

  return {
    threads,
    loading: req.loading,
    error: req.error,
    refresh: () => req.refresh(),
  };
}
