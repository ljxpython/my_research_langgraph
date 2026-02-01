import type { ProColumns } from '@ant-design/pro-components';
import {
  ModalForm,
  PageContainer,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from '@ant-design/pro-components';
import { history, useLocation } from '@umijs/max';
import { Alert, App, Button, Space, Typography } from 'antd';
import React, { useMemo } from 'react';
import ProjectPicker from '../components/ProjectPicker';
import { formatPlatformError } from '@/services/platform/request';
import {
  createEnvironment,
  listProjectEnvironments,
  patchEnvironment,
} from '@/services/platform/environments';
import type { PlatformEnvironment } from '@/services/platform/types';

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

const baseColumns: ProColumns<PlatformEnvironment>[] = [
  {
    title: 'Name',
    dataIndex: 'name',
    ellipsis: true,
    render: (_, record) => {
      return (
        <Space size={10}>
          <Typography.Text strong ellipsis style={{ maxWidth: 260 }}>
            {record.name}
          </Typography.Text>
          <Typography.Text type="secondary">{record.type}</Typography.Text>
        </Space>
      );
    },
  },
  {
    title: 'Environment ID',
    dataIndex: 'environment_id',
    copyable: true,
    ellipsis: true,
  },
  {
    title: 'Status',
    dataIndex: 'status',
    valueType: 'select',
    valueEnum: {
      active: { text: 'Active', status: 'Success' },
      disabled: { text: 'Disabled', status: 'Default' },
    },
  },
  {
    title: 'Health',
    dataIndex: 'health_status',
    ellipsis: true,
  },
  {
    title: 'Active Run',
    dataIndex: 'active_run_id',
    ellipsis: true,
    copyable: true,
  },
  {
    title: 'Updated At',
    dataIndex: 'updated_at',
    valueType: 'dateTime',
    width: 190,
  },
];

const EnvironmentsPage: React.FC = () => {
  const { message } = App.useApp();
  const location = useLocation();

  const [createOpen, setCreateOpen] = React.useState(false);

  const projectId = useMemo(() => {
    return getQueryParam(location.search, 'projectId');
  }, [location.search]);

  const columns = useMemo((): ProColumns<PlatformEnvironment>[] => {
    return [
      ...baseColumns,
      {
        title: 'Actions',
        valueType: 'option',
        render: (_, record, __, action) => {
          const toggleTo = record.status === 'active' ? 'disabled' : 'active';
          return [
            <a
              key="toggle"
              onClick={async () => {
                if (!record.project_id) return;
                try {
                  await patchEnvironment({
                    projectId: record.project_id,
                    environmentId: record.environment_id,
                    status: toggleTo,
                  });
                  action?.reload();
                } catch (err) {
                  message.error(formatPlatformError(err));
                }
              }}
            >
              {toggleTo === 'disabled' ? 'Disable' : 'Enable'}
            </a>,
          ];
        },
      },
    ];
  }, [message]);

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
          message="请选择一个 Project 来查看 Environments。"
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <ProTable<PlatformEnvironment>
        rowKey="environment_id"
        search={false}
        options={{ density: false, fullScreen: true, reload: true, setting: true }}
        toolBarRender={() => {
          return [
            <ModalForm<{ name: string; type?: string; configText?: string }>
              key="create"
              title="Create Environment"
              open={createOpen}
              onOpenChange={setCreateOpen}
              modalProps={{ destroyOnClose: true }}
              trigger={
                <Button type="primary" disabled={!projectId}>
                  New Environment
                </Button>
              }
              onFinish={async (values) => {
                if (!projectId) return false;
                try {
                  const config_json = values.configText
                    ? (JSON.parse(values.configText) as Record<string, unknown>)
                    : {};
                  await createEnvironment({
                    projectId,
                    name: values.name,
                    type: values.type || 'generic',
                    config_json,
                  });
                  message.success('Environment created');
                  setCreateOpen(false);
                  return true;
                } catch (err) {
                  message.error(formatPlatformError(err));
                  return false;
                }
              }}
            >
              <ProFormText
                name="name"
                label="Name"
                rules={[{ required: true, message: 'Please input environment name' }]}
              />
              <ProFormText name="type" label="Type" initialValue="generic" />
              <ProFormTextArea
                name="configText"
                label="config_json (optional)"
                placeholder='{"executionTargetId":"local-dev"}'
                fieldProps={{ autoSize: { minRows: 4, maxRows: 10 } }}
              />
            </ModalForm>,
          ];
        }}
        request={async () => {
          if (!projectId) return { data: [], success: true };
          try {
            const data = await listProjectEnvironments(projectId);
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

export default EnvironmentsPage;
