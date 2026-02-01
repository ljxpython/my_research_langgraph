import type { ProColumns } from '@ant-design/pro-components';
import { ModalForm, PageContainer, ProFormText, ProTable } from '@ant-design/pro-components';
import { Link, history } from '@umijs/max';
import { App, Space, Tag, Typography } from 'antd';
import React from 'react';
import { formatPlatformError } from '@/services/platform/request';
import { createProject, listProjects } from '@/services/platform/projects';
import type { PlatformProject } from '@/services/platform/types';

const columns: ProColumns<PlatformProject>[] = [
  {
    title: 'Name',
    dataIndex: 'name',
    ellipsis: true,
    render: (_, record) => {
      return (
        <Space size={10}>
          <Typography.Text strong ellipsis style={{ maxWidth: 280 }}>
            {record.name}
          </Typography.Text>
          {record.status === 'archived' ? <Tag color="default">Archived</Tag> : null}
        </Space>
      );
    },
  },
  {
    title: 'Project ID',
    dataIndex: 'project_id',
    copyable: true,
    ellipsis: true,
  },
  {
    title: 'Status',
    dataIndex: 'status',
    valueType: 'select',
    valueEnum: {
      active: { text: 'Active', status: 'Success' },
      archived: { text: 'Archived', status: 'Default' },
    },
  },
  {
    title: 'Created At',
    dataIndex: 'created_at',
    valueType: 'dateTime',
    width: 190,
  },
  {
    title: 'Quick Links',
    valueType: 'option',
    render: (_, record) => {
      const pid = encodeURIComponent(record.project_id);
      return [
        <Link key="env" to={`/platform/environments?projectId=${pid}`}>
          Environments
        </Link>,
        <Link key="runs" to={`/platform/runs?projectId=${pid}`}>
          Runs
        </Link>,
        <Link key="artifacts" to={`/platform/artifacts?projectId=${pid}`}>
          Artifacts
        </Link>,
        <Link key="audit" to={`/platform/audit?projectId=${pid}`}>
          Audit
        </Link>,
      ];
    },
  },
];

const ProjectsPage: React.FC = () => {
  const { message } = App.useApp();

  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <PageContainer>
      <ProTable<PlatformProject>
        rowKey="project_id"
        search={false}
        options={{ density: false, fullScreen: true, reload: true, setting: true }}
        toolBarRender={() => {
          return [
            <ModalForm<{ name: string; description?: string }>
              key="create"
              title="Create Project"
              open={createOpen}
              onOpenChange={setCreateOpen}
              modalProps={{ destroyOnClose: true }}
              onFinish={async (values) => {
                try {
                  const p = await createProject(values);
                  message.success('Project created');
                  setCreateOpen(false);
                  // Jump to Environments for quick next step.
                  history.push(`/platform/environments?projectId=${encodeURIComponent(p.project_id)}`);
                  return true;
                } catch (err) {
                  message.error(formatPlatformError(err));
                  return false;
                }
              }}
              trigger={
                <a
                  onClick={(e) => {
                    e.preventDefault();
                    setCreateOpen(true);
                  }}
                >
                  New Project
                </a>
              }
            >
              <ProFormText
                name="name"
                label="Name"
                rules={[{ required: true, message: 'Please input project name' }]}
              />
              <ProFormText name="description" label="Description" />
            </ModalForm>,
          ];
        }}
        request={async () => {
          try {
            const data = await listProjects();
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

export default ProjectsPage;
