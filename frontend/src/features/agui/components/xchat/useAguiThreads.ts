import * as React from 'react';

import { listThreads } from '@/services/controlPlane/threads';
import type { ControlPlaneThreadSummary } from '@/services/controlPlane/types';

export function useAguiThreads(params: {
  agentId?: string;
  limit?: number;
  enabled?: boolean;
}) {
  const { agentId, limit = 100, enabled = true } = params;

  const [threads, setThreads] = React.useState<ControlPlaneThreadSummary[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<any>(undefined);

  const refresh = React.useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(undefined);
    try {
      const raw = (await listThreads(
        { agentId: agentId || undefined, limit },
        { skipErrorHandler: true },
      )) as any;

      // Some setups wrap responses in { data: [...] } (Ant Design Pro demo shape).
      const candidate =
        Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.data)
            ? raw.data
            : Array.isArray(raw?.data?.data)
              ? raw.data.data
              : [];
      setThreads(candidate as ControlPlaneThreadSummary[]);
    } catch (e) {
      setError(e);
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [agentId, enabled, limit]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    threads,
    loading,
    error,
    refresh,
  };
}
