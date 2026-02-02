import type { ProColumns } from '@ant-design/pro-components';
import {
  ModalForm,
  PageContainer,
  ProFormSelect,
  ProFormText,
  ProTable,
} from '@ant-design/pro-components';
import { history, Link, useLocation } from '@umijs/max';
import React, { useMemo, useState } from 'react';
import { Alert, Button, Tag, message } from 'antd';
import { listProjectEnvironments } from '@/services/platform/environments';
import { createRun, listProjectRuns } from '@/services/platform/runs';
import { formatPlatformError } from '@/services/platform/request';
import type { PlatformRun } from '@/services/platform/types';
import ProjectPicker from '../components/ProjectPicker';

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

function statusTag(status: string) {
  if (status === 'running') return <Tag color="processing">running</Tag>;
  if (status === 'succeeded') return <Tag color="success">succeeded</Tag>;
  if (status === 'failed') return <Tag color="error">failed</Tag>;
  if (status === 'canceled') return <Tag color="default">canceled</Tag>;
  if (status === 'queued') return <Tag color="default">queued</Tag>;
  return <Tag>{status}</Tag>;
}

const columns: ProColumns<PlatformRun>[] = [
  {
    title: 'Run ID',
    dataIndex: 'run_id',
    copyable: true,
    ellipsis: true,
    render: (_, record) => {
      return (
        <Link to={`/platform/runs/${encodeURIComponent(record.run_id)}`}>{record.run_id}</Link>
      );
    },
  },
  {
    title: 'Status',
    dataIndex: 'status',
    render: (_, record) => statusTag(record.status),
  },
  {
    title: 'Environment',
    dataIndex: 'environment_id',
    copyable: true,
    ellipsis: true,
  },
  {
    title: 'Runner',
    dataIndex: 'runner',
    ellipsis: true,
  },
  {
    title: 'Created At',
    dataIndex: 'created_at',
    valueType: 'dateTime',
    width: 190,
  },
  {
    title: 'Client Run ID',
    dataIndex: 'client_run_id',
    ellipsis: true,
    copyable: true,
  },
];

const RunsPage = () => {
  const location = useLocation();

  const [createOpen, setCreateOpen] = useState(false);

  const projectId = useMemo(() => {
    return getQueryParam(location.search, 'projectId');
  }, [location.search]);

  function makeClientRunId(): string {
    // Keep ASCII-only and stable across retries if user re-submits.
    const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
    return `crun_${rand.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  }

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
          message="请选择一个 Project 来查看 Runs。"
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <ProTable<PlatformRun>
        rowKey="run_id"
        search={false}
        options={{ density: false, fullScreen: true, reload: true, setting: true }}
        toolBarRender={(action) => {
          return [
            <ModalForm<{ environment_id: string; client_run_id: string }>
              key="create"
              title="Trigger Dummy Run"
              open={createOpen}
              onOpenChange={setCreateOpen}
              modalProps={{ destroyOnClose: true }}
              trigger={
                <Button type="primary" disabled={!projectId}>
                  Trigger Run
                </Button>
              }
              initialValues={{ client_run_id: makeClientRunId() }}
              onFinish={async (values) => {
                if (!projectId) return false;
                try {
                  const run = await createRun({
                    projectId,
                    client_run_id: values.client_run_id,
                    environment_id: values.environment_id,
                    runner: 'dummy',
                    params: {},
                  });
                  message.success('Run created');
                  setCreateOpen(false);
                  action?.reload();
                  history.push(`/platform/runs/${encodeURIComponent(run.run_id)}`);
                  return true;
                } catch (err) {
                  message.error(formatPlatformError(err));
                  return false;
                }
              }}
            >
              <ProFormSelect
                name="environment_id"
                label="Environment"
                rules={[{ required: true, message: 'Please select environment' }]}
                request={async () => {
                  if (!projectId) return [];
                  const envs = await listProjectEnvironments(projectId);
                  return envs
                    .filter((e) => e.status === 'active')
                    .map((e) => ({ label: `${e.name} (${e.environment_id})`, value: e.environment_id }));
                }}
              />
              <ProFormText
                name="client_run_id"
                label="client_run_id"
                tooltip="幂等键：重试必须复用同一个 client_run_id"
                rules={[{ required: true }]}
              />
            </ModalForm>,
          ];
        }}
        request={async () => {
          if (!projectId) return { data: [], success: true };
          try {
            const data = await listProjectRuns(projectId);
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

export default RunsPage;
