import type { ProDescriptionsItemProps } from '@ant-design/pro-components';
import { PageContainer, ProCard, ProDescriptions } from '@ant-design/pro-components';
import { history, useParams } from '@umijs/max';
import { Alert, App, Button, Divider, Space, Spin, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  cancelRun,
  getRun,
  listRunArtifacts,
  listRunEvents,
} from '@/services/platform/runs';
import {
  formatPlatformError,
  parsePlatformError,
} from '@/services/platform/request';
import type { PlatformArtifact, PlatformRun, PlatformRunEvent } from '@/services/platform/types';

function isTerminalRunStatus(status: string): boolean {
  return ['succeeded', 'failed', 'canceled'].includes(status);
}

function statusTag(status: string): React.ReactNode {
  if (status === 'running') return <Tag color="processing">running</Tag>;
  if (status === 'succeeded') return <Tag color="success">succeeded</Tag>;
  if (status === 'failed') return <Tag color="error">failed</Tag>;
  if (status === 'canceled') return <Tag color="default">canceled</Tag>;
  if (status === 'queued') return <Tag color="default">queued</Tag>;
  return <Tag>{status}</Tag>;
}

type PollingState = {
  running: boolean;
  backoffMs: number;
  lastRateLimitedAt?: number;
  lastError?: string;
};

const NORMAL_POLL_MS = 2000;
const MAX_POLL_MS = 15000;
const RECOVERY_SUCCESS_STREAK = 3;

