'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { parseAsBoolean, useQueryState } from 'nuqs';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { ChevronDown, Plus, RefreshCw, SquarePen, X } from 'lucide-react';

import type {
  AguiMessage,
  AguiState,
  ControlPlaneThreadSummary,
  RunAgentInput,
} from '@/types/agui';
import { ControlPlaneClient } from '@/lib/agui-client';
import { clearStoredToken, getStoredControlPlaneUrl, getStoredToken, setStoredControlPlaneUrl, setStoredToken } from '@/lib/storage';
import { newMessageId } from '@/lib/ids';
import { Markdown } from '@/components/markdown';

const DEFAULT_CP_URL = 'http://127.0.0.1:8000';

function emptyState(): AguiState {
  return { ui: {}, app: {}, debug: {} };
}

function coerceState(s: unknown): AguiState {
  const x = s as any;
  const ui = x?.ui && typeof x.ui === 'object' ? x.ui : {};
  const app = x?.app && typeof x.app === 'object' ? x.app : {};
  const debug = x?.debug && typeof x.debug === 'object' ? x.debug : {};
  return { ui, app, debug };
}

function roleBadge(role: string): { label: string; className: string } {
  switch (role) {
    case 'user':
      return { label: 'USER', className: 'bg-blue-100 text-blue-800' };
    case 'assistant':
      return { label: 'ASSISTANT', className: 'bg-emerald-100 text-emerald-800' };
    case 'tool':
      return { label: 'TOOL', className: 'bg-amber-100 text-amber-800' };
    default:
      return { label: role.toUpperCase(), className: 'bg-gray-100 text-gray-800' };
  }
}

function formatError(e: unknown): string {
  const x = e as any;
  const msg = x?.payload?.detail?.message || x?.payload?.detail?.code || x?.message || String(e);
  return msg;
}

function ScrollToBottomButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <button
      className="absolute bottom-20 right-6 rounded-full border bg-white/90 px-3 py-2 text-sm shadow hover:bg-white"
      onClick={() => scrollToBottom()}
      type="button"
    >
      Scroll to bottom
    </button>
  );
}

