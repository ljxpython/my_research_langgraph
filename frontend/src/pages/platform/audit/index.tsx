import type { ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history, useLocation } from '@umijs/max';
import { Alert, App, Space, Typography } from 'antd';
import React, { useMemo } from 'react';
import ProjectPicker from '../components/ProjectPicker';
import { listProjectAuditEvents } from '@/services/platform/audit';
import { formatPlatformError } from '@/services/platform/request';
import type { PlatformAuditEvent, PlatformCursorPage } from '@/services/platform/types';

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

function normalizeAuditList(
  payload: PlatformCursorPage<PlatformAuditEvent> | PlatformAuditEvent[],
): PlatformAuditEvent[] {
  if (Array.isArray(payload)) return payload;
  return payload.items ?? [];
}

const columns: ProColumns<PlatformAuditEvent>[] = [
  {
    title: 'Created At',
    dataIndex: 'created_at',
    valueType: 'dateTime',
    width: 190,
  },
  {
    title: 'Action',
    dataIndex: 'action',
    ellipsis: true,
  },
  {
    title: 'Outcome',
    dataIndex: 'outcome',
    width: 120,
  },
  {
    title: 'Actor',
    dataIndex: ['actor', 'actor_id'],
    copyable: true,
    ellipsis: true,
    render: (_, record) => {
      return (
        <Space size={8}>
          <Typography.Text>{record.actor?.actor_type}</Typography.Text>
          <Typography.Text copyable>{record.actor?.actor_id}</Typography.Text>
        </Space>
      );
    },
  },
  {
    title: 'Resource',
    dataIndex: ['resource', 'resource_id'],
    copyable: true,
    ellipsis: true,
    render: (_, record) => {
      return (
        <Space size={8}>
          <Typography.Text>{record.resource?.resource_type}</Typography.Text>
          <Typography.Text copyable>{record.resource?.resource_id}</Typography.Text>
        </Space>
      );
    },
  },
  {
    title: 'Request ID',
    dataIndex: 'request_id',
    copyable: true,
    ellipsis: true,
  },
];

const AuditPage: React.FC = () => {
  const { message } = App.useApp();
  const location = useLocation();

  const projectId = useMemo(() => {
    return getQueryParam(location.search, 'projectId');
  }, [location.search]);

  return (
    <PageContainer
      extra={
        <ProjectPicker
          value={projectId}
          onChange={(next) => {
            history.push({
              pathname: location.pathname,
              search: setQueryParam(location.search, 'projectId', next),
            });
          }}
        />
      }
    >
      {!projectId ? (
        <Alert
          showIcon
          type="info"
          message="请选择一个 Project 来查看 Audit Events。"
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <ProTable<PlatformAuditEvent>
        rowKey="audit_event_id"
        search={false}
        options={{ density: false, fullScreen: true, reload: true, setting: true }}
        request={async () => {
          if (!projectId) return { data: [], success: true };
          try {
            const payload = await listProjectAuditEvents(projectId);
            const data = normalizeAuditList(payload);
            return { data, success: true };
          } catch (err) {
            message.error(formatPlatformError(err));
            return { data: [], success: false };
          }
        }}
        columns={columns}
      />
    </PageContainer>
  );
};

export default AuditPage;
