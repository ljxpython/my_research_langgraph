import { history } from '@umijs/max';
import { App, Button, Card, Grid, Input, Pagination, Space, Tag, Typography } from 'antd';
import React from 'react';

import { useAguiThreads } from '@/features/agui/components/xchat/useAguiThreads';
import { XChatThreadList } from '@/features/agui/components/xchat/XChatThreadList';
import { defaultControlPlaneClient } from '@/features/agui/defaultClient';
import { useAguiSession } from '@/features/agui/useAguiSession';
import { XChatPanel } from '@/features/agui/components/xchat/XChatPanel';

import type { AguiMessage, ControlPlaneThreadSnapshot, ControlPlaneThreadSummary } from '@/services/controlPlane/types';

const SQL_AGENT_ID = 'sql_agent';

function setQueryParam(search: string, key: string, value?: string): string {
  const sp = new URLSearchParams(search);
  if (!value) sp.delete(key);
  else sp.set(key, value);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

function shortThreadId(threadId: string): string {
  const v = String(threadId || '');
  if (v.length <= 12) return v;
  return `${v.slice(0, 3)}…${v.slice(-6)}`;
}

function extractThreadTitle(messages: AguiMessage[]): string {
  const firstUser = messages.find((m) => {
    const r = String(m.role || '').toLowerCase().trim();
    return (r === 'user' || r === 'human') && String(m.content || '').trim();
  });
  const fallback = messages.find((m) => String(m.content || '').trim());
  const raw = String((firstUser || fallback)?.content || '').trim();
  if (!raw) return '（空对话）';

  // Keep list item title compact.
  const firstLine = raw.split(/\r?\n/)[0] || raw;
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
}

type ThreadPreview = {
  title: string;
  messageCount: number;
};

const DbQueryHistoryPage: React.FC = () => {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();

  const threads = useAguiThreads({ agentId: SQL_AGENT_ID, limit: 100, enabled: true });

  const [filterText, setFilterText] = React.useState('');
  const [activeThreadId, setActiveThreadId] = React.useState<string>('');
  const [previews, setPreviews] = React.useState<Record<string, ThreadPreview>>({});

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const viewer = useAguiSession(defaultControlPlaneClient, { lockedAgentId: SQL_AGENT_ID });
  const viewerReset = viewer.reset;
  const viewerLoadSnapshot = viewer.loadSnapshot;

  const filteredThreads: ControlPlaneThreadSummary[] = React.useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const raw = threads.threads || [];
    if (!q) return raw;
    return raw.filter((t) => {
      const tid = String(t.threadId || '').toLowerCase();
      const title = String(previews[t.threadId]?.title || '').toLowerCase();
      return tid.includes(q) || title.includes(q);
    });
  }, [filterText, previews, threads.threads]);

  const sortedThreads: ControlPlaneThreadSummary[] = React.useMemo(() => {
    return filteredThreads
      .slice()
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [filteredThreads]);

  const total = sortedThreads.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const offset = (safePage - 1) * pageSize;
  const pagedThreads = React.useMemo(() => {
    return sortedThreads.slice(offset, offset + pageSize);
  }, [offset, pageSize, sortedThreads]);

  // Best-effort: prefetch snapshots for current page (and a small look-ahead window)
  // so list items show a human-friendly title.
  React.useEffect(() => {
    const prefetchWindow = sortedThreads.slice(offset, offset + pageSize * 2);

    let cancelled = false;
    void (async () => {
      const missing = prefetchWindow.filter((t) => !previews[t.threadId]);
      if (missing.length === 0) return;

      const next: Record<string, ThreadPreview> = {};
      await Promise.all(
        missing.map(async (t) => {
          try {
            const snap = (await defaultControlPlaneClient.getThreadSnapshot(t.threadId, {
              skipErrorHandler: true,
            })) as unknown as ControlPlaneThreadSnapshot;
            const msgs = Array.isArray(snap.messages) ? (snap.messages as AguiMessage[]) : [];
            next[t.threadId] = {
              title: extractThreadTitle(msgs),
              messageCount: msgs.length,
            };
          } catch {
            next[t.threadId] = { title: shortThreadId(t.threadId), messageCount: 0 };
          }
        }),
      );
      if (cancelled) return;
      setPreviews((prev) => ({ ...prev, ...next }));
    })();

    return () => {
      cancelled = true;
    };
  }, [offset, pageSize, previews, sortedThreads]);

  // When selecting a thread, show a read-only detail panel by loading its snapshot.
  const selectThread = React.useCallback(
    async (tid: string) => {
      const next = String(tid || '').trim();
      if (!next) return;
      setActiveThreadId(next);
      try {
        const snap = await viewerLoadSnapshot(next);
        const msgs = Array.isArray((snap as any)?.messages) ? ((snap as any).messages as AguiMessage[]) : [];
        setPreviews((prev) => {
          if (prev[next]) return prev;
          return { ...prev, [next]: { title: extractThreadTitle(msgs), messageCount: msgs.length } };
        });
      } catch (e) {
        console.log(e);
        message.error('Failed to load snapshot');
      }
    },
    [message, viewerLoadSnapshot],
  );

  const jumpToAi = React.useCallback(
    async (tid: string) => {
      const next = String(tid || '').trim();
      if (!next) return;

      // Ensure snapshot is loadable before navigating; otherwise users end up in a "new" chat.
      try {
        await defaultControlPlaneClient.getThreadSnapshot(next, { skipErrorHandler: true });
      } catch (e) {
        console.log(e);
        message.error('This thread cannot be restored (snapshot failed)');
        return;
      }

      history.push({
        pathname: '/db-query/ai',
        search: setQueryParam('', 'threadId', next),
      });
    },
    [message],
  );

  const isWide = !!screens.lg;

  // When filter changes, reset to the first page and clear selection.
  React.useEffect(() => {
    setPage(1);
    setActiveThreadId('');
    viewerReset();
  }, [filterText, viewerReset]);

  // When user changes page, clear selection so the detail panel matches current page.
  const onPageChange = React.useCallback(
    (nextPage: number, nextSize?: number) => {
      setPage(nextPage);
      if (typeof nextSize === 'number' && nextSize > 0) {
        setPageSize(nextSize);
      }
      setActiveThreadId('');
      viewerReset();
    },
    [viewerReset],
  );

  // Auto-select the most recent thread so users can immediately see details.
  React.useEffect(() => {
    if (threads.loading) return;
    if (activeThreadId) return;
    if (!pagedThreads.length) return;
    void selectThread(pagedThreads[0].threadId);
  }, [activeThreadId, pagedThreads, selectThread, threads.loading]);

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexDirection: isWide ? 'row' : 'column' }}>
      <Card
        title="历史对话"
        style={{ flex: 1, minHeight: 520 }}
        extra={
          <Space size={8} wrap>
            <Button
              size="small"
              onClick={() => {
                if (activeThreadId) {
                  void jumpToAi(activeThreadId);
                  return;
                }
                history.push('/db-query/ai');
              }}
            >
              {activeThreadId ? '继续对话' : '去 AI 查询'}
            </Button>
          </Space>
        }
      >
        <Space orientation="vertical" style={{ width: '100%' }} size={12}>
          <Typography.Text type="secondary">
            列表展示每个 thread 的「首条用户消息」作为标题；选择 thread 可在右侧预览详情，并可继续对话。
          </Typography.Text>

          <Input
            allowClear
            placeholder="搜索：首条用户消息 / threadId"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />

          <XChatThreadList
            title="Threads"
            threads={pagedThreads}
            loading={threads.loading}
            activeKey={activeThreadId || undefined}
            onRefresh={() => threads.refresh()}
            onRestoreThread={async (tid) => {
              await selectThread(tid);
            }}
            onActiveChange={(tid) => {
              void selectThread(tid);
            }}
            sortThreads={false}
            getThreadLabel={(t) => {
              const p = previews[t.threadId];
              const title = p?.title || shortThreadId(t.threadId);
              const count = p?.messageCount;
              const updatedAt = typeof t.updatedAt === 'number' ? t.updatedAt : 0;
              const timeText = updatedAt ? new Date(updatedAt).toLocaleString() : '';
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Space size={8} wrap>
                    {t.busy ? <Tag color="processing">Busy</Tag> : <Tag>Idle</Tag>}
                    <Typography.Text style={{ fontSize: 13 }}>{title}</Typography.Text>
                  </Space>
                  <Space size={8} wrap>
                    {typeof count === 'number' ? (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {count} msgs
                      </Typography.Text>
                    ) : null}
                    {timeText ? (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {timeText}
                      </Typography.Text>
                    ) : null}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {shortThreadId(t.threadId)}
                    </Typography.Text>
                  </Space>
                </div>
              );
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Pagination
              size="small"
              current={safePage}
              pageSize={pageSize}
              total={total}
              showSizeChanger
              showQuickJumper
              pageSizeOptions={[10, 20, 50]}
              onChange={onPageChange}
              showTotal={(t) => `共 ${t} 条`}
            />
          </div>
        </Space>
      </Card>

      <Card
        title="对话详情"
        style={{ flex: 2, minHeight: 520 }}
        extra={
          <Space size={8} wrap>
            {activeThreadId ? (
              <Button size="small" type="primary" onClick={() => void jumpToAi(activeThreadId)}>
                继续对话
              </Button>
            ) : null}
          </Space>
        }
      >
        {activeThreadId ? (
          <XChatPanel title={undefined} session={viewer} readonly height={isWide ? 620 : 520} />
        ) : (
          <Typography.Text type="secondary">从左侧选择一个 thread 以预览历史消息</Typography.Text>
        )}
      </Card>
    </div>
  );
};

export default DbQueryHistoryPage;
