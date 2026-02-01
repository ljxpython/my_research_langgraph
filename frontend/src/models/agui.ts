import * as React from 'react';

type AguiToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

type AguiMessage = {
  id: string;
  role: string;
  content: string;
  name?: string;
  toolCalls?: AguiToolCall[];
  toolCallId?: string;
};

type AguiState = {
  ui: Record<string, any>;
  app: Record<string, any>;
  debug: Record<string, any>;
};

type ControlPlaneRunAgentInput = {
  messages: Array<{ id: string; role: string; content: string }>;
  thread_id: string;
  run_id?: string;
  state?: AguiState;
  context?: Array<Record<string, any>>;
  forwarded_props?: Record<string, any>;
};

type ControlPlaneThreadSnapshot = {
  threadId: string;
  busy: boolean;
  activeRunId: string | null;
  updatedAt: number;
  agentId: string;
  graphId: string;
  messages: AguiMessage[];
  state: AguiState;
};

type InterruptPayload = {
  interruptId?: string;
  title?: string;
  description?: string;
  schema?: Record<string, any>;
  resumeHint?: Record<string, any>;
  [k: string]: any;
};

type AguiEvent = {
  type: string;
  [k: string]: any;
};

function emptyAguiState(): AguiState {
  return { ui: {}, app: {}, debug: {} };
}

function coerceAguiState(snapshot: any): AguiState {
  const ui = snapshot?.ui && typeof snapshot.ui === 'object' ? snapshot.ui : {};
  const app = snapshot?.app && typeof snapshot.app === 'object' ? snapshot.app : {};
  const debug =
    snapshot?.debug && typeof snapshot.debug === 'object' ? snapshot.debug : {};
  return { ui, app, debug };
}

