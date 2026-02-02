import { request } from '@umijs/max';

import type {
  ControlPlaneFlowChatThreadBinding,
  ControlPlaneFlowChatThreadsResponse,
  ControlPlaneUpsertFlowChatThreadRequest,
} from './types';

export async function getFlowChatThreads(
  flowInstanceId: string,
  options?: { [key: string]: any },
) {
  return request<ControlPlaneFlowChatThreadsResponse>(
    `/v1/flow-instances/${encodeURIComponent(flowInstanceId)}/chat-threads`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

export async function upsertFlowChatThread(
  flowInstanceId: string,
  sectionKey: string,
  body: ControlPlaneUpsertFlowChatThreadRequest,
  options?: { [key: string]: any },
) {
  return request<ControlPlaneFlowChatThreadBinding>(
    `/v1/flow-instances/${encodeURIComponent(flowInstanceId)}/chat-threads/${encodeURIComponent(sectionKey)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      data: body,
      ...(options || {}),
    },
  );
}
