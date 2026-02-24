import * as React from 'react';

import type {
  AguiMessage,
  AguiState,
  ControlPlaneRunAgentInput,
  ControlPlaneThreadSnapshot,
} from '@/services/controlPlane/types';

import type { ControlPlaneClient } from './controlPlaneClient';

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

export type UseAguiSessionOptions = {
  lockedAgentId?: string;
};

function emptyAguiState(): AguiState {
  return { ui: {}, app: {}, debug: {} };
}

function coerceAguiState(snapshot: any): AguiState {
  const ui = snapshot?.ui && typeof snapshot.ui === 'object' ? snapshot.ui : {};
  const app = snapshot?.app && typeof snapshot.app === 'object' ? snapshot.app : {};
  const debug = snapshot?.debug && typeof snapshot.debug === 'object' ? snapshot.debug : {};
  return { ui, app, debug };
}

function makeMessageId(prefix: string): string {
  // UI 侧仅需局部唯一即可（服务端可能会在 snapshot 中重写 id）。
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useAguiSession(client: ControlPlaneClient, options?: UseAguiSessionOptions) {
  const lockedAgentId = options?.lockedAgentId;

  const [threadId, setThreadId] = React.useState<string>('');
  const [busy, setBusy] = React.useState<boolean>(false);
  // 与 agent-chat-ui 类似：busy 不仅表示“已开始跑”，也表示“请求已发出/正在建立流”。
  const [streamConnecting, setStreamConnecting] = React.useState<boolean>(false);
  const [snapshotLoading, setSnapshotLoading] = React.useState<boolean>(false);
  const [firstTokenReceived, setFirstTokenReceived] = React.useState<boolean>(false);
  const [activeRunId, setActiveRunId] = React.useState<string>('');
  const [selectedAgentId, setSelectedAgentIdInner] = React.useState<string>('');

  const [messages, setMessages] = React.useState<AguiMessage[]>([]);
  const [state, setState] = React.useState<AguiState>(emptyAguiState());

  const [interrupt, setInterrupt] = React.useState<InterruptPayload | undefined>(undefined);

  // Phase-2: optional rich surfaces (plan/todo, MCP rendering events)
  const [plan, setPlan] = React.useState<Record<string, any> | undefined>(undefined);
  const [mcpEvents, setMcpEvents] = React.useState<Record<string, any>[]>([]);
  const [reasoningSummary, setReasoningSummary] = React.useState<Record<string, any> | undefined>(
    undefined,
  );

  const abortRef = React.useRef<AbortController | null>(null);
  const inflightRef = React.useRef<boolean>(false);

  const setSelectedAgentId = React.useCallback(
    (next: string) => {
      if (lockedAgentId && next && next !== lockedAgentId) {
        // 锁定 agent 的 session 不允许被页面逻辑误改写。
        return;
      }
      setSelectedAgentIdInner(next);
    },
    [lockedAgentId],
  );

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
      case 'TEXT_MESSAGE_START': {
        const messageId =
          typeof (evt as any).messageId === 'string'
            ? (evt as any).messageId
            : typeof (evt as any).message_id === 'string'
              ? (evt as any).message_id
              : '';
        if (!messageId) return;

        const role = typeof (evt as any).role === 'string' ? (evt as any).role : 'assistant';

        setMessages((prev) => {
          if (prev.some((m) => m.id === messageId)) return prev;
          return [...prev, { id: messageId, role, content: '' }];
        });
        return;
      }
      case 'TEXT_MESSAGE_CONTENT': {
        const messageId =
          typeof (evt as any).messageId === 'string'
            ? (evt as any).messageId
            : typeof (evt as any).message_id === 'string'
              ? (evt as any).message_id
              : '';
        const delta = typeof (evt as any).delta === 'string' ? (evt as any).delta : '';
        if (!messageId || !delta) return;

        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === messageId);
          if (idx < 0) {
            return [...prev, { id: messageId, role: 'assistant', content: delta }];
          }

          const next = prev.slice();
          const cur = next[idx];
          next[idx] = { ...cur, content: String(cur.content || '') + delta };
          return next;
        });
        setFirstTokenReceived(true);
        return;
      }
      case 'TEXT_MESSAGE_END': {
        // UI doesn't need an explicit “ended” flag for now.
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
          return;
        }

        // Control Plane emits CUSTOM with {name, value}. Keep compat with payload-only events.
        const value = (evt as any).value;
        if (name === 'plan') {
          if (value && typeof value === 'object') setPlan(value as Record<string, any>);
          else setPlan({ value });
          return;
        }
        if (name === 'reasoning_summary') {
          if (value && typeof value === 'object') setReasoningSummary(value as Record<string, any>);
          else setReasoningSummary({ value });
          return;
        }
        if (name === 'mcp') {
          setMcpEvents((prev) => {
            const next = prev.slice();
            next.push((value && typeof value === 'object' ? value : { value }) as Record<string, any>);
            if (next.length > 200) next.splice(0, next.length - 200);
            return next;
          });
          return;
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
    setSelectedAgentIdInner(lockedAgentId || '');
    setMessages([]);
    setState(emptyAguiState());
    setInterrupt(undefined);
    setPlan(undefined);
    setMcpEvents([]);
    setReasoningSummary(undefined);
  }, [lockedAgentId, stopStream]);

  const loadSnapshot = React.useCallback(
    async (id: string) => {
      setSnapshotLoading(true);
      try {
        const snap = (await client.getThreadSnapshot(id, {
          skipErrorHandler: true,
        })) as unknown as ControlPlaneThreadSnapshot;

        if (lockedAgentId && snap.agentId && snap.agentId !== lockedAgentId) {
          throw new Error('thread agentId mismatch');
        }

        setThreadId(snap.threadId);
        setBusy(!!snap.busy);
        setStreamConnecting(false);
        // Snapshot succeeded; treat as having initial data.
        setFirstTokenReceived(true);
        setActiveRunId(snap.activeRunId || '');
        setSelectedAgentIdInner(lockedAgentId || snap.agentId || '');
        setMessages(Array.isArray(snap.messages) ? snap.messages : []);
        setState(coerceAguiState(snap.state));
        return snap;
      } finally {
        setSnapshotLoading(false);
      }
    },
    [client, lockedAgentId],
  );

  const ensureThread = React.useCallback(async () => {
    const agentId = lockedAgentId || selectedAgentId;
    if (!agentId) {
      throw new Error('missing selectedAgentId');
    }

    const resp = await client.createThread(
      { agentId, executionTargetId: 'local-dev' },
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
    setSelectedAgentIdInner(agentId);
    return newThreadId;
  }, [client, lockedAgentId, selectedAgentId]);

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

      const { agentId, threadId: tid, messages: nextMessages, forwardedProps } = params;
      if (lockedAgentId && agentId !== lockedAgentId) {
        inflightRef.current = false;
        return { ok: false as const, reason: 'AGENT_LOCKED' as const };
      }

      // 任何时刻只允许 1 条流（session 内部约束）。
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
        await client.streamAgentRun(
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
        const parsed = client.parseError?.(e);
        if (parsed?.status === 409 && parsed.code === 'THREAD_BUSY') {
          const details = parsed.details || {};
          const active = typeof (details as any).activeRunId === 'string' ? (details as any).activeRunId : '';
          const th = typeof (details as any).threadId === 'string' ? (details as any).threadId : '';
          if (th) setThreadId(th);
          setBusy(true);
          setStreamConnecting(false);
          setActiveRunId(active);

          // best-effort: 触发 snapshot，让 CP 有机会做 stale busy reconciliation。
          // 如果 snapshot 返回不 busy，则认为是“陈旧 busy”，允许上层重试一次。
          try {
            const snap = await loadSnapshot(th || tid);
            if (snap && !snap.busy) {
              return { ok: false as const, reason: 'RETRY' as const };
            }
          } catch {
            // ignore
          }

          return { ok: false as const, reason: 'THREAD_BUSY' as const, details };
        }

        setBusy(false);
        setStreamConnecting(false);
        setActiveRunId('');
        return { ok: false as const, reason: 'ERROR' as const, error: e };
      } finally {
        if (abortRef.current === ctrl) {
          abortRef.current = null;
        }
        inflightRef.current = false;
      }
    },
    [
      applyEvent,
      client,
      loadSnapshot,
      lockedAgentId,
      state,
      stopStream,
    ],
  );

  const sendUserMessage = React.useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content) return { ok: true as const };

      const agentId = lockedAgentId || selectedAgentId;
      if (!agentId) {
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

      const res = await startRun({ agentId, threadId: tid, messages: nextMessages });
      if (!(res as any).ok && (res as any).reason === 'RETRY') {
        return startRun({ agentId, threadId: tid, messages: nextMessages });
      }
      return res;
    },
    [
      busy,
      ensureThread,
      lockedAgentId,
      messages,
      selectedAgentId,
      startRun,
      threadId,
    ],
  );

  const resumeInterrupt = React.useCallback(
    async (params: { message: string; input: Record<string, any> }) => {
      if (!interrupt) {
        return { ok: false as const, reason: 'NO_INTERRUPT' as const };
      }
      if (!threadId) {
        return { ok: false as const, reason: 'NO_THREAD' as const };
      }

      const agentId = lockedAgentId || selectedAgentId;
      if (!agentId) {
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
        agentId,
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
    [interrupt, lockedAgentId, messages, selectedAgentId, startRun, threadId],
  );

  const requestCancel = React.useCallback(async () => {
    if (!threadId || !activeRunId) {
      return { ok: true as const };
    }

    stopStream();
    await client.cancelRun(threadId, activeRunId, { skipErrorHandler: true });

    // Cancel 语义是 best-effort，UI 侧先乐观更新；最终以 snapshot/事件为准。
    setBusy(false);
    setActiveRunId('');
    return { ok: true as const };
  }, [activeRunId, client, stopStream, threadId]);

  const closeInterrupt = React.useCallback(() => {
    setInterrupt(undefined);
  }, []);

  React.useEffect(() => {
    // 锁定 agent 的 session，在 mount 时就固定。
    if (lockedAgentId) {
      setSelectedAgentIdInner(lockedAgentId);
    }
  }, [lockedAgentId]);

  return React.useMemo(
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
      plan,
      mcpEvents,
      reasoningSummary,

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

      // advanced
      stopStream,
      startRun,
    }),
    [
      activeRunId,
      applyEvent,
      busy,
      closeInterrupt,
      ensureThread,
      firstTokenReceived,
      interrupt,
      plan,
      mcpEvents,
      reasoningSummary,
      loadSnapshot,
      messages,
      requestCancel,
      reset,
      resumeInterrupt,
      selectedAgentId,
      sendUserMessage,
      setSelectedAgentId,
      snapshotLoading,
      startRun,
      state,
      stopStream,
      streamConnecting,
      threadId,
    ],
  );
}