function makeMessageId(prefix: string): string {
  // UI 侧仅需局部唯一即可（服务端可能会在 snapshot 中重写 id）。
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function useAguiModel() {
  const [threadId, setThreadId] = React.useState<string>('');
  const [busy, setBusy] = React.useState<boolean>(false);
  // 与 agent-chat-ui 类似：busy 不仅表示“已开始跑”，也表示“请求已发出/正在建立流”。
  const [streamConnecting, setStreamConnecting] = React.useState<boolean>(false);
  const [snapshotLoading, setSnapshotLoading] = React.useState<boolean>(false);
  const [firstTokenReceived, setFirstTokenReceived] = React.useState<boolean>(false);
  const [activeRunId, setActiveRunId] = React.useState<string>('');
  const [selectedAgentId, setSelectedAgentId] = React.useState<string>('');

  const [messages, setMessages] = React.useState<AguiMessage[]>([]);
  const [state, setState] = React.useState<AguiState>(emptyAguiState());

  const [interrupt, setInterrupt] = React.useState<InterruptPayload | undefined>(
    undefined,
  );

  const abortRef = React.useRef<AbortController | null>(null);
  const inflightRef = React.useRef<boolean>(false);

  const applyEvent = React.useCallback((evt: AguiEvent) => {
    if (!evt || typeof evt !== 'object') return;
    const t = String((evt as any).type || '');

    switch (t) {
      case 'RUN_STARTED': {
        const nextThreadId = typeof evt.threadId === 'string' ? evt.threadId : '';
        const nextRunId = typeof evt.runId === 'string' ? evt.runId : '';
        if (nextThreadId) setThreadId(nextThreadId);
        setBusy(true);
        setStreamConnecting(false);
        setFirstTokenReceived(false);
        setActiveRunId(nextRunId);
        return;
      }
      case 'RUN_FINISHED': {
        setBusy(false);
        setStreamConnecting(false);
        setFirstTokenReceived(false);
        setActiveRunId('');
        return;
      }
      case 'RUN_ERROR': {
        setBusy(false);
        setStreamConnecting(false);
        setFirstTokenReceived(false);
        setActiveRunId('');
        return;
      }
      case 'MESSAGES_SNAPSHOT': {
        const next = Array.isArray((evt as any).messages) ? (evt as any).messages : [];
        setMessages(next as AguiMessage[]);
        setFirstTokenReceived(true);
        return;
      }
      case 'STATE_SNAPSHOT': {
        setState(coerceAguiState((evt as any).snapshot));
        setFirstTokenReceived(true);
        return;
      }
      case 'CUSTOM': {
        const name = typeof (evt as any).name === 'string' ? (evt as any).name : '';
        if (name === 'interrupt') {
          const payload = (evt as any).payload;
          if (payload && typeof payload === 'object') {
            setInterrupt(payload as InterruptPayload);
          } else {
            setInterrupt({});
          }
        }
        return;
      }
      default:
        return;
    }
  }, []);

  const stopStream = React.useCallback(() => {
    const ctrl = abortRef.current;
    abortRef.current = null;
    if (ctrl) ctrl.abort();
  }, []);

  const reset = React.useCallback(() => {
    stopStream();
    setThreadId('');
    setBusy(false);
    setStreamConnecting(false);
    setSnapshotLoading(false);
    setFirstTokenReceived(false);
    setActiveRunId('');
    setSelectedAgentId('');
    setMessages([]);
    setState(emptyAguiState());
    setInterrupt(undefined);
  }, [stopStream]);

  const loadSnapshot = React.useCallback(async (id: string) => {
    const { getThreadSnapshot } = await import('@/services/controlPlane/threads');
    setSnapshotLoading(true);
    try {
      const resp = await getThreadSnapshot(id, { skipErrorHandler: true });
      const snap = resp as unknown as ControlPlaneThreadSnapshot;
      setThreadId(snap.threadId);
      setBusy(!!snap.busy);
      setStreamConnecting(false);
      // Snapshot succeeded; treat as having initial data.
      setFirstTokenReceived(true);
      setActiveRunId(snap.activeRunId || '');
      setSelectedAgentId(snap.agentId || '');
      setMessages(Array.isArray(snap.messages) ? snap.messages : []);
      setState(coerceAguiState(snap.state));
      return snap;
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  const ensureThread = React.useCallback(async () => {
    if (!selectedAgentId) {
      throw new Error('missing selectedAgentId');
    }
    const { createThread } = await import('@/services/controlPlane/threads');
    const resp = await createThread(
      { agentId: selectedAgentId, executionTargetId: 'local-dev' },
      { skipErrorHandler: true },
    );
    const newThreadId = (resp as any)?.threadId;
    if (typeof newThreadId !== 'string' || !newThreadId) {
      throw new Error('invalid threadId');
    }

    setThreadId(newThreadId);
    setBusy(false);
    setActiveRunId('');
    setMessages([]);
    setState(emptyAguiState());
    setInterrupt(undefined);

    return newThreadId;
  }, [selectedAgentId]);

  const startRun = React.useCallback(
    async (params: {
      agentId: string;
      threadId: string;
      messages: AguiMessage[];
      forwardedProps?: Record<string, any>;
    }) => {
      if (inflightRef.current) {
        return { ok: false as const, reason: 'BUSY' as const };
      }
      inflightRef.current = true;
      const { agentId, threadId: tid, messages: nextMessages, forwardedProps } =
        params;

      // 任何时刻只允许 1 条流
      stopStream();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // 立刻进入 busy/connecting，避免 RUN_STARTED 到达前用户连续点击导致并发请求。
      setBusy(true);
      setStreamConnecting(true);
      setFirstTokenReceived(false);

      const runInput: ControlPlaneRunAgentInput = {
        thread_id: tid,
        messages: nextMessages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        })),
        state: {
          ...state,
          ui: {
            ...(state.ui || {}),
            selectedAgent: agentId,
          },
        },
        context: [],
        forwarded_props: forwardedProps || {},
      };

      try {
        const { streamAgentRun } = await import('@/services/controlPlane/runs');
        await streamAgentRun(
          agentId,
          runInput,
          {
            onEvent: applyEvent,
            onOpen: () => {
              // 连接已建立；RUN_STARTED 会很快到达。
              setStreamConnecting(true);
            },
          },
          { signal: ctrl.signal },
        );
        return { ok: true as const };
      } catch (e) {
        const runs = await import('@/services/controlPlane/runs');
        const parsed = runs.parseControlPlaneError(e);
        if (parsed?.status === 409 && parsed.code === 'THREAD_BUSY') {
          const details = parsed.details || {};
          const active =
            typeof details.activeRunId === 'string' ? details.activeRunId : '';
          const th = typeof details.threadId === 'string' ? details.threadId : '';
          if (th) setThreadId(th);
          setBusy(true);
          setStreamConnecting(false);
          setActiveRunId(active);

          // best-effort: 触发 snapshot，让 CP 有机会做 stale busy reconciliation。
          // 如果 snapshot 返回不 busy，则认为是“陈旧 busy”，自动重试一次。
          try {
            const snap = await loadSnapshot(th || tid);
            if (snap && !snap.busy) {
              // Avoid infinite loops.
              return { ok: false as const, reason: 'RETRY' as const };
            }
          } catch {
            // ignore
          }
          return {
            ok: false as const,
            reason: 'THREAD_BUSY' as const,
            details,
          };
        }

        setBusy(false);
        setStreamConnecting(false);
        setActiveRunId('');
        return { ok: false as const, reason: 'ERROR' as const, error: e };
      } finally {
        // 清理当前 stream 引用（但不要改 busy；busy 由事件/快照决定）
        if (abortRef.current === ctrl) {
          abortRef.current = null;
        }
        inflightRef.current = false;
      }
    },
    [applyEvent, loadSnapshot, state, stopStream],
  );

  const sendUserMessage = React.useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content) return { ok: true as const };

      if (!selectedAgentId) {
        return { ok: false as const, reason: 'NO_AGENT' as const };
      }

      let tid = threadId;
      if (!tid) {
        // agent-chat-ui-like UX: allow first message to create a thread automatically.
        try {
          tid = await ensureThread();
        } catch (e) {
          return { ok: false as const, reason: 'NO_THREAD' as const, error: e };
        }
      }

      if (busy) {
        return { ok: false as const, reason: 'BUSY' as const };
      }

      const userMsg: AguiMessage = {
        id: makeMessageId('m-user'),
        role: 'user',
        content,
      };

      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);

      const res = await startRun({
        agentId: selectedAgentId,
        threadId: tid,
        messages: nextMessages,
      });

      // 如果 startRun 检测到可能是 stale busy，允许用户消息“无损重试”一次。
      if (!(res as any).ok && (res as any).reason === 'RETRY') {
        return startRun({
          agentId: selectedAgentId,
          threadId: tid,
          messages: nextMessages,
        });
      }
      return res;
    },
    [busy, ensureThread, messages, selectedAgentId, startRun, threadId],
  );

  const resumeInterrupt = React.useCallback(
    async (params: {
      message: string;
      input: Record<string, any>;
    }) => {
      if (!interrupt) {
        return { ok: false as const, reason: 'NO_INTERRUPT' as const };
      }
      if (!threadId) {
        return { ok: false as const, reason: 'NO_THREAD' as const };
      }
      if (!selectedAgentId) {
        return { ok: false as const, reason: 'NO_AGENT' as const };
      }

      const userMsg: AguiMessage = {
        id: makeMessageId('m-user'),
        role: 'user',
        content: params.message || 'resume',
      };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInterrupt(undefined);

      return startRun({
        agentId: selectedAgentId,
        threadId,
        messages: nextMessages,
        forwardedProps: {
          command: {
            resume: {
              interruptId: interrupt.interruptId,
              input: params.input,
            },
          },
        },
      });
    },
    [interrupt, messages, selectedAgentId, startRun, threadId],
  );

  const requestCancel = React.useCallback(async () => {
    if (!threadId || !activeRunId) {
      return { ok: true as const };
    }

    stopStream();

    const { cancelRun } = await import('@/services/controlPlane/threads');
    await cancelRun(threadId, activeRunId, { skipErrorHandler: true });
    // Cancel 语义是 best-effort，UI 侧先乐观更新；最终以 snapshot/事件为准。
    setBusy(false);
    setActiveRunId('');
    return { ok: true as const };
  }, [activeRunId, stopStream, threadId]);

  const closeInterrupt = React.useCallback(() => {
    setInterrupt(undefined);
  }, []);

  const api = React.useMemo(
    () => ({
      // state
      threadId,
      busy,
      streamConnecting,
      snapshotLoading,
      firstTokenReceived,
      activeRunId,
      selectedAgentId,
      messages,
      state,
      interrupt,

      // actions
      setSelectedAgentId,
      setThreadId,
      reset,
      ensureThread,
      loadSnapshot,
      sendUserMessage,
      resumeInterrupt,
      requestCancel,
      closeInterrupt,
      applyEvent,
    }),
    [
      activeRunId,
      applyEvent,
      busy,
      closeInterrupt,
      ensureThread,
      interrupt,
      loadSnapshot,
      messages,
      firstTokenReceived,
      snapshotLoading,
      requestCancel,
      reset,
      resumeInterrupt,
      sendUserMessage,
      selectedAgentId,
      state,
      streamConnecting,
      threadId,
    ],
  );

  return api;
}
