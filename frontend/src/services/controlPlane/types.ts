// ==================== Control Plane 类型定义（前端最小集） ====================

export type ControlPlaneLoginRequest = {
  username: string;
  password: string;
};

export type ControlPlaneLoginResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export type ControlPlaneAgent = {
  agentId: string;
  displayName: string;
  status: string;
};

// /v1/me 返回值未在任务中固定，这里按宽松结构接收并在 UI 侧做 normalize。
export type ControlPlaneMe = Record<string, any>;

// ==================== 通用错误响应（Control Plane 统一错误封装） ====================

export type ControlPlaneErrorResponse = {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: Record<string, any>;
  };
};

// ==================== AG-UI 消息/状态（Phase-1 最小集合） ====================

export type AguiToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type AguiMessage = {
  id: string;
  role: string;
  content: string;
  name?: string;
  toolCalls?: AguiToolCall[];
  toolCallId?: string;
};

export type AguiState = {
  ui: Record<string, any>;
  app: Record<string, any>;
  debug: Record<string, any>;
};

// ==================== Threads ====================

export type ControlPlaneCreateThreadRequest = {
  agentId: string;
  executionTargetId?: string;
};

export type ControlPlaneCreateThreadResponse = {
  threadId: string;
};

export type ControlPlaneThreadSnapshot = {
  threadId: string;
  busy: boolean;
  activeRunId: string | null;
  updatedAt: number;
  agentId: string;
  graphId: string;
  messages: AguiMessage[];
  state: AguiState;
};

export type ControlPlaneThreadSummary = {
  threadId: string;
  agentId: string;
  busy: boolean;
  activeRunId: string | null;
  updatedAt: number;
};

export type ControlPlaneCancelRunResponse = {
  ok: boolean;
  threadId: string;
  runId: string;
  status: string;
};

// ==================== Runs（SSE） ====================

export type ControlPlaneRunAgentInput = {
  messages: Array<{ id: string; role: string; content: string }>;
  thread_id: string;
  run_id?: string;
  state?: AguiState;
  context?: Array<Record<string, any>>;
  forwarded_props?: Record<string, any>;
};
