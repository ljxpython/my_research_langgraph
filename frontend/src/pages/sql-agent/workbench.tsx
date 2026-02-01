import { PageContainer } from '@ant-design/pro-components';
import { history, useLocation, useModel } from '@umijs/max';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Collapse,
  Input,
  List,
  Row,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import React, { useEffect, useMemo, useState } from 'react';

import type { AguiMessage, AguiState } from '@/services/controlPlane/types';

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

function roleToTagColor(role: string): string {
  switch (role) {
    case 'user':
      return 'geekblue';
    case 'assistant':
      return 'green';
    case 'tool':
      return 'gold';
    case 'system':
      return 'default';
    default:
      return 'default';
  }
}

function formatJson(value: any): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
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
  const [composer, setComposer] = useState<string>('');

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

  const runStatusTag = useMemo(() => {
    if (agui.streamConnecting) return <Tag color="processing">Connecting</Tag>;
    if (agui.busy && !agui.firstTokenReceived)
      return <Tag color="processing">Waiting</Tag>;
    if (agui.busy) return <Tag color="processing">Running</Tag>;
    return <Tag color="default">Idle</Tag>;
  }, [agui.busy, agui.firstTokenReceived, agui.streamConnecting]);

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

  const onSend = async () => {
    const text = composer;
    setComposer('');
    const res = await agui.sendUserMessage(text);
    if (!res.ok) {
      switch ((res as any).reason) {
        case 'BUSY':
        case 'THREAD_BUSY':
          message.warning(
            agui.activeRunId
              ? `Thread is busy (active run: ${agui.activeRunId}). You can cancel or wait.`
              : 'Thread is busy (cancel or wait)',
          );
          break;
        default:
          message.error('Failed to start run');
      }
    }
  };

  const onCancel = async () => {
    try {
      await agui.requestCancel();
      message.success('Cancel requested');
    } catch (e) {
      console.log(e);
      message.error('Cancel failed');
    }
  };

  const renderMessage = (m: AguiMessage) => {
    const role = m.role || 'unknown';
    const toolCalls = Array.isArray((m as any).toolCalls)
      ? (m as any).toolCalls
      : [];

    return (
      <List.Item>
        <div style={{ width: '100%' }}>
          <Space size={8} style={{ marginBottom: 4 }} wrap>
            <Tag color={roleToTagColor(role)}>{role}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {m.id}
            </Typography.Text>
            {(m as any).toolCallId && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                toolCallId={(m as any).toolCallId}
              </Typography.Text>
            )}
          </Space>

          {role === 'tool' ? (
            <pre
              style={{
                margin: 0,
                padding: 12,
                background: 'rgba(0,0,0,0.03)',
                borderRadius: 6,
                overflowX: 'auto',
              }}
            >
              {m.content}
            </pre>
          ) : (
            <Typography.Paragraph
              style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}
            >
              {m.content}
            </Typography.Paragraph>
          )}

          {toolCalls.length > 0 && (
            <Collapse
              size="small"
              items={toolCalls.map((tc: any, idx: number) => {
                const argText = tc?.function?.arguments || '{}';
                const parsedArgs = parseToolArgs(argText);
                return {
                  key: tc.id || String(idx),
                  label: (
                    <Space size={8} wrap>
                      <Typography.Text>
                        {tc?.function?.name || 'tool'}
                      </Typography.Text>
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12 }}
                      >
                        {tc.id}
                      </Typography.Text>
                    </Space>
                  ),
                  children: (
                    <Space
                      direction="vertical"
                      style={{ width: '100%' }}
                      size={8}
                    >
                      <div>
                        <Typography.Text type="secondary">
                          arguments
                        </Typography.Text>
                        <pre style={{ margin: 0, overflowX: 'auto' }}>
                          {parsedArgs
                            ? formatJson(parsedArgs)
                            : String(argText)}
                        </pre>
                      </div>
                    </Space>
                  ),
                };
              })}
            />
          )}
        </div>
      </List.Item>
    );
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
                      renderItem={(q) => (
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
          <Card
            title="Chat"
            size="small"
            extra={
              <Space size={8} wrap>
                {runStatusTag}
                {agui.activeRunId && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    run={agui.activeRunId}
                  </Typography.Text>
                )}
              </Space>
            }
          >
            {!agui.snapshotLoading &&
            agui.busy &&
            !agui.streamConnecting &&
            !agui.firstTokenReceived ? (
              <Alert
                style={{ marginBottom: 8 }}
                type="info"
                showIcon
                message="Run in progress"
                description="This thread is marked busy. If you refreshed the page, the run may still be continuing on the server. You can wait, cancel, or refresh snapshot."
                action={
                  <Space size={8}>
                    <Button
                      size="small"
                      onClick={() => agui.loadSnapshot(agui.threadId)}
                      disabled={!agui.threadId}
                    >
                      Refresh
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={onCancel}
                      disabled={!agui.threadId || !agui.activeRunId}
                    >
                      Cancel
                    </Button>
                  </Space>
                }
              />
            ) : null}
            <div style={{ minHeight: 240, maxHeight: 520, overflow: 'auto' }}>
              {agui.busy && !agui.firstTokenReceived ? (
                <Typography.Text type="secondary">
                  Assistant is thinking...
                </Typography.Text>
              ) : null}
              <List
                dataSource={agui.messages}
                loading={agui.snapshotLoading}
                locale={{ emptyText: 'No messages yet' }}
                renderItem={renderMessage}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <Input.TextArea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder={
                  agui.busy
                    ? agui.firstTokenReceived
                      ? 'Run in progress...'
                      : 'Connecting/Waiting...'
                    : 'Ask a question about the DB'
                }
                autoSize={{ minRows: 2, maxRows: 6 }}
                disabled={agui.busy || agui.snapshotLoading}
              />
              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <Button
                  danger
                  onClick={onCancel}
                  disabled={!agui.busy || !agui.threadId || !agui.activeRunId}
                >
                  Cancel
                </Button>
                <Button
                  type="primary"
                  onClick={onSend}
                  loading={agui.streamConnecting}
                  disabled={
                    agui.busy ||
                    agui.snapshotLoading ||
                    !agui.threadId ||
                    agui.selectedAgentId !== SQL_AGENT_ID
                  }
                >
                  Send
                </Button>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={{ span: 24, order: 3 }} lg={{ span: 6, order: 3 }}>
          <Card title="State" size="small">
            <Tabs
              size="small"
              items={[
                {
                  key: 'ui',
                  label: 'ui',
                  children: (
                    <pre style={{ margin: 0, overflowX: 'auto' }}>
                      {formatJson(state.ui)}
                    </pre>
                  ),
                },
                {
                  key: 'app',
                  label: 'app',
                  children: (
                    <pre style={{ margin: 0, overflowX: 'auto' }}>
                      {formatJson(state.app)}
                    </pre>
                  ),
                },
                {
                  key: 'debug',
                  label: 'debug',
                  children: (
                    <pre style={{ margin: 0, overflowX: 'auto' }}>
                      {formatJson(state.debug)}
                    </pre>
                  ),
                },
              ]}
            />
          </Card>
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
