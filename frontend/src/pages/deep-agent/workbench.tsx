import { PageContainer } from '@ant-design/pro-components';
import { App, Button, Card, Drawer, Grid, Space, Tabs } from 'antd';
import React, { useMemo, useState } from 'react';

import { InspectorPane } from '@/features/agui/components/InspectorPane';
import { McpPane } from '@/features/agui/components/McpPane';
import { PlanPane } from '@/features/agui/components/PlanPane';
import { ReasoningPane } from '@/features/agui/components/ReasoningPane';
import { defaultControlPlaneClient } from '@/features/agui/defaultClient';
import { useAguiSession } from '@/features/agui/useAguiSession';
import { XChatPanel } from '@/features/agui/components/xchat/XChatPanel';

const DEEP_AGENT_ID = 'deep_agent';

const DeepAgentWorkbenchPage: React.FC = () => {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const client = useMemo(() => defaultControlPlaneClient, []);
  const session = useAguiSession(client, { lockedAgentId: DEEP_AGENT_ID });

  const drawerWidth = screens.lg ? 520 : '92vw';
  const headerExtra = (
    <Space size={8} wrap>
      <Button
        size="small"
        onClick={async () => {
          try {
            if (!session.threadId) {
              const tid = await session.ensureThread();
              message.success(`Thread created: ${tid}`);
            } else {
              await session.loadSnapshot(session.threadId);
              message.success('Snapshot refreshed');
            }
          } catch (e) {
            console.log(e);
            message.error('Failed to init/refresh thread');
          }
        }}
      >
        Init/Refresh
      </Button>
      <Button size="small" onClick={() => setInspectorOpen(true)}>
        Inspector
      </Button>
    </Space>
  );

  return (
    <PageContainer>
      <Card title="Deep Agent" size="small" extra={headerExtra}>
        <XChatPanel title={undefined} session={session} />
      </Card>

      <Drawer
        title="Inspector"
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        placement="right"
        width={drawerWidth}
        destroyOnClose
      >
        <Tabs
          size="large"
          items={[
            {
              key: 'tools',
              label: 'Tools',
              children: <InspectorPane messages={session.messages} state={session.state} />,
            },
            {
              key: 'plan',
              label: 'Plan',
              children: <PlanPane plan={(session as any).plan} />,
            },
            {
              key: 'reasoning',
              label: 'Reasoning',
              children: <ReasoningPane value={(session as any).reasoningSummary} />,
            },
            {
              key: 'mcp',
              label: 'MCP',
              children: <McpPane events={((session as any).mcpEvents as any[]) || []} />,
            },
          ]}
        />
      </Drawer>
    </PageContainer>
  );
};

export default DeepAgentWorkbenchPage;
