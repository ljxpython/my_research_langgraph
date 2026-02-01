import type { PlatformProject } from './types';
import { platformRequest } from './request';

// ==================== Projects API ====================

export async function listProjects(): Promise<PlatformProject[]> {
  return platformRequest<PlatformProject[]>('/v1/projects', { method: 'GET' });
}

export async function getProject(projectId: string): Promise<PlatformProject> {
  return platformRequest<PlatformProject>(`/v1/projects/${encodeURIComponent(projectId)}`, {
    method: 'GET',
  });
}

export async function createProject(params: {
  name: string;
  description?: string;
}): Promise<PlatformProject> {
  return platformRequest<PlatformProject>('/v1/projects', {
    method: 'POST',
    data: {
      name: params.name,
      description: params.description,
    },
  });
}
