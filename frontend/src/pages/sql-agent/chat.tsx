import { PageContainer } from '@ant-design/pro-components';
import { history, useLocation } from '@umijs/max';
import {
  App,
  Button,
  Card,
  Drawer,
  Grid,
  Space,
  Typography,
} from 'antd';
import React, { useEffect, useState } from 'react';

import { XChatPanel } from '@/features/agui/components/xchat/XChatPanel';
import { XChatThreadList } from '@/features/agui/components/xchat/XChatThreadList';
import { confirmBusySwitch } from '@/features/agui/components/xchat/confirmBusySwitch';
import { useAguiThreads } from '@/features/agui/components/xchat/useAguiThreads';
import { defaultControlPlaneClient } from '@/features/agui/defaultClient';
import { useAguiSession } from '@/features/agui/useAguiSession';

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
  const { message, modal } = App.useApp();
  const location = useLocation();
  const screens = Grid.useBreakpoint();

  const [threadsDrawerOpen, setThreadsDrawerOpen] = useState(false);

  const session = useAguiSession(defaultControlPlaneClient, {
    lockedAgentId: SQL_AGENT_ID,
  });

  const threads = useAguiThreads({ agentId: SQL_AGENT_ID, limit: 100, enabled: true });

  const switchToThread = async (threadId: string) => {
    const next = String(threadId || '').trim();
    if (!next) return;
    if (next === session.threadId) return;

    if (session.busy) {
      const choice = await confirmBusySwitch({
        modal,
        title: '切换 Thread？',
        description:
          '当前 run 仍在执行。你可以仅断开连接（run 会在服务端继续），或者先取消 run 再切换。',
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

    // Load snapshot first so clicking a thread immediately shows history.
    session.stopStream();
    try {
      await session.loadSnapshot(next);
      message.success('Snapshot loaded');
    } catch (e) {
      console.log(e);
      message.error('Failed to load snapshot');
      return;
    }
    history.push({
      pathname: location.pathname,
      search: setQueryParam(location.search, 'threadId', next),
    });
  };


  // Fixed agent for this page.
  useEffect(() => {
    // lockedAgentId 已保证 agent 不会被误改写。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-restore thread from URL: ?threadId=th_...
  useEffect(() => {
    const tid = getQueryParam(location.search, 'threadId');
    if (!tid) return;
    if (tid === session.threadId) return;

    // best-effort restore; errors are surfaced via toast
    session
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

  const onCreateThread = async () => {
    try {
      const tid = await session.ensureThread();
      history.push({
        pathname: location.pathname,
        search: setQueryParam(location.search, 'threadId', tid),
      });
      message.success(`Thread created: ${tid}`);
      threads.refresh();
    } catch (e) {
      console.log(e);
      message.error('Failed to create thread');
    }
  };

  const drawerWidth = screens.lg ? 520 : '92vw';

  return (
    <PageContainer>
      <Card
        title="Chat"
        size="small"
        extra={
          <Space size={8} wrap>
            <Button size="small" onClick={() => setThreadsDrawerOpen(true)}>
              Threads
            </Button>
          </Space>
        }
      >
        <XChatPanel title={undefined} session={session} />
      </Card>

      <Drawer
        title="Threads"
        open={threadsDrawerOpen}
        onClose={() => setThreadsDrawerOpen(false)}
        placement="left"
        width={drawerWidth}
        destroyOnClose
      >
        <Card title="SQL Agent" size="small">
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div>
              <Typography.Text type="secondary">agentId</Typography.Text>
              <div style={{ marginTop: 6 }}>
                <Typography.Text code>{SQL_AGENT_ID}</Typography.Text>
              </div>
            </div>

            <XChatThreadList
              threads={threads.threads}
              loading={threads.loading}
              activeKey={session.threadId || undefined}
              onRefresh={() => threads.refresh()}
              onNewThread={async () => {
                await onCreateThread();
                setThreadsDrawerOpen(false);
              }}
              onRestoreThread={async (tid) => {
                await switchToThread(tid);
                setThreadsDrawerOpen(false);
              }}
              onActiveChange={(tid) => {
                void (async () => {
                  await switchToThread(tid);
                  setThreadsDrawerOpen(false);
                })();
              }}
            />
          </Space>
        </Card>
      </Drawer>
    </PageContainer>
  );
};

export default SqlAgentChatPage;
