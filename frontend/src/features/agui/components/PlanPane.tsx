import { Checkbox, Space, Tag, Typography } from 'antd';
import React from 'react';

type PlanItem = {
  id: string;
  title: string;
  status?: string;
};

function statusTag(status: string | undefined) {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return <Tag color="success">done</Tag>;
  if (s === 'in_progress' || s === 'running') return <Tag color="processing">running</Tag>;
  if (s === 'cancelled' || s === 'canceled') return <Tag>cancelled</Tag>;
  return <Tag>pending</Tag>;
}

export function PlanPane(props: { plan?: Record<string, any> }) {
  const plan = props.plan;
  if (!plan) {
    return <Typography.Text type="secondary">No plan yet.</Typography.Text>;
  }

  const title = typeof plan.title === 'string' ? plan.title : 'Plan';
  const items: PlanItem[] = Array.isArray((plan as any).items) ? (plan as any).items : [];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={10}>
      <Typography.Text strong>{title}</Typography.Text>
      {items.length === 0 ? (
        <Typography.Text type="secondary">Empty plan.</Typography.Text>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={6}>
          {items.map((it) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Checkbox checked={String(it.status || '').toLowerCase() === 'completed'} disabled />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Typography.Text ellipsis>{it.title || it.id}</Typography.Text>
              </div>
              {statusTag(it.status)}
            </div>
          ))}
        </Space>
      )}
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        planId={(plan as any).planId || '-'}
      </Typography.Text>
    </Space>
  );
}
