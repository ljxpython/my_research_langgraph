import { PageContainer } from '@ant-design/pro-components';
import { history, useLocation, useModel } from '@umijs/max';
import {
  App,
  Button,
  Card,
  Col,
  Input,
  List,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd';
import React, { useEffect, useMemo, useState } from 'react';

import type { AguiMessage, AguiState } from '@/services/controlPlane/types';

import { ChatPane } from '@/features/agui/components/ChatPane';
import { InspectorPane } from '@/features/agui/components/InspectorPane';

import { ThreadHistoryDrawer } from './components/thread-history';

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

function coerceAguiState(value: any): AguiState {
  const ui = value?.ui && typeof value.ui === 'object' ? value.ui : {};
  const app = value?.app && typeof value.app === 'object' ? value.app : {};
  const debug =
    value?.debug && typeof value.debug === 'object' ? value.debug : {};
  return { ui, app, debug };
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
  const agui = useModel('agui');
  const { message } = App.useApp();
  const location = useLocation();

  const [historyOpen, setHistoryOpen] = useState(false);

  const [restoreThreadId, setRestoreThreadId] = useState<string>('');

  useEffect(() => {
    if (agui.selectedAgentId !== SQL_AGENT_ID) {
      agui.setSelectedAgentId(SQL_AGENT_ID);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-restore thread from URL: ?threadId=th_...
  useEffect(() => {
    const tid = getQueryParam(location.search, 'threadId');
    if (!tid) return;
    if (tid === agui.threadId) return;
    setRestoreThreadId(tid);
    agui
      .loadSnapshot(tid)
      .then(() => message.success('Snapshot loaded'))
      .catch((e: any) => {
        console.log(e);
        message.error('Failed to load snapshot');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const state = useMemo(() => coerceAguiState(agui.state), [agui.state]);

  const sqlQueries = useMemo(
    () => extractSqlQueries(agui.messages),
    [agui.messages],
  );

  const lastToolMessage = useMemo(() => {
    const toolMsgs = agui.messages.filter((m) => (m as any).role === 'tool');
    return toolMsgs.length > 0 ? toolMsgs[toolMsgs.length - 1] : undefined;
  }, [agui.messages]);

  const onCreateThread = async () => {
    try {
      const tid = await agui.ensureThread();
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

  const onRestoreSnapshot = async (id: string) => {
    const tid = id.trim();
    if (!tid) return;
    try {
      await agui.loadSnapshot(tid);
      history.push({
        pathname: location.pathname,
        search: setQueryParam(location.search, 'threadId', tid),
      });
      message.success('Snapshot loaded');
    } catch (e) {
      console.log(e);
      message.error('Failed to load snapshot');
    }
  };

  return (
    <PageContainer>
      <Row gutter={[16, 16]}>
        <Col xs={{ span: 24, order: 1 }} lg={{ span: 7, order: 1 }}>
          <Card title="Thread" size="small">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <div>
                <Typography.Text type="secondary">agentId</Typography.Text>
                <div style={{ marginTop: 6 }}>
                  <Typography.Text code>{SQL_AGENT_ID}</Typography.Text>
                </div>
              </div>

              <Button type="primary" block onClick={onCreateThread}>
                New Thread
              </Button>

              <Button block onClick={() => setHistoryOpen(true)}>
                Thread History
              </Button>

              <div>
                <Typography.Text type="secondary">
                  Restore from threadId
                </Typography.Text>
                <Input.Search
                  style={{ marginTop: 4 }}
                  placeholder="th_..."
                  value={restoreThreadId}
                  onChange={(e) => setRestoreThreadId(e.target.value)}
                  onSearch={onRestoreSnapshot}
                  enterButton="Load"
                />
              </div>

              <div>
                <Typography.Text type="secondary">Current</Typography.Text>
                <div style={{ marginTop: 6 }}>
                  <Typography.Text code>{agui.threadId || '-'}</Typography.Text>
                </div>
              </div>
            </Space>
          </Card>

          <Card title="SQL" size="small" style={{ marginTop: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <div>
                <Typography.Text type="secondary">
                  Queries (heuristic)
                </Typography.Text>
                <div style={{ marginTop: 8 }}>
                  {sqlQueries.length === 0 ? (
                    <Typography.Text type="secondary">
                      No tool queries yet
                    </Typography.Text>
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
                                <Typography.Text
                                  type="secondary"
                                  style={{ fontSize: 12 }}
                                >
                                  {q.id}
                                </Typography.Text>
                              )}
                            </Space>
                            <pre
                              style={{ margin: '8px 0 0 0', overflowX: 'auto' }}
                            >
                              {q.sql}
                            </pre>
                          </div>
                        </List.Item>
                      )}
                    />
                  )}
                </div>
              </div>

              <div>
                <Typography.Text type="secondary">
                  Last tool output
                </Typography.Text>
                <pre style={{ margin: '8px 0 0 0', overflowX: 'auto' }}>
                  {lastToolMessage?.content || ''}
                </pre>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={{ span: 24, order: 2 }} lg={{ span: 11, order: 2 }}>
          <ChatPane title="Chat" session={agui as any} />
        </Col>

        <Col xs={{ span: 24, order: 3 }} lg={{ span: 6, order: 3 }}>
          <InspectorPane messages={agui.messages as any} state={state} />
        </Col>
      </Row>

      <ThreadHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        agentId={SQL_AGENT_ID}
        activeThreadId={agui.threadId}
        onSelectThread={(tid) => {
          setHistoryOpen(false);
          history.push({
            pathname: location.pathname,
            search: setQueryParam(location.search, 'threadId', tid),
          });
        }}
      />
    </PageContainer>
  );
};

export default SqlAgentWorkbenchPage;
