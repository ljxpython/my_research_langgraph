import { PageContainer } from '@ant-design/pro-components';
import { history, useLocation, useModel } from '@umijs/max';
import {
  Alert,
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

import type { AguiMessage } from '@/services/controlPlane/types';

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

const SqlAgentChatPage: React.FC = () => {
  const agui = useModel('agui');
  const { message } = App.useApp();
  const location = useLocation();

  const [historyOpen, setHistoryOpen] = useState(false);

  const [restoreThreadId, setRestoreThreadId] = useState<string>('');
  const [composer, setComposer] = useState<string>('');

  // Fixed agent for this page.
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
    // best-effort restore; errors are surfaced via toast
    agui
      .loadSnapshot(tid)
      .then(() => {
        message.success('Snapshot loaded');
      })
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
    return (
      <List.Item>
        <div style={{ width: '100%' }}>
          <Space size={8} style={{ marginBottom: 4 }} wrap>
            <Tag color={roleToTagColor(role)}>{role}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {m.id}
            </Typography.Text>
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
        </div>
      </List.Item>
    );
  };

  return (
    <PageContainer>
      <Row gutter={[16, 16]}>
        <Col xs={{ span: 24 }} lg={{ span: 7 }}>
          <Card title="SQL Agent" size="small">
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

              <div>
                <Typography.Text type="secondary">Run</Typography.Text>
                <div style={{ marginTop: 6 }}>
                  <Space size={8} wrap>
                    {runStatusTag}
                    {agui.activeRunId && (
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12 }}
                      >
                        run={agui.activeRunId}
                      </Typography.Text>
                    )}
                  </Space>
                </div>
              </div>

              <Button
                danger
                block
                onClick={onCancel}
                disabled={!agui.busy || !agui.threadId || !agui.activeRunId}
              >
                Cancel
              </Button>
            </Space>
          </Card>
        </Col>

        <Col xs={{ span: 24 }} lg={{ span: 17 }}>
          <Card
            title="Chat"
            size="small"
            extra={<Space size={8}>{runStatusTag}</Space>}
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
            <div style={{ minHeight: 320, maxHeight: 620, overflow: 'auto' }}>
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
                  justifyContent: 'flex-end',
                }}
              >
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

export default SqlAgentChatPage;