const RunDetailPage: React.FC = () => {
  const { message } = App.useApp();
  const params = useParams();
  const runId = (params as { runId?: string }).runId;

  const [run, setRun] = useState<PlatformRun | undefined>(undefined);
  const [runLoading, setRunLoading] = useState<boolean>(true);

  const [events, setEvents] = useState<PlatformRunEvent[]>([]);
  const [polling, setPolling] = useState<PollingState>({
    running: false,
    backoffMs: NORMAL_POLL_MS,
  });

  const [artifacts, setArtifacts] = useState<PlatformArtifact[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState<boolean>(false);

  const cursorRef = useRef<string>('');
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const successStreakRef = useRef<number>(0);
  const backoffMsRef = useRef<number>(NORMAL_POLL_MS);
  const timerRef = useRef<number | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);

  const terminal = useMemo(() => {
    return run?.status ? isTerminalRunStatus(run.status) : false;
  }, [run?.status]);

  // -------------------- Run detail polling --------------------
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      setRunLoading(true);
      try {
        const data = await getRun(runId);
        if (cancelled) return;
        setRun(data);

        // terminal 后不再刷 run 状态
        if (!cancelled && !isTerminalRunStatus(data.status)) {
          timer = window.setTimeout(tick, 5000);
        }
      } catch (err) {
        if (!cancelled) message.error(formatPlatformError(err));
      } finally {
        if (!cancelled) setRunLoading(false);
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // -------------------- Artifacts --------------------
  const refreshArtifacts = async () => {
    if (!runId) return;
    setArtifactsLoading(true);
    try {
      const data = await listRunArtifacts(runId);
      setArtifacts(data);
    } catch (err) {
      message.error(formatPlatformError(err));
    } finally {
      setArtifactsLoading(false);
    }
  };

  // -------------------- RunEvents polling（cursor + 429 backoff） --------------------
  const scheduleNextPoll = (delayMs: number) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void pollOnce();
    }, delayMs);
  };

  const computeJitteredNormalDelay = () => {
    const jitter = Math.floor(Math.random() * 200);
    return NORMAL_POLL_MS + jitter;
  };

  const apply429Backoff = (retryAfterSeconds?: number) => {
    const retryAfterMs = (retryAfterSeconds ?? 0) * 1000;
    const base = Math.max(NORMAL_POLL_MS, retryAfterMs);
    const doubled = Math.max(base, backoffMsRef.current * 2);
    const next = Math.min(MAX_POLL_MS, doubled);

    backoffMsRef.current = next;
    successStreakRef.current = 0;
    setPolling((s) => ({
      ...s,
      backoffMs: next,
      lastRateLimitedAt: Date.now(),
      lastError: undefined,
    }));
    scheduleNextPoll(next);
  };

  const onSuccess = (nextCursor: string) => {
    const nextStreak = successStreakRef.current + 1;
    successStreakRef.current = nextStreak;

    // 连续成功后逐步恢复到 2s
    setPolling((s) => {
      let nextBackoff = s.backoffMs;
      if (nextBackoff <= NORMAL_POLL_MS) {
        nextBackoff = NORMAL_POLL_MS;
      } else if (nextStreak >= RECOVERY_SUCCESS_STREAK) {
        nextBackoff = Math.max(NORMAL_POLL_MS, Math.floor(nextBackoff / 2));
      }
      backoffMsRef.current = nextBackoff;
      return { ...s, backoffMs: nextBackoff, lastError: undefined };
    });

    cursorRef.current = nextCursor;

    if (terminal) {
      setPolling((s) => ({ ...s, running: false }));
      return;
    }

    // 正常轮询 2s + jitter
    scheduleNextPoll(computeJitteredNormalDelay());
  };

  const pollOnce = async () => {
    if (!runId) return;
    if (terminal) {
      setPolling((s) => ({ ...s, running: false }));
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const page = await listRunEvents(
        runId,
        {
          cursor: cursorRef.current || undefined,
          limit: 200,
        },
        { signal: abortRef.current.signal },
      );

      const incoming = page.events ?? [];
      if (incoming.length > 0) {
        setEvents((prev) => {
          const next: PlatformRunEvent[] = [...prev];
          for (const evt of incoming) {
            if (seenEventIdsRef.current.has(evt.event_id)) continue;
            seenEventIdsRef.current.add(evt.event_id);
            next.push(evt);
          }
          // 事件量大时避免 UI 卡死：只保留最近 2000 条
          if (next.length > 2000) {
            const sliced = next.slice(-2000);
            // 清理 seen 集合：避免无限增长
            seenEventIdsRef.current = new Set(sliced.map((e) => e.event_id));
            return sliced;
          }
          return next;
        });
      }

      onSuccess(page.nextCursor ?? cursorRef.current);
    } catch (err) {
      const parsed = parsePlatformError(err);
      if (parsed?.status === 429) {
        // 轮询限流不弹 toast（避免刷屏），在页面内展示状态。
        apply429Backoff(parsed.retryAfterSeconds);
        return;
      }

      // 其他错误：提示一次并降低频率
      const text = formatPlatformError(err);
      setPolling((s) => ({ ...s, lastError: text }));
      message.error(text);
      successStreakRef.current = 0;
      scheduleNextPoll(Math.min(MAX_POLL_MS, 5000));
    }
  };

  const startPolling = () => {
    if (!runId) return;
    setPolling((s) => ({ ...s, running: true }));
    void pollOnce();
  };

  const stopPolling = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    abortRef.current?.abort();
    abortRef.current = undefined;
    setPolling((s) => ({ ...s, running: false }));
  };

  useEffect(() => {
    // runId 变化时重置事件状态
    setEvents([]);
    cursorRef.current = '';
    seenEventIdsRef.current = new Set();
    successStreakRef.current = 0;
    backoffMsRef.current = NORMAL_POLL_MS;
    stopPolling();
    if (runId) startPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => {
    // terminal 后停止轮询
    if (terminal) {
      stopPolling();
      void refreshArtifacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal]);

  const descriptionItems: ProDescriptionsItemProps<PlatformRun>[] = [
    {
      title: 'Run ID',
      dataIndex: 'run_id',
      copyable: true,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (_, r) => statusTag(r.status),
    },
    {
      title: 'Project',
      dataIndex: 'project_id',
      copyable: true,
    },
    {
      title: 'Environment',
      dataIndex: 'environment_id',
      copyable: true,
    },
    {
      title: 'Runner',
      dataIndex: 'runner',
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      valueType: 'dateTime',
    },
    {
      title: 'Client Run ID',
      dataIndex: 'client_run_id',
      copyable: true,
    },
  ];

  if (!runId) {
    return (
      <PageContainer>
        <Alert showIcon type="error" message="Missing runId" />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      onBack={() => history.push('/platform/runs')}
      title={
        <Space size={10}>
          <Typography.Text>Run</Typography.Text>
          <Typography.Text type="secondary" ellipsis style={{ maxWidth: 520 }}>
            {runId}
          </Typography.Text>
          {run?.status ? statusTag(run.status) : null}
        </Space>
      }
      extra={
        <Space>
          <Button
            onClick={() => {
              void refreshArtifacts();
            }}
          >
            Refresh Artifacts
          </Button>
          <Button
            danger
            disabled={terminal}
            onClick={async () => {
              try {
                await cancelRun(runId);
                message.success('Cancel requested');
              } catch (err) {
                message.error(formatPlatformError(err));
              }
            }}
          >
            Cancel
          </Button>
          <Button
            type={polling.running ? 'default' : 'primary'}
            onClick={() => {
              if (polling.running) stopPolling();
              else startPolling();
            }}
          >
            {polling.running ? 'Stop Polling' : 'Start Polling'}
          </Button>
        </Space>
      }
    >
      {polling.lastRateLimitedAt ? (
        <Alert
          showIcon
          type="warning"
          message={`RunEvents 已触发限流（HTTP 429），正在退避：${Math.round(
            polling.backoffMs / 1000,
          )}s`}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {polling.lastError ? (
        <Alert
          showIcon
          type="error"
          message="RunEvents 轮询失败"
          description={polling.lastError}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <ProCard split="horizontal" bordered>
        <ProCard>
          {runLoading ? (
            <Spin />
          ) : (
            <ProDescriptions<PlatformRun>
              column={2}
              dataSource={run}
              columns={descriptionItems}
            />
          )}
        </ProCard>
        <ProCard split="vertical" bordered>
          <ProCard title={`Events (${events.length})`} colSpan="70%" bordered>
            <div style={{ maxHeight: 520, overflow: 'auto' }}>
              {events.length === 0 ? (
                <Typography.Text type="secondary">No events yet.</Typography.Text>
              ) : (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  {events.map((evt) => {
                    const ts = dayjs(evt.ts).format('HH:mm:ss');
                    return (
                      <div
                        key={evt.event_id}
                        style={{
                          display: 'flex',
                          gap: 12,
                          alignItems: 'baseline',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}
                      >
                        <Typography.Text type="secondary" style={{ width: 72 }}>
                          {ts}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ width: 66 }}>
                          #{evt.seq}
                        </Typography.Text>
                        <Typography.Text style={{ width: 160 }}>
                          {evt.type}
                        </Typography.Text>
                        <Typography.Text
                          style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                        >
                          {evt.type === 'log.append'
                            ? (evt.payload?.message as string | undefined) ??
                              JSON.stringify(evt.payload)
                            : JSON.stringify(evt.payload)}
                        </Typography.Text>
                      </div>
                    );
                  })}
                </Space>
              )}
            </div>
          </ProCard>
          <ProCard title={`Artifacts (${artifacts.length})`} bordered>
            <div style={{ minHeight: 120 }}>
              {artifactsLoading ? <Spin /> : null}
              {!artifactsLoading && artifacts.length === 0 ? (
                <Typography.Text type="secondary">No artifacts.</Typography.Text>
              ) : null}
              {!artifactsLoading && artifacts.length > 0 ? (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  {artifacts.map((a) => {
                    return (
                      <div key={a.artifact_id}>
                        <Typography.Text strong>{a.filename}</Typography.Text>
                        <Divider type="vertical" />
                        <Typography.Text type="secondary">{a.kind}</Typography.Text>
                        <Divider type="vertical" />
                        <Typography.Text type="secondary" copyable>
                          {a.artifact_id}
                        </Typography.Text>
                      </div>
                    );
                  })}
                </Space>
              ) : null}
            </div>
          </ProCard>
        </ProCard>
      </ProCard>
    </PageContainer>
  );
};

export default RunDetailPage;
