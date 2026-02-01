import type { PlatformArtifact } from './types';
import { platformRequest } from './request';

// ==================== Artifacts API（平台项目域） ====================

export async function uploadProjectArtifact(params: {
  projectId: string;
  file: File;
  kind: string;
  runId?: string;
  metadataJson?: Record<string, unknown>;
}): Promise<PlatformArtifact> {
  const form = new FormData();
  form.append('file', params.file);
  form.append('kind', params.kind);
  if (params.runId) form.append('run_id', params.runId);
  if (params.metadataJson) {
    form.append('metadata_json', JSON.stringify(params.metadataJson));
  }

  // 注意：不要手动设置 Content-Type，让浏览器自动加 boundary
  return platformRequest<PlatformArtifact>(
    `/v1/projects/${encodeURIComponent(params.projectId)}/artifacts`,
    {
      method: 'POST',
      data: form,
    },
  );
}

export async function getArtifact(artifactId: string): Promise<PlatformArtifact> {
  return platformRequest<PlatformArtifact>(
    `/v1/artifacts/${encodeURIComponent(artifactId)}`,
    { method: 'GET' },
  );
}
