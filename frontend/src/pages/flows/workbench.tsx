import { PageContainer, ProCard } from '@ant-design/pro-components';
import { App, Button, Drawer, Grid, Input, Space, Tabs, Typography } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from '@umijs/max';

import { ChatPane } from '@/features/agui/components/ChatPane';
import { InspectorPane } from '@/features/agui/components/InspectorPane';
import { useAguiSession } from '@/features/agui/useAguiSession';

import { parseControlPlaneError, streamAgentRun } from '@/services/controlPlane/runs';
import { cancelRun, createThread, getThreadSnapshot } from '@/services/controlPlane/threads';
import { upsertFlowChatThread } from '@/services/controlPlane/flows';

import type { ControlPlaneClient } from '@/features/agui/controlPlaneClient';

type FlowSectionConfig = {
  sectionKey: string;
  title: string;
  agentId: string;
};

const DEFAULT_SECTIONS: FlowSectionConfig[] = [
  { sectionKey: 'analysis', title: 'AI 分析', agentId: 'sql_agent' },
  { sectionKey: 'cases', title: 'AI 用例', agentId: 'sql_agent' },
];

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

const defaultClient: ControlPlaneClient = {
  createThread,
  getThreadSnapshot,
  cancelRun,
  streamAgentRun,
  parseError: parseControlPlaneError,
};

