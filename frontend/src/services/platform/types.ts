// ==================== Platform（通用测试管理）类型定义 ====================

export type PlatformErrorResponse = {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: Record<string, unknown>;
  };
};

// -------------------- Projects --------------------

export type PlatformProjectStatus = 'active' | 'archived';

export type PlatformProject = {
  project_id: string;
  slug?: string;
  name: string;
  description?: string;
  status: PlatformProjectStatus;
  created_by?: string;
  created_at?: number;
  updated_at?: number;
  archived_at?: number;
  archived_by?: string;
};

// -------------------- Environments --------------------

export type PlatformEnvironmentStatus = 'active' | 'disabled';

export type PlatformEnvironment = {
  environment_id: string;
  project_id: string;
  name: string;
  type: 'generic' | string;
  status: PlatformEnvironmentStatus;
  health_status?: string;
  last_error?: string;
  active_run_id?: string | null;
  lock_expires_at?: number | null;
  created_at?: number;
  updated_at?: number;
  config_json?: Record<string, unknown>;
};

// -------------------- Runs / RunEvents --------------------

export type PlatformRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | string;

export type PlatformRun = {
  run_id: string;
  project_id: string;
  environment_id: string;
  runner: string;
  status: PlatformRunStatus;
  client_run_id?: string;
  created_at?: number;
  updated_at?: number;
  started_at?: number;
  finished_at?: number;
  params?: Record<string, unknown>;
};

export type PlatformRunEvent = {
  event_id: string;
  seq: number;
  ts: number;
  type: string;
  payload: Record<string, unknown>;
};

export type PlatformRunEventsPage = {
  runId?: string;
  run_id?: string;
  events: PlatformRunEvent[];
  nextCursor: string;
  hasMore: boolean;
};

// -------------------- Artifacts --------------------

export type PlatformArtifact = {
  artifact_id: string;
  project_id: string;
  run_id?: string | null;
  kind: string;
  filename: string;
  content_type?: string;
  size_bytes?: number;
  sha256?: string;
  storage_key?: string;
  metadata_json?: Record<string, unknown>;
  created_at?: number;
  created_by?: string;
};

// -------------------- Audit --------------------

export type PlatformAuditActor = {
  actor_type: 'user' | 'system' | 'service' | string;
  actor_id: string;
  display?: string;
};

export type PlatformAuditResource = {
  resource_type: string;
  resource_id: string;
};

export type PlatformAuditOutcome = 'success' | 'denied' | 'error' | string;

export type PlatformAuditEvent = {
  audit_event_id: string;
  schema_version?: number;
  created_at: number;
  tenant_id?: string;
  project_id?: string;
  actor: PlatformAuditActor;
  action: string;
  resource: PlatformAuditResource;
  request_id?: string;
  outcome: PlatformAuditOutcome;
  reason_code?: string;
  details_json?: Record<string, unknown>;
};

export type PlatformCursorPage<T> = {
  items: T[];
  nextCursor?: string;
  hasMore?: boolean;
};
