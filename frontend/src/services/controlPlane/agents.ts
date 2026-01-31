import { request } from '@umijs/max';
import type { ControlPlaneAgent } from './types';

export async function listAgents(options?: { [key: string]: any }) {
  const res = await request<any>('/v1/agents', {
    method: 'GET',
    ...(options || {}),
  });

  const payload = res?.data ?? res;
  return payload as ControlPlaneAgent[];
}
