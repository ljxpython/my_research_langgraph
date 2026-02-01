import type { PlatformAuditEvent, PlatformCursorPage } from './types';
import { platformRequest } from './request';

// ==================== Audit API ====================

export async function listProjectAuditEvents(
  projectId: string,
  params?: {
    action?: string;
    resource_type?: string;
    actor_id?: string;
    outcome?: string;
    since?: number;
    until?: number;
    cursor?: string;
    limit?: number;
  },
): Promise<PlatformCursorPage<PlatformAuditEvent> | PlatformAuditEvent[]> {
  // 服务端可能返回 cursor page，也可能直接返回数组；前端兼容两种形态。
  return platformRequest<PlatformCursorPage<PlatformAuditEvent> | PlatformAuditEvent[]>(
    `/v1/projects/${encodeURIComponent(projectId)}/audit-events`,
    { method: 'GET', params },
  );
}
