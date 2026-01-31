import { request } from '@umijs/max';
import type { ControlPlaneMe } from './types';

function toCurrentUser(payload: ControlPlaneMe): API.CurrentUser {
  const userid =
    payload?.userId ?? payload?.userid ?? payload?.id ?? payload?.sub ?? undefined;
  const email = payload?.email ?? undefined;

  const name =
    payload?.displayName ??
    payload?.name ??
    payload?.username ??
    payload?.email ??
    'User';

  // access: 保持 Ant Design Pro 现有 access.ts 的判断逻辑可用
  const roles = payload?.roles;
  const access =
    typeof payload?.access === 'string'
      ? payload.access
      : Array.isArray(roles) && roles.includes('admin')
        ? 'admin'
        : undefined;

  return {
    userid: typeof userid === 'string' ? userid : undefined,
    name: typeof name === 'string' ? name : undefined,
    email: typeof email === 'string' ? email : undefined,
    avatar: typeof payload?.avatar === 'string' ? payload.avatar : undefined,
    access,
  };
}

export async function getMe(options?: { [key: string]: any }) {
  const res = await request<any>('/v1/me', {
    method: 'GET',
    ...(options || {}),
  });

  // umi-request 风格：默认直接返回 body；但也兼容 { data: ... } 的包裹形式
  const payload = res?.data ?? res;
  return toCurrentUser(payload as ControlPlaneMe);
}
