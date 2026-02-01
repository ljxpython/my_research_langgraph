import type {
  PlatformArtifact,
  PlatformRun,
  PlatformRunEventsPage,
} from './types';
import { platformRequest } from './request';

// ==================== Runs API ====================

export async function listProjectRuns(projectId: string): Promise<PlatformRun[]> {
  return platformRequest<PlatformRun[]>(
    `/v1/projects/${encodeURIComponent(projectId)}/runs`,
    { method: 'GET' },
  );
}

export async function createRun(params: {
  projectId: string;
  client_run_id: string;
  environment_id: string;
  runner?: string;
  params?: Record<string, unknown>;
}): Promise<PlatformRun> {
  return platformRequest<PlatformRun>(
    `/v1/projects/${encodeURIComponent(params.projectId)}/runs`,
    {
      method: 'POST',
      data: {
        client_run_id: params.client_run_id,
        environment_id: params.environment_id,
        runner: params.runner ?? 'dummy',
        params: params.params ?? {},
      },
    },
  );
}

export async function getRun(runId: string): Promise<PlatformRun> {
  return platformRequest<PlatformRun>(`/v1/runs/${encodeURIComponent(runId)}`, {
    method: 'GET',
  });
}

export async function cancelRun(runId: string): Promise<{ ok: boolean } | Record<string, unknown>> {
  return platformRequest<Record<string, unknown>>(
    `/v1/runs/${encodeURIComponent(runId)}:cancel`,
    { method: 'POST' },
  );
}

export async function listRunEvents(
  runId: string,
  params?: { cursor?: string; limit?: number },
  options?: { signal?: AbortSignal },
): Promise<PlatformRunEventsPage> {
  return platformRequest<PlatformRunEventsPage>(
    `/v1/runs/${encodeURIComponent(runId)}/events`,
    {
      method: 'GET',
      params,
      ...(options?.signal ? { signal: options.signal } : {}),
    },
  );
}

export async function listRunArtifacts(runId: string): Promise<PlatformArtifact[]> {
  return platformRequest<PlatformArtifact[]>(
    `/v1/runs/${encodeURIComponent(runId)}/artifacts`,
    { method: 'GET' },
  );
}
