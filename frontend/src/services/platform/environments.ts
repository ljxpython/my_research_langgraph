import type { PlatformEnvironment } from './types';
import { platformRequest } from './request';

// ==================== Environments API ====================

export async function listProjectEnvironments(
  projectId: string,
): Promise<PlatformEnvironment[]> {
  return platformRequest<PlatformEnvironment[]>(
    `/v1/projects/${encodeURIComponent(projectId)}/environments`,
    { method: 'GET' },
  );
}

export async function getEnvironment(
  environmentId: string,
): Promise<PlatformEnvironment> {
  return platformRequest<PlatformEnvironment>(
    `/v1/environments/${encodeURIComponent(environmentId)}`,
    { method: 'GET' },
  );
}

export async function createEnvironment(params: {
  projectId: string;
  name: string;
  type?: string;
  config_json?: Record<string, unknown>;
}): Promise<PlatformEnvironment> {
  return platformRequest<PlatformEnvironment>(
    `/v1/projects/${encodeURIComponent(params.projectId)}/environments`,
    {
      method: 'POST',
      data: {
        name: params.name,
        type: params.type ?? 'generic',
        config_json: params.config_json ?? {},
      },
    },
  );
}

export async function patchEnvironment(params: {
  projectId: string;
  environmentId: string;
  status?: string;
  config_json?: Record<string, unknown>;
}): Promise<PlatformEnvironment> {
  return platformRequest<PlatformEnvironment>(
    `/v1/projects/${encodeURIComponent(params.projectId)}/environments/${encodeURIComponent(
      params.environmentId,
    )}`,
    {
      method: 'PATCH',
      data: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.config_json ? { config_json: params.config_json } : {}),
      },
    },
  );
}
