import { Alert, Button, Input, Space, Tag, Typography } from 'antd';
import React, { useMemo, useState } from 'react';

import { ChatMessageList } from './ChatMessageList';

export type AguiSessionLike = {
  threadId: string;
  busy: boolean;
  streamConnecting: boolean;
  snapshotLoading: boolean;
  firstTokenReceived: boolean;
  activeRunId: string;
  selectedAgentId: string;
  messages: any[];

  loadSnapshot: (threadId: string) => Promise<any>;
  sendUserMessage: (text: string) => Promise<any>;
  requestCancel: () => Promise<any>;
};

export function ChatPane(props: {
  title?: string;
  session: AguiSessionLike;
  requireThread?: boolean;
}) {
  const { title, session, requireThread } = props;
  const [composer, setComposer] = useState('');

  const runStatusTag = useMemo(() => {
    if (session.streamConnecting) return <Tag color="processing">Connecting</Tag>;
    if (session.busy && !session.firstTokenReceived)
      return <Tag color="processing">Waiting</Tag>;
    if (session.busy) return <Tag color="processing">Running</Tag>;
    return <Tag>Idle</Tag>;
  }, [session.busy, session.firstTokenReceived, session.streamConnecting]);

  const onSend = async () => {
    const text = composer;
    setComposer('');
    await session.sendUserMessage(text);
  };

  const showBusyBanner =
    !session.snapshotLoading &&
    session.busy &&
    !session.streamConnecting &&
    !session.firstTokenReceived;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <Space size={8} wrap>
          <Typography.Text strong>{title || 'Chat'}</Typography.Text>
          {runStatusTag}
          {session.activeRunId ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              run={session.activeRunId}
            </Typography.Text>
          ) : null}
        </Space>
        <Space size={8} wrap>
          <Button
            size="small"
            onClick={() => session.loadSnapshot(session.threadId)}
            disabled={!session.threadId}
          >
            Refresh
          </Button>
          <Button
            size="small"
            danger
            onClick={() => session.requestCancel()}
            disabled={!session.busy || !session.threadId || !session.activeRunId}
          >
            Cancel
          </Button>
        </Space>
      </div>

      {showBusyBanner ? (
        <Alert
          type="info"
          showIcon
          message="Run in progress"
          description="This thread is marked busy. If you refreshed the page, the run may still be continuing on the server. You can wait, cancel, or refresh snapshot."
        />
      ) : null}

      <ChatMessageList messages={session.messages as any[]} loading={session.snapshotLoading} />

      <div>
        <Input.TextArea
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          placeholder={
            session.busy
              ? session.firstTokenReceived
                ? 'Run in progress...'
                : 'Connecting/Waiting...'
              : 'Type a message'
          }
          autoSize={{ minRows: 1, maxRows: 6 }}
          disabled={session.busy || session.snapshotLoading}
        />
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <Button
            type="primary"
            onClick={onSend}
            loading={session.streamConnecting}
            disabled={
              session.busy ||
              session.snapshotLoading ||
              !session.selectedAgentId ||
              (!!requireThread && !session.threadId)
            }
          >
            Send
          </Button>
        </div>
      </div>
    </Space>
  );
}