export function DemoApp() {
  const [cpUrlParam, setCpUrlParam] = useQueryState('cpUrl');
  const [agentId, setAgentId] = useQueryState('agentId');
  const [threadId, setThreadId] = useQueryState('threadId');
  const [chatHistoryOpen, setChatHistoryOpen] = useQueryState(
    'chatHistoryOpen',
    parseAsBoolean.withDefault(true),
  );

  const [cpUrl, setCpUrl] = useState<string>('');
  const [token, setToken] = useState<string>('');

  const [agents, setAgents] = useState<Array<{ agentId: string; displayName: string; status: string }>>([]);
  const [threads, setThreads] = useState<ControlPlaneThreadSummary[]>([]);

  const [messages, setMessages] = useState<AguiMessage[]>([]);
  const [state, setState] = useState<AguiState>(emptyState());

  const [busy, setBusy] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string>('');
  const [connecting, setConnecting] = useState(false);
  const [firstEventReceived, setFirstEventReceived] = useState(false);

  const [input, setInput] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const lastErrorRef = useRef<string>('');

  const client = useMemo(() => {
    if (!cpUrl || !token) return null;
    return new ControlPlaneClient({ baseUrl: cpUrl, token });
  }, [cpUrl, token]);

  // Bootstrap persisted config.
  useEffect(() => {
    const storedUrl = getStoredControlPlaneUrl();
    const storedToken = getStoredToken();
    const url = cpUrlParam || storedUrl || DEFAULT_CP_URL;
    setCpUrl(url);
    if (!cpUrlParam) setCpUrlParam(url);
    if (storedToken) setToken(storedToken);
  }, [cpUrlParam, setCpUrlParam]);

  const onDisconnect = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearStoredToken();
    setToken('');
    setAgents([]);
    setThreads([]);
    setMessages([]);
    setState(emptyState());
    setBusy(false);
    setActiveRunId('');
  };

  const refreshAgents = useCallback(async () => {
    if (!client) return;
    const list = await client.listAgents();
    setAgents(list.filter((a) => a.status === 'active'));
  }, [client]);

  const refreshThreads = useCallback(async () => {
    if (!client) return;
    const list = await client.listThreads({ agentId: agentId || undefined, limit: 100 });
    setThreads(list);
  }, [agentId, client]);

  const loadSnapshot = useCallback(
    async (tid: string) => {
      if (!client) return null;
      try {
        const snap = await client.getSnapshot(tid);
        setMessages(Array.isArray(snap.messages) ? snap.messages : []);
        setState(coerceState(snap.state));
        setBusy(!!snap.busy);
        setActiveRunId(snap.activeRunId || '');
        return snap;
      } catch (e: unknown) {
        const err = e as any;
        if (err?.status === 404) {
          // Strict behavior: EP thread missing => 404.
          toast.error('Thread not found in execution plane', {
            description:
              'Execution Plane may have restarted (langgraph dev is in-memory). Create a new thread.',
          });
          setMessages([]);
          setState(emptyState());
          setBusy(false);
          setActiveRunId('');
          return null;
        }
        throw e;
      }
    },
    [client],
  );

  // When agent changes, clear thread state (like a new session).
  useEffect(() => {
    if (!agentId) return;
    setThreadId(null);
    setMessages([]);
    setState(emptyState());
    setBusy(false);
    setActiveRunId('');
  }, [agentId, setThreadId]);

  // Load snapshot when threadId changes.
  useEffect(() => {
    if (!client) return;
    if (!threadId) return;
    loadSnapshot(threadId).catch((e) => {
      toast.error('Failed to load snapshot', { description: formatError(e) });
    });
  }, [client, loadSnapshot, threadId]);

  useEffect(() => {
    if (!client) return;
    refreshAgents().catch((e) => toast.error('Failed to list agents', { description: formatError(e) }));
  }, [client, refreshAgents]);

  useEffect(() => {
    if (!client) return;
    refreshThreads().catch((e) => toast.error('Failed to list threads', { description: formatError(e) }));
  }, [client, refreshThreads]);

  const onNewThread = async () => {
    if (!client) return;
    if (!agentId) {
      toast.error('Select an agent first');
      return;
    }
    const tid = await client.createThread({ agentId });
    setThreadId(tid);
    await refreshThreads();
  };

  const onSend = async () => {
    if (!client) return;
    const content = input.trim();
    if (!content) return;
    if (!agentId) {
      toast.error('Select an agent first');
      return;
    }

    let tid = threadId;
    if (!tid) {
      tid = await client.createThread({ agentId });
      setThreadId(tid);
      await refreshThreads();
    }

    if (busy || connecting) {
      toast.warning('Thread is busy', {
        description: activeRunId ? `activeRunId=${activeRunId}` : undefined,
      });
      return;
    }

    const newUserMsg: AguiMessage = { id: newMessageId(), role: 'user', content };
    const nextMessages = [...messages, newUserMsg];
    setMessages(nextMessages);
    setInput('');

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setConnecting(true);
    setFirstEventReceived(false);

    const runInput: RunAgentInput = {
      thread_id: tid,
      messages: nextMessages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
      state,
      context: [],
      forwarded_props: {},
    };

    try {
      await client.streamRun({
        agentId,
        input: runInput,
        signal: ctrl.signal,
        onEvent: (evt: any) => {
          if (!firstEventReceived) setFirstEventReceived(true);
          const t = String(evt?.type || '');
          if (t === 'RUN_STARTED') {
            setBusy(true);
            setConnecting(false);
            if (typeof evt.runId === 'string') setActiveRunId(evt.runId);
            return;
          }
          if (t === 'RUN_FINISHED') {
            setBusy(false);
            setConnecting(false);
            setActiveRunId('');
            refreshThreads().catch(() => undefined);
            return;
          }
          if (t === 'RUN_ERROR') {
            setBusy(false);
            setConnecting(false);
            setActiveRunId('');
            const msg = typeof evt.message === 'string' ? evt.message : 'RUN_ERROR';
            if (msg && msg !== lastErrorRef.current) {
              lastErrorRef.current = msg;
              toast.error('Run error', { description: msg });
            }
            return;
          }
          if (t === 'MESSAGES_SNAPSHOT') {
            if (Array.isArray(evt.messages)) {
              setMessages(evt.messages as AguiMessage[]);
            }
            setConnecting(false);
            return;
          }
          if (t === 'STATE_SNAPSHOT') {
            setState(coerceState(evt.snapshot));
            setConnecting(false);
            return;
          }
        },
      });
    } catch (e: unknown) {
      setConnecting(false);
      const x = e as any;
      if (x?.status === 409) {
        const details = x?.payload?.detail?.details || {};
        const active = typeof details.activeRunId === 'string' ? details.activeRunId : '';
        setBusy(true);
        setActiveRunId(active);
        toast.warning('THREAD_BUSY', { description: active ? `activeRunId=${active}` : undefined });
        return;
      }
      toast.error('Failed to start run', { description: formatError(e) });
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  };

  const onCancel = async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (!client) return;
    if (!threadId || !activeRunId) return;
    try {
      await client.cancelRun({ threadId, runId: activeRunId });
      setBusy(false);
      setActiveRunId('');
      await refreshThreads();
      toast.success('Cancel requested');
    } catch (e) {
      toast.error('Cancel failed', { description: formatError(e) });
    }
  };

  // ==================== Setup screen ====================

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-2xl rounded-lg border bg-white p-6 shadow">
          <div className="mb-4">
            <h1 className="text-xl font-semibold">AG-UI Chat (Demo)</h1>
            <p className="text-sm text-gray-600">
              Connect to your Control Plane (AG-UI). This UI is a demo tool for testing any registered agent.
            </p>
          </div>

          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const url = String(fd.get('cpUrl') || '').trim();
              const username = String(fd.get('username') || '').trim();
              const password = String(fd.get('password') || '').trim();
              const pasted = String(fd.get('token') || '').trim();

              if (!url) {
                toast.error('Missing Control Plane URL');
                return;
              }
              setStoredControlPlaneUrl(url);
              setCpUrl(url);
              setCpUrlParam(url);

              if (pasted) {
                setStoredToken(pasted);
                setToken(pasted);
                return;
              }

              if (!username || !password) {
                toast.error('Provide username/password or paste a token');
                return;
              }

              try {
                const tmp = new ControlPlaneClient({ baseUrl: url, token: '' });
                const t = await tmp.login({ username, password });
                setStoredToken(t);
                setToken(t);
              } catch (err: any) {
                toast.error('Login failed', { description: formatError(err) });
              }
            }}
          >
            <div>
              <label htmlFor="cpUrl" className="text-sm font-medium">
                Control Plane URL
              </label>
              <input
                id="cpUrl"
                name="cpUrl"
                className="mt-1 w-full rounded-md border px-3 py-2"
                defaultValue={cpUrlParam || cpUrl || DEFAULT_CP_URL}
                placeholder="http://127.0.0.1:8000"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                If you run this UI on http://127.0.0.1:3002, start CP with:
                <code className="ml-1 rounded bg-gray-100 px-1">CORS_ALLOW_ORIGINS=http://127.0.0.1:3002</code>
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="username" className="text-sm font-medium">
                  Username
                </label>
                <input id="username" name="username" className="mt-1 w-full rounded-md border px-3 py-2" />
              </div>
              <div>
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className="mt-1 w-full rounded-md border px-3 py-2"
                />
              </div>
            </div>

            <div>
              <label htmlFor="token" className="text-sm font-medium">
                Or paste token
              </label>
              <textarea
                id="token"
                name="token"
                className="mt-1 w-full rounded-md border px-3 py-2"
                rows={2}
                placeholder="Bearer token (JWT)"
              />
            </div>

            <button type="submit" className="w-full rounded-md bg-black px-4 py-2 text-white">
              Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==================== Main layout ====================

  return (
    <div className="flex h-screen w-full">
      {/* Sidebar */}
      <div className={`hidden h-full w-[320px] flex-col border-r lg:flex ${chatHistoryOpen ? '' : 'w-[56px]'}`}>
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <button
            className="rounded-md border px-2 py-1 text-xs"
            onClick={() => setChatHistoryOpen((v) => !v)}
            type="button"
          >
            {chatHistoryOpen ? 'Hide' : 'Show'}
          </button>
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border p-2"
              onClick={() => refreshThreads().catch((e) => toast.error('Refresh failed', { description: formatError(e) }))}
              type="button"
              title="Refresh threads"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button className="rounded-md border p-2" onClick={onNewThread} type="button" title="New thread">
              <SquarePen className="h-4 w-4" />
            </button>
          </div>
        </div>

        {chatHistoryOpen ? (
          <div className="flex flex-col gap-3 p-3">
            <div>
              <div className="mb-1 text-xs font-medium text-gray-600">Agent</div>
              <div className="relative">
                <select
                  className="w-full appearance-none rounded-md border bg-white px-3 py-2 pr-8 text-sm"
                  value={agentId || ''}
                  onChange={(e) => setAgentId(e.target.value || null)}
                >
                  <option value="">Select agent...</option>
                  {agents.map((a) => (
                    <option key={a.agentId} value={a.agentId}>
                      {a.displayName || a.agentId}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-3 h-4 w-4 text-gray-500" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-gray-600">Threads</div>
              <button className="rounded-md border px-2 py-1 text-xs" onClick={onNewThread} type="button">
                <Plus className="mr-1 inline-block h-3 w-3" />
                New
              </button>
            </div>

            <div className="h-[calc(100vh-220px)] overflow-y-auto">
              {threads.length === 0 ? (
                <div className="text-sm text-gray-500">No threads</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {threads.map((t) => (
                    <button
                      key={t.threadId}
                      className={`w-full rounded-md px-2 py-2 text-left text-sm hover:bg-gray-100 ${
                        t.threadId === threadId ? 'bg-gray-100' : ''
                      }`}
                      onClick={() => setThreadId(t.threadId)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs">{t.threadId}</span>
                        {t.busy ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">busy</span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t pt-3">
              <button
                className="w-full rounded-md border px-3 py-2 text-sm"
                onClick={onDisconnect}
                type="button"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Main */}
      <div className="relative flex h-full min-h-0 flex-1 flex-col">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">Agent:</span> {agentId || '-'}
              <span className="ml-4 font-medium">Thread:</span> {threadId || '-'}
            </div>
            <div className="flex items-center gap-2">
              {connecting ? (
                <span className="rounded bg-gray-100 px-2 py-1 text-xs">connecting</span>
              ) : null}
              {busy ? <span className="rounded bg-amber-100 px-2 py-1 text-xs">busy</span> : null}
              {activeRunId ? <span className="font-mono text-xs text-gray-500">run={activeRunId}</span> : null}
              <button
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => {
                  if (!threadId) return;
                  loadSnapshot(threadId)
                    .then(() => toast.success('Snapshot refreshed'))
                    .catch((e) => toast.error('Snapshot failed', { description: formatError(e) }));
                }}
                type="button"
                disabled={!threadId}
              >
                Refresh
              </button>
              <button
                className="rounded-md border px-3 py-2 text-sm"
                onClick={onCancel}
                type="button"
                disabled={!threadId || !activeRunId}
              >
                Stop
              </button>
            </div>
          </div>

          {busy && !connecting && !firstEventReceived ? (
            <div className="mt-2 rounded-md border bg-amber-50 p-2 text-sm">
              Thread is busy (server-side continue). You can refresh snapshot or cancel.
            </div>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Chat */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            <StickToBottom
              className="relative flex min-h-0 flex-1 w-full overflow-y-auto"
              resize="smooth"
              initial="smooth"
            >
              <div className="h-full w-full">
                <div className="mx-auto flex h-full min-h-0 max-w-3xl flex-col px-4 py-4">
                  <div className="flex-1 min-h-0">
                    {connecting && !firstEventReceived ? (
                      <div className="mb-4 text-sm text-gray-500">Assistant is thinking...</div>
                    ) : null}

                    {messages.length === 0 ? (
                      <div className="text-sm text-gray-500">Start by creating a new thread and sending a message.</div>
                    ) : (
                      <div className="space-y-4">
                        {messages.map((m) => {
                          const badge = roleBadge(m.role);
                          return (
                            <div key={m.id} className="rounded-lg border bg-white p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>
                                  {badge.label}
                                </span>
                                <span className="font-mono text-[10px] text-gray-400">{m.id}</span>
                              </div>
                              {m.role === 'assistant' ? (
                                <Markdown text={m.content} />
                              ) : (
                                <pre className="whitespace-pre-wrap text-sm">{m.content}</pre>
                              )}

                              {Array.isArray(m.toolCalls) && m.toolCalls.length > 0 ? (
                                <details className="mt-3 rounded-md border bg-gray-50 p-2">
                                  <summary className="cursor-pointer text-xs font-medium text-gray-700">
                                    Tool calls ({m.toolCalls.length})
                                  </summary>
                                  <div className="mt-2 space-y-2">
                                    {m.toolCalls.map((tc) => (
                                      <div key={tc.id} className="rounded border bg-white p-2">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-semibold">{tc.function.name}</span>
                                          <span className="font-mono text-[10px] text-gray-400">{tc.id}</span>
                                        </div>
                                        <pre className="mt-2 overflow-x-auto text-xs">{tc.function.arguments}</pre>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <ScrollToBottomButton />
            </StickToBottom>

            {/* Composer */}
            <div className="shrink-0 border-t bg-white p-4">
              <div className="mx-auto flex max-w-3xl items-end gap-2">
                <textarea
                  className="flex-1 resize-none rounded-md border px-3 py-2 text-sm"
                  rows={2}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    !agentId
                      ? 'Select an agent to send...'
                      : busy
                        ? 'Thread is busy (you can still type)...'
                        : connecting
                          ? 'Connecting (you can still type)...'
                          : 'Message'
                  }
                />
                <button
                  className={`rounded-md bg-black px-4 py-2 text-sm text-white ${
                    !agentId || connecting || busy ? 'opacity-60' : ''
                  }`}
                  onClick={onSend}
                  type="button"
                  title={
                    !agentId
                      ? 'Select an agent first'
                      : connecting
                        ? 'Connecting...'
                        : busy
                          ? 'Thread is busy'
                          : 'Send'
                  }
                >
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* Inspector */}
          <div className="hidden h-full w-[420px] shrink-0 border-l bg-white xl:flex xl:flex-col">
            <div className="flex items-center justify-between border-b p-3">
              <div className="text-sm font-medium">Inspector</div>
              <button
                className="rounded border p-2"
                onClick={() => {
                  setState(emptyState());
                  toast.success('Local inspector state cleared');
                }}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="mb-2 text-xs font-medium text-gray-600">state.ui</div>
              <pre className="mb-4 overflow-x-auto rounded border bg-gray-50 p-2 text-xs">
                {JSON.stringify(state.ui || {}, null, 2)}
              </pre>
              <div className="mb-2 text-xs font-medium text-gray-600">state.app</div>
              <pre className="mb-4 overflow-x-auto rounded border bg-gray-50 p-2 text-xs">
                {JSON.stringify(state.app || {}, null, 2)}
              </pre>
              <div className="mb-2 text-xs font-medium text-gray-600">state.debug</div>
              <pre className="overflow-x-auto rounded border bg-gray-50 p-2 text-xs">
                {JSON.stringify(state.debug || {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
