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

export type ControlPlaneAgent = {
  agentId: string;
  displayName: string;
  status: string;
};

export type ControlPlaneThreadSummary = {
  threadId: string;
  agentId: string;
  busy: boolean;
  activeRunId: string | null;
  updatedAt: number;
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

export type ControlPlaneErrorPayload = {
  code: string;
  message: string;
  details?: Record<string, any>;
};

export type ControlPlaneErrorResponse = {
  detail?: any;
  error?: ControlPlaneErrorPayload;
};

export type AguiSseEvent = {
  type: string;
  [k: string]: any;
};

export type RunAgentInput = {
  messages: Array<{ id: string; role: string; content: string }>;
  thread_id: string;
  run_id?: string;
  state?: AguiState;
  context?: Array<Record<string, any>>;
  forwarded_props?: Record<string, any>;
};
