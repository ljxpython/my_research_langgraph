import { PageContainer } from '@ant-design/pro-components';
import { history, useLocation, useModel } from '@umijs/max';
import {
  App,
  Button,
  Card,
  Col,
  Input,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd';
import React, { useEffect, useMemo, useState } from 'react';

import { ChatPane } from '@/features/agui/components/ChatPane';

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

const SqlAgentChatPage: React.FC = () => {
  const agui = useModel('agui');
  const { message } = App.useApp();
  const location = useLocation();

  const [historyOpen, setHistoryOpen] = useState(false);

  const [restoreThreadId, setRestoreThreadId] = useState<string>('');

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

  const onCancel = async () => {
    try {
      await agui.requestCancel();
      message.success('Cancel requested');
    } catch (e) {
      console.log(e);
      message.error('Cancel failed');
    }
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
          <ChatPane title="Chat" session={agui as any} />
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
