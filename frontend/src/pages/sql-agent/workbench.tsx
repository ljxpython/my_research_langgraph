import { PageContainer } from '@ant-design/pro-components';
import { history, useLocation } from '@umijs/max';
import {
  App,
  Button,
  Card,
  Drawer,
  Grid,
  List,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import React, { useEffect, useMemo, useState } from 'react';

import { InspectorPane } from '@/features/agui/components/InspectorPane';
import { McpPane } from '@/features/agui/components/McpPane';
import { PlanPane } from '@/features/agui/components/PlanPane';
import { ReasoningPane } from '@/features/agui/components/ReasoningPane';
import { confirmBusySwitch } from '@/features/agui/components/xchat/confirmBusySwitch';
import { XChatPanel } from '@/features/agui/components/xchat/XChatPanel';
import { defaultControlPlaneClient } from '@/features/agui/defaultClient';
import { useAguiSession } from '@/features/agui/useAguiSession';

import type { AguiMessage } from '@/services/controlPlane/types';

const SQL_AGENT_ID = 'sql_agent';

function getQueryParam(search: string, key: string): string | undefined {
  const sp = new URLSearchParams(search);
  const v = sp.get(key);
  return v || undefined;
}

function setQueryParam(search: string, key: string, value?: string): string {
  const sp = new URLSearchParams(search);
  if (!value) sp.delete(key);
  else sp.set(key, value);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

function parseToolArgs(argText: string): any {
  try {
    return JSON.parse(argText);
  } catch {
    return undefined;
  }
}

function extractSqlQueries(
  messages: AguiMessage[],
): Array<{ id: string; name: string; sql: string }> {
  const out: Array<{ id: string; name: string; sql: string }> = [];
  for (const m of messages) {
    const toolCalls = Array.isArray((m as any).toolCalls)
      ? (m as any).toolCalls
      : [];
    for (const tc of toolCalls) {
      const name = String(tc?.function?.name || 'tool');
      const argsText = String(tc?.function?.arguments || '{}');
      const parsed = parseToolArgs(argsText) as any;
      const candidates: string[] = [];
      if (parsed && typeof parsed === 'object') {
        for (const k of ['query', 'sql', 'statement', 'command']) {
          const v = parsed[k];
          if (typeof v === 'string' && v.trim()) candidates.push(v.trim());
        }
      }
      if (candidates.length === 0) continue;
      // Heuristic: keep only things that look like SQL.
      const sql =
        candidates.find((s) => /\bselect\b|\bwith\b|\bpragma\b/i.test(s)) ||
        candidates[0];
      out.push({ id: String(tc?.id || ''), name, sql });
    }
  }
  return out;
}

const SqlAgentWorkbenchPage: React.FC = () => {
  const { message, modal } = App.useApp();
  const location = useLocation();
  const screens = Grid.useBreakpoint();

  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);

  const session = useAguiSession(defaultControlPlaneClient, {
    lockedAgentId: SQL_AGENT_ID,
  });

  // If user navigates here with a threadId, treat it as an explicit restore intent.
  // This prevents accidental "new thread" creation when the snapshot restore fails.
  const urlThreadId = getQueryParam(location.search, 'threadId');

  useEffect(() => {
    // lockedAgentId 已保证 agent 不会被误改写。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-restore thread from URL: ?threadId=th_...
  useEffect(() => {
    const tid = getQueryParam(location.search, 'threadId');
    if (!tid) return;
    if (tid === session.threadId) return;
    session
      .loadSnapshot(tid)
      .then(() => message.success('Snapshot loaded'))
      .catch((e: any) => {
        console.log(e);
        message.error('Failed to load snapshot');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const sqlQueries = useMemo(
    () => extractSqlQueries(session.messages),
    [session.messages],
  );

  const lastToolMessage = useMemo(() => {
    const toolMsgs = session.messages.filter((m) => m.role === 'tool');
    return toolMsgs.length > 0 ? toolMsgs[toolMsgs.length - 1] : undefined;
  }, [session.messages]);

  const onCreateThread = async () => {
    try {
      // New conversation = new thread.
      const tid = await session.ensureThread();
      history.push({
        pathname: location.pathname,
        search: setQueryParam(location.search, 'threadId', tid),
      });
      message.success(`Thread created: ${tid}`);
    } catch (e) {
      console.log(e);
      message.error('Failed to create thread');
    }
  };

  const drawerWidth = screens.lg ? 520 : '92vw';
  const chatHeaderExtra = (
    <Space size={8} wrap>
      <Button
        size="small"
        onClick={() => {
          const tid = session.threadId;
          history.push({
            pathname: '/db-query/history',
            search: tid ? setQueryParam('', 'threadId', tid) : '',
          });
        }}
      >
        历史对话
      </Button>
      <Button
        size="small"
        type="primary"
        onClick={async () => {
          if (session.busy) {
            const choice = await confirmBusySwitch({
              modal,
              title: '新建对话？',
              description:
                '当前 run 仍在执行。你可以仅断开连接（run 会在服务端继续），或者先取消 run 再新建对话。',
              canCancel: Boolean(session.threadId && session.activeRunId),
            });
            if (choice === 'stay') return;
            if (choice === 'cancel') {
              try {
                await session.requestCancel();
                message.success('Cancel requested');
              } catch (e) {
                console.log(e);
                message.error('Cancel failed');
                return;
              }
            }
          }

          session.stopStream();
          await onCreateThread();
        }}
      >
        新建对话
      </Button>
      <Button size="small" onClick={() => setDetailsDrawerOpen(true)}>
        Inspector
      </Button>
    </Space>
  );

  const sqlPanel = (
    <Card title="SQL" size="small">
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <div>
          <Typography.Text type="secondary">Queries (heuristic)</Typography.Text>
          <div style={{ marginTop: 8 }}>
            {sqlQueries.length === 0 ? (
              <Typography.Text type="secondary">No tool queries yet</Typography.Text>
            ) : (
              <List
                size="small"
                dataSource={sqlQueries.slice(-10).reverse()}
                renderItem={(q: { id: string; name: string; sql: string }) => (
                  <List.Item>
                    <div style={{ width: '100%' }}>
                      <Space size={8} wrap>
                        <Tag>{q.name}</Tag>
                        {q.id && (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {q.id}
                          </Typography.Text>
                        )}
                      </Space>
                      <pre style={{ margin: '8px 0 0 0', overflowX: 'auto' }}>{q.sql}</pre>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </div>
        </div>

        <div>
          <Typography.Text type="secondary">Last tool output</Typography.Text>
          <pre style={{ margin: '8px 0 0 0', overflowX: 'auto' }}>
            {lastToolMessage?.content || ''}
          </pre>
        </div>
      </Space>
    </Card>
  );

  return (
    <PageContainer>
      <Card title="Chat" size="small" extra={chatHeaderExtra}>
        <XChatPanel title={undefined} session={session} requireThread={!!urlThreadId} />
      </Card>

      <Drawer
        title="Inspector"
        open={detailsDrawerOpen}
        onClose={() => setDetailsDrawerOpen(false)}
        placement="right"
        width={drawerWidth}
        destroyOnClose
      >
        <Tabs
          size="large"
          items={[
            {
              key: 'inspector',
              label: 'Inspector',
              children: <InspectorPane messages={session.messages} state={session.state} />,
            },
            {
              key: 'plan',
              label: 'Plan',
              children: <PlanPane plan={(session as any).plan} />,
            },
            {
              key: 'mcp',
              label: 'MCP',
              children: <McpPane events={((session as any).mcpEvents as any[]) || []} />,
            },
            {
              key: 'reasoning',
              label: 'Reasoning',
              children: <ReasoningPane value={(session as any).reasoningSummary} />,
            },
            {
              key: 'sql',
              label: 'SQL',
              children: sqlPanel,
            },
          ]}
        />
      </Drawer>
    </PageContainer>
  );
};

export default SqlAgentWorkbenchPage;
