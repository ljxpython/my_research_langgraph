import { useRequest } from '@umijs/max';
import {
  Button,
  Drawer,
  List,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import React, { useMemo } from 'react';

import { listThreads } from '@/services/controlPlane/threads';
import type { ControlPlaneThreadSummary } from '@/services/controlPlane/types';

export function ThreadHistoryDrawer(props: {
  open: boolean;
  onClose: () => void;
  agentId: string;
  activeThreadId?: string;
  onSelectThread: (threadId: string) => void;
}) {
  const { open, onClose, agentId, activeThreadId, onSelectThread } = props;

  const req = useRequest(
    async () => {
      return await listThreads({ agentId, limit: 100 }, { skipErrorHandler: true });
    },
    { manual: true },
  );

  const threads = useMemo(() => {
    const raw = (req.data || []) as any;
    return Array.isArray(raw) ? (raw as ControlPlaneThreadSummary[]) : [];
  }, [req.data]);

  const skeletonKeys = useMemo(
    () => ['sk1', 'sk2', 'sk3', 'sk4', 'sk5', 'sk6', 'sk7', 'sk8'],
    [],
  );

  return (
    <Drawer
      title="Thread History"
      open={open}
      onClose={onClose}
      width={420}
      destroyOnClose
      extra={
        <Space size={8}>
          <Button onClick={() => req.run()} loading={req.loading}>
            Refresh
          </Button>
        </Space>
      }
      afterOpenChange={(next) => {
        if (next) req.run();
      }}
    >
      {req.loading ? (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {skeletonKeys.map((k) => (
            <Skeleton key={k} active paragraph={{ rows: 1 }} />
          ))}
        </Space>
      ) : (
        <List
          dataSource={threads}
          locale={{ emptyText: 'No threads yet' }}
          renderItem={(t) => {
            const isActive = !!activeThreadId && t.threadId === activeThreadId;
            return (
              <List.Item
                onClick={() => onSelectThread(t.threadId)}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ width: '100%' }}>
                  <Space size={8} wrap>
                    {isActive ? <Tag color="blue">Active</Tag> : <Tag>Thread</Tag>}
                    {t.busy ? <Tag color="processing">Busy</Tag> : <Tag color="default">Idle</Tag>}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {t.threadId}
                    </Typography.Text>
                  </Space>
                </div>
              </List.Item>
            );
          }}
        />
      )}
    </Drawer>
  );
}
