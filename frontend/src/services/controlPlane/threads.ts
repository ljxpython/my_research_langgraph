import { request } from '@umijs/max';

import type {
  ControlPlaneCancelRunResponse,
  ControlPlaneCreateThreadRequest,
  ControlPlaneCreateThreadResponse,
  ControlPlaneThreadSnapshot,
} from './types';

// ==================== Threads API ====================

export async function createThread(
  body: ControlPlaneCreateThreadRequest,
  options?: { [key: string]: any },
) {
  return request<ControlPlaneCreateThreadResponse>('/v1/threads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

export async function getThreadSnapshot(
  threadId: string,
  options?: { [key: string]: any },
) {
  return request<ControlPlaneThreadSnapshot>(
    `/v1/threads/${encodeURIComponent(threadId)}/snapshot`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

export async function cancelRun(
  threadId: string,
  runId: string,
  options?: { [key: string]: any },
) {
  return request<ControlPlaneCancelRunResponse>(
    `/v1/threads/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}:cancel`,
    {
      method: 'POST',
      ...(options || {}),
    },
  );
}