const FlowSectionTab: React.FC<{
  flowInstanceId: string;
  section: FlowSectionConfig;
  active: boolean;
}> = ({ flowInstanceId, section, active }) => {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const session = useAguiSession(defaultClient, { lockedAgentId: section.agentId });

  const [bindingThreadId, setBindingThreadId] = useState<string>('');
  const [bindingLoading, setBindingLoading] = useState<boolean>(false);
  const [bindingError, setBindingError] = useState<string>('');

  useEffect(() => {
    // flowInstance 切换时，必须清空绑定与会话状态，避免把旧 thread 误用到新 flow。
    setBindingThreadId('');
    setBindingError('');
    session.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowInstanceId, section.sectionKey, section.agentId]);

  const ensureBinding = async () => {
    if (!flowInstanceId) return;
    setBindingLoading(true);
    setBindingError('');
    try {
      const resp = await upsertFlowChatThread(
        flowInstanceId,
        section.sectionKey,
        { agentId: section.agentId, executionTargetId: 'local-dev' },
        { skipErrorHandler: true },
      );
      const tid = (resp as any)?.threadId;
      if (typeof tid !== 'string' || !tid) {
        throw new Error('invalid threadId');
      }
      setBindingThreadId(tid);
      await session.loadSnapshot(tid);
    } catch (e: any) {
      const parsed = parseControlPlaneError(e);
      if (parsed?.status === 409 && parsed.code === 'FLOW_SECTION_AGENT_MISMATCH') {
        setBindingError('该分区已绑定到不同的 agentId（配置变更导致冲突）。');
      } else {
        setBindingError(parsed?.message || e?.message || 'Failed to bind thread');
      }
    } finally {
      setBindingLoading(false);
    }
  };

  useEffect(() => {
    // 只在激活时才确保绑定/恢复，避免后台触发大量 snapshot。
    if (!active) {
      session.stopStream();
      return;
    }
    if (!bindingThreadId && flowInstanceId) {
      ensureBinding().catch(() => {
        // error already handled
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, flowInstanceId]);

  const inspector = (
    <InspectorPane messages={session.messages as any} state={session.state as any} />
  );

  return (
    <ProCard split="vertical" bordered={false} gutter={16} style={{ minHeight: 520 }}>
      <ProCard colSpan={{ xs: 24, lg: 16, xl: 17 }} bordered={false}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <Space size={8} wrap>
              <Typography.Text type="secondary">flowInstanceId</Typography.Text>
              <Typography.Text code>{flowInstanceId}</Typography.Text>
              <Typography.Text type="secondary">section</Typography.Text>
              <Typography.Text code>{section.sectionKey}</Typography.Text>
              <Typography.Text type="secondary">agentId</Typography.Text>
              <Typography.Text code>{section.agentId}</Typography.Text>
              {bindingLoading ? (
                <Typography.Text type="secondary">Binding…</Typography.Text>
              ) : null}
            </Space>
            <Space size={8} wrap>
              {!screens.lg ? (
                <Button size="small" onClick={() => setInspectorOpen(true)}>
                  Inspector
                </Button>
              ) : null}
              <Button
                size="small"
                onClick={() => {
                  message.success('Refreshing snapshot…');
                  session.loadSnapshot(session.threadId);
                }}
                disabled={!session.threadId}
                loading={bindingLoading || session.snapshotLoading}
              >
                Refresh
              </Button>
            </Space>
          </div>

          {bindingError ? (
            <Typography.Text type="danger">{bindingError}</Typography.Text>
          ) : null}

          <ChatPane
            title={section.title}
            session={session as any}
            // 对模块分区：必须先绑定映射得到 threadId，避免 sendUserMessage 自动创建“游离 thread”。
            requireThread
          />
        </Space>
      </ProCard>

      {screens.lg ? (
        <ProCard colSpan={{ xs: 0, lg: 8, xl: 7 }} bordered={false}>
          {inspector}
        </ProCard>
      ) : null}

      <Drawer
        title="Inspector"
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        placement="right"
        width="92vw"
        destroyOnClose
      >
        {inspector}
      </Drawer>
    </ProCard>
  );
};

const FlowWorkbenchPage: React.FC = () => {
  const location = useLocation();
  const { message } = App.useApp();

  const initialFlowId = useMemo(
    () => getQueryParam(location.search, 'flowInstanceId') || '',
    [location.search],
  );

  const [flowInstanceId, setFlowInstanceId] = useState<string>(initialFlowId);
  const [flowInput, setFlowInput] = useState<string>(initialFlowId);

  const [sections] = useState<FlowSectionConfig[]>(DEFAULT_SECTIONS);
  const [activeKey, setActiveKey] = useState<string>(sections[0]?.sectionKey || 'analysis');

  useEffect(() => {
    // URL 变化时同步输入框。
    setFlowInstanceId(initialFlowId);
    setFlowInput(initialFlowId);
  }, [initialFlowId]);

  const tabs = useMemo(
    () =>
      sections.map((s) => ({
        key: s.sectionKey,
        label: (
          <Space size={8} wrap>
            <Typography.Text strong>{s.title}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {s.agentId}
            </Typography.Text>
          </Space>
        ),
        children: flowInstanceId ? (
          <FlowSectionTab
            flowInstanceId={flowInstanceId}
            section={s}
            active={activeKey === s.sectionKey}
          />
        ) : (
          <Typography.Text type="secondary">
            Enter a flowInstanceId to start.
          </Typography.Text>
        ),
      })),
    [activeKey, flowInstanceId, sections],
  );

  return (
    <PageContainer
      title="Flow Workbench"
      content={
        <Typography.Text type="secondary">
          一个页面多��分区（Tabs），每个分区固定 agentId，并通过 Control Plane 映射绑定 thread。
        </Typography.Text>
      }
      extra={
        <Space size={8}>
          <Button
            onClick={() => {
              message.info('Open /connect to set baseURL + login');
            }}
          >
            Connect…
          </Button>
        </Space>
      }
    >
      <ProCard bordered={false} style={{ borderRadius: 12 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <Space size={8} wrap>
              <Typography.Text type="secondary">flowInstanceId</Typography.Text>
              <Input.Search
                allowClear
                style={{ width: 360 }}
                placeholder="flow_..."
                value={flowInput}
                onChange={(e) => setFlowInput(e.target.value)}
                enterButton="Open"
                onSearch={(v) => {
                  const next = v.trim();
                  setFlowInstanceId(next);
                  // 轻量同步到 URL query，方便复制链接。
                  const search = setQueryParam(location.search, 'flowInstanceId', next || undefined);
                  window.history.replaceState({}, '', `${location.pathname}${search}`);
                }}
              />
            </Space>
          </div>

          <Tabs
            size="large"
            activeKey={activeKey}
            onChange={(k) => setActiveKey(k)}
            items={tabs}
          />
        </Space>
      </ProCard>
    </PageContainer>
  );
};

export default FlowWorkbenchPage;
