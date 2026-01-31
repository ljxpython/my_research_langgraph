import { request } from '@umijs/max';
import type {
  ControlPlaneLoginRequest,
  ControlPlaneLoginResponse,
} from './types';

export async function login(
  body: ControlPlaneLoginRequest,
  options?: { [key: string]: any },
) {
  return request<ControlPlaneLoginResponse>('/v1/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}
