import { request } from '@umijs/max';
import type { PlatformErrorResponse } from './types';

// ==================== Platform request 封装 ====================

export class PlatformHttpError extends Error {
  status: number;
  body?: unknown;
  retryAfterSeconds?: number;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'PlatformHttpError';
    this.status = status;
    this.body = body;
  }
}

type ResponseLike = {
  status?: number;
  headers?: {
    get?: (name: string) => string | null;
  };
};

function parseRetryAfterSeconds(response?: ResponseLike): number | undefined {
  const raw = response?.headers?.get?.('Retry-After');
  if (!raw) return undefined;
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

export type PlatformParsedError = {
  status: number;
  code?: string;
  message?: string;
  requestId?: string;
  details?: Record<string, unknown>;
  retryAfterSeconds?: number;
};

export function parsePlatformError(err: unknown): PlatformParsedError | undefined {
  if (err instanceof PlatformHttpError) {
    const body = err.body as PlatformErrorResponse | undefined;
    return {
      status: err.status,
      code: body?.error?.code,
      message: body?.error?.message,
      requestId: body?.error?.requestId,
      details: body?.error?.details,
      retryAfterSeconds: err.retryAfterSeconds,
    };
  }

  // umi-request 的 RequestError（结构不稳定，按最小字段解构）
  const maybe: { response?: ResponseLike; data?: unknown; message?: string } =
    (typeof err === 'object' && err !== null ? (err as any) : {}) as any;
  const status = typeof maybe.response?.status === 'number' ? maybe.response.status : 0;
  const body = maybe.data as PlatformErrorResponse | undefined;
  const code = body?.error?.code;
  const message = body?.error?.message ?? maybe.message;
  const requestId = body?.error?.requestId;
  const details = body?.error?.details;
  return {
    status,
    code,
    message,
    requestId,
    details,
    retryAfterSeconds: parseRetryAfterSeconds(maybe.response),
  };
}

export function formatPlatformError(err: unknown): string {
  const parsed = parsePlatformError(err);
  if (!parsed) return '请求失败，请重试。';

  const msg = parsed.message || (parsed.status ? `HTTP ${parsed.status}` : '请求失败');
  const code = parsed.code ? ` (${parsed.code})` : '';
  const req = parsed.requestId ? `\nrequestId: ${parsed.requestId}` : '';
  return `${msg}${code}${req}`;
}

function unwrapData<T>(res: unknown): T {
  // umi-request 风格：默认直接返回 body；但也兼容 { data: ... } 的包裹形式
  if (typeof res === 'object' && res !== null && 'data' in res) {
    return (res as { data: T }).data;
  }
  return res as T;
}

export async function platformRequest<T>(
  path: string,
  options: Record<string, unknown> & { method: 'GET' | 'POST' | 'PATCH' | 'DELETE' },
): Promise<T> {
  try {
    const res = await request<unknown>(path, {
      ...(options as any),
      // 平台模块自行做错误提示与重试策略（例如 429 backoff），避免全局 errorHandler 的泛化提示。
      skipErrorHandler: true,
    });
    return unwrapData<T>(res);
  } catch (err: unknown) {
    const parsed = parsePlatformError(err);
    const status = parsed?.status ?? 0;
    const body = (typeof err === 'object' && err !== null ? (err as any).data : undefined) as
      | unknown
      | undefined;

    const msg = parsed?.message || (status ? `HTTP ${status}` : 'Request failed');
    const e = new PlatformHttpError(msg, status, body);
    e.retryAfterSeconds = parsed?.retryAfterSeconds;
    throw e;
  }
}
