import type { ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import React from 'react';
import { listAgents } from '@/services/controlPlane/agents';
import type { ControlPlaneAgent } from '@/services/controlPlane/types';

const columns: ProColumns<ControlPlaneAgent>[] = [
  {
    title: 'Agent ID',
    dataIndex: 'agentId',
    copyable: true,
    ellipsis: true,
  },
  {
    title: 'Name',
    dataIndex: 'displayName',
    ellipsis: true,
  },
  {
    title: 'Status',
    dataIndex: 'status',
    valueType: 'select',
    valueEnum: {
      active: { text: 'Active', status: 'Success' },
      disabled: { text: 'Disabled', status: 'Default' },
      inactive: { text: 'Inactive', status: 'Default' },
      archived: { text: 'Archived', status: 'Warning' },
      error: { text: 'Error', status: 'Error' },
    },
  },
];

const AgentsPage: React.FC = () => {
  return (
    <PageContainer>
      <ProTable<ControlPlaneAgent>
        rowKey="agentId"
        search={false}
        options={{ density: false, fullScreen: true, reload: true, setting: true }}
        request={async () => {
          const data = await listAgents();
          return { data, success: true };
        }}
        columns={columns}
      />
    </PageContainer>
  );
};

export default AgentsPage;
