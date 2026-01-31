import { getControlPlaneBaseURL } from './config';
import { clearAccessToken, getAccessToken } from './token';
import type { ControlPlaneErrorResponse, ControlPlaneRunAgentInput } from './types';

export class ControlPlaneHttpError extends Error {
  status: number;
  body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ControlPlaneHttpError';
    this.status = status;
    this.body = body;
  }
}

async function readJsonSafely(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

function buildURL(path: string): string {
  const base = getControlPlaneBaseURL();
  return base ? `${base}${path}` : path;
}

export async function streamAgentRun(
  agentId: string,
  input: ControlPlaneRunAgentInput,
  handlers: {
    onEvent: (event: any) => void;
    onOpen?: () => void;
  },
  options?: {
    signal?: AbortSignal;
  },
): Promise<void> {
  const token = getAccessToken();
  const url = buildURL(`/v1/agents/${encodeURIComponent(agentId)}:run`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
    signal: options?.signal,
  });

  if (res.status === 401) {
    clearAccessToken();
  }

  if (!res.ok) {
    const body = await readJsonSafely(res);
    const msg =
      typeof (body as any)?.error?.message === 'string'
        ? (body as any).error.message
        : `HTTP ${res.status}`;
    throw new ControlPlaneHttpError(msg, res.status, body);
  }

  handlers.onOpen?.();

  if (!res.body) {
    throw new ControlPlaneHttpError('Missing response body', res.status);
  }

  await consumeSseJson(res.body, handlers.onEvent, options?.signal);
}

export function parseControlPlaneError(
  err: unknown,
):
  | {
      status: number;
      code?: string;
      message?: string;
      requestId?: string;
      details?: Record<string, any>;
    }
  | undefined {
  if (!(err instanceof ControlPlaneHttpError)) return undefined;

  const status = err.status;
  const body = err.body as ControlPlaneErrorResponse | undefined;
  const code = body?.error?.code;
  const message = body?.error?.message;
  const requestId = body?.error?.requestId;
  const details = body?.error?.details;
  return { status, code, message, requestId, details };
}

async function consumeSseJson(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: any) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  try {
    while (true) {
      if (signal?.aborted) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        return;
      }

      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // 按行解析（Control Plane 目前每条事件都在单独的 data: 行内）
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const rawLine = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');

        const line = rawLine.replace(/\r$/, '');
        if (!line) continue;

        if (!line.startsWith('data:')) continue;
        const payload = line.slice('data:'.length).trim();
        if (!payload) continue;

        try {
          const evt = JSON.parse(payload);
          onEvent(evt);
        } catch {
          // ignore malformed event
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}
