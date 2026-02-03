import { Conversations } from '@ant-design/x';
import type { ConversationItemType } from '@ant-design/x';
import { Button, Input, Space, Tag, Typography } from 'antd';
import * as React from 'react';

import type { ControlPlaneThreadSummary } from '@/services/controlPlane/types';

function shortThreadId(threadId: string): string {
  const v = String(threadId || '');
  if (v.length <= 12) return v;
  return `${v.slice(0, 3)}…${v.slice(-6)}`;
}

export function XChatThreadList(props: {
  title?: React.ReactNode;
  threads: ControlPlaneThreadSummary[];
  loading?: boolean;
  activeKey?: string;
  onActiveChange?: (threadId: string) => void;

  // Optional actions
  onRefresh?: () => void;
  onNewThread?: () => Promise<void>;
  onRestoreThread?: (threadId: string) => Promise<void>;

  // UX
  disableNew?: boolean;
  disableSelect?: boolean;
}) {
  const {
    title,
    threads,
    loading,
    activeKey,
    onActiveChange,
    onRefresh,
    onNewThread,
    onRestoreThread,
    disableNew,
    disableSelect,
  } = props;

  const [restoreInput, setRestoreInput] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const items: ConversationItemType[] = React.useMemo(() => {
    return threads
      .slice()
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .map((t) => {
        const disabled = !!disableSelect;
        return {
          key: t.threadId,
          disabled,
          label: (
            <Space size={8} wrap>
              {t.busy ? <Tag color="processing">Busy</Tag> : <Tag>Idle</Tag>}
              <Typography.Text style={{ fontSize: 13 }}>{shortThreadId(t.threadId)}</Typography.Text>
            </Space>
          ),
        };
      });
  }, [disableSelect, threads]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <Typography.Text strong>{title || 'Threads'}</Typography.Text>
        {onRefresh ? (
          <Button size="small" onClick={onRefresh} loading={loading}>
            Refresh
          </Button>
        ) : null}
      </div>

      {onRestoreThread ? (
        <Input.Search
          allowClear
          value={restoreInput}
          onChange={(e) => setRestoreInput(e.target.value)}
          placeholder="Restore by threadId (th_...)"
          enterButton="Load"
          onSearch={(v) => {
            const tid = String(v || '').trim();
            if (!tid) return;
            onRestoreThread(tid);
          }}
        />
      ) : null}

      <Conversations
        items={items}
        activeKey={activeKey}
        onActiveChange={(k) => {
          if (!onActiveChange) return;
          onActiveChange(String(k));
        }}
        creation={
          onNewThread
            ? {
                label: 'New thread',
                disabled: !!disableNew,
                onClick: async () => {
                  if (disableNew) return;
                  setCreating(true);
                  try {
                    await onNewThread();
                  } finally {
                    setCreating(false);
                  }
                },
              }
            : undefined
        }
        style={{ flex: 1, minHeight: 240, opacity: creating ? 0.7 : 1 }}
      />
    </div>
  );
}
