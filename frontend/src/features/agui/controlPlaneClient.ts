import type {
  ControlPlaneCreateThreadRequest,
  ControlPlaneCreateThreadResponse,
  ControlPlaneRunAgentInput,
  ControlPlaneThreadSnapshot,
} from '@/services/controlPlane/types';

export type ControlPlaneParsedError = {
  status: number;
  code?: string;
  message?: string;
  requestId?: string;
  details?: Record<string, any>;
};

export type ControlPlaneStreamHandlers = {
  onEvent: (event: any) => void;
  onOpen?: () => void;
};

export type ControlPlaneStreamOptions = {
  signal?: AbortSignal;
};

export interface ControlPlaneClient {
  createThread: (
    body: ControlPlaneCreateThreadRequest,
    options?: { [key: string]: any },
  ) => Promise<ControlPlaneCreateThreadResponse>;

  getThreadSnapshot: (
    threadId: string,
    options?: { [key: string]: any },
  ) => Promise<ControlPlaneThreadSnapshot>;

  cancelRun: (
    threadId: string,
    runId: string,
    options?: { [key: string]: any },
  ) => Promise<unknown>;

  streamAgentRun: (
    agentId: string,
    input: ControlPlaneRunAgentInput,
    handlers: ControlPlaneStreamHandlers,
    options?: ControlPlaneStreamOptions,
  ) => Promise<void>;

  parseError?: (err: unknown) => ControlPlaneParsedError | undefined;
}

// 兼容 umi-request 错误 / 自定义 fetch 错误，尽量抽取 shared contract 的 {error:{...}}。
export function parseControlPlaneErrorLoose(err: unknown): ControlPlaneParsedError | undefined {
  const maybe: any = err as any;
  const status =
    typeof maybe?.status === 'number'
      ? maybe.status
      : typeof maybe?.response?.status === 'number'
        ? maybe.response.status
        : 0;

  const body = (maybe?.body ?? maybe?.data) as any;
  const code = typeof body?.error?.code === 'string' ? body.error.code : undefined;
  const message = typeof body?.error?.message === 'string' ? body.error.message : undefined;
  const requestId = typeof body?.error?.requestId === 'string' ? body.error.requestId : undefined;
  const details = typeof body?.error?.details === 'object' && body.error.details ? body.error.details : undefined;

  if (!status && !code && !message) return undefined;
  return { status, code, message, requestId, details };
}
