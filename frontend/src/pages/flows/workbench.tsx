import { PageContainer, ProCard } from '@ant-design/pro-components';
import { useLocation } from '@umijs/max';
import { App, Button, Drawer, Grid, Input, Space, Tabs, Typography } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';

import { InspectorPane } from '@/features/agui/components/InspectorPane';
import { confirmBusySwitch } from '@/features/agui/components/xchat/confirmBusySwitch';
import { XChatPanel } from '@/features/agui/components/xchat/XChatPanel';
import { XChatThreadList } from '@/features/agui/components/xchat/XChatThreadList';
import { defaultControlPlaneClient } from '@/features/agui/defaultClient';
import { useAguiSession } from '@/features/agui/useAguiSession';

import { upsertFlowChatThread } from '@/services/controlPlane/flows';
import { parseControlPlaneError } from '@/services/controlPlane/runs';

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

const FlowSectionTab: React.FC<{
  flowInstanceId: string;
  section: FlowSectionConfig;
  active: boolean;
  onMetaChange?: (sectionKey: string, meta: {
    busy: boolean;
    threadId: string;
    activeRunId: string;
  }) => void;
  tabSwitchRequest?: { id: number; fromKey: string; toKey: string; action: 'cancel' } | null;
  onTabSwitchRequestHandled?: (req: { id: number; ok: boolean }) => void;
}> = ({ flowInstanceId, section, active, onMetaChange, tabSwitchRequest, onTabSwitchRequestHandled }) => {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const [threadDrawerOpen, setThreadDrawerOpen] = useState(false);
  const [inspectorDrawerOpen, setInspectorDrawerOpen] = useState(false);

  const session = useAguiSession(defaultControlPlaneClient, {
    lockedAgentId: section.agentId,
  });

  const [bindingThreadId, setBindingThreadId] = useState<string>('');
  const [bindingLoading, setBindingLoading] = useState<boolean>(false);
  const [bindingError, setBindingError] = useState<string>('');

  const handledSwitchReqIdRef = React.useRef<number>(0);

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
      const tid = resp.threadId;
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

  useEffect(() => {
    onMetaChange?.(section.sectionKey, {
      busy: session.busy,
      threadId: session.threadId,
      activeRunId: session.activeRunId,
    });
  }, [onMetaChange, section.sectionKey, session.activeRunId, session.busy, session.threadId]);

  useEffect(() => {
    if (!tabSwitchRequest) return;
    if (!active) return;
    if (tabSwitchRequest.fromKey !== section.sectionKey) return;
    if (handledSwitchReqIdRef.current === tabSwitchRequest.id) return;
    handledSwitchReqIdRef.current = tabSwitchRequest.id;

    (async () => {
      try {
        await session.requestCancel();
        message.success('Cancel requested');
      } catch (e) {
        console.log(e);
        message.error('Cancel failed');
        onTabSwitchRequestHandled?.({ id: tabSwitchRequest.id, ok: false });
        return;
      } finally {
        session.stopStream();
      }
      onTabSwitchRequestHandled?.({ id: tabSwitchRequest.id, ok: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, section.sectionKey, tabSwitchRequest]);

  const inspector = <InspectorPane messages={session.messages} state={session.state} />;
  const drawerWidth = screens.lg ? 520 : '92vw';

  return (
    <ProCard bordered={false} gutter={16} style={{ minHeight: 520 }}>
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <Space size={8} wrap>
            <Typography.Text type="secondary">flowInstanceId</Typography.Text>
            <Typography.Text code>{flowInstanceId}</Typography.Text>
            <Typography.Text type="secondary">section</Typography.Text>
            <Typography.Text code>{section.sectionKey}</Typography.Text>
            <Typography.Text type="secondary">agentId</Typography.Text>
            <Typography.Text code>{section.agentId}</Typography.Text>
            {bindingLoading ? <Typography.Text type="secondary">Binding…</Typography.Text> : null}
          </Space>

          <Space size={8} wrap>
            <Button size="small" onClick={() => setThreadDrawerOpen(true)}>
              Thread
            </Button>
            <Button size="small" onClick={() => setInspectorDrawerOpen(true)}>
              Inspector
            </Button>
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

        {bindingError ? <Typography.Text type="danger">{bindingError}</Typography.Text> : null}

        <XChatPanel
          title={section.title}
          session={session}
          // 对模块分区：必须先绑定映射得到 threadId，避免 sendUserMessage 自动创建“游离 thread”。
          requireThread
        />
      </Space>

      <Drawer
        title="Thread"
        open={threadDrawerOpen}
        onClose={() => setThreadDrawerOpen(false)}
        placement="left"
        width={drawerWidth}
        destroyOnClose
      >
        <XChatThreadList
          title="Thread"
          threads={
            bindingThreadId
              ? [
                  {
                    threadId: bindingThreadId,
                    agentId: section.agentId,
                    busy: session.busy,
                    activeRunId: session.activeRunId || null,
                    updatedAt: Date.now(),
                  },
                ]
              : []
          }
          loading={bindingLoading}
          activeKey={bindingThreadId || undefined}
          disableNew
          disableSelect
        />
      </Drawer>

      <Drawer
        title="Inspector"
        open={inspectorDrawerOpen}
        onClose={() => setInspectorDrawerOpen(false)}
        placement="right"
        width={drawerWidth}
        destroyOnClose
      >
        {inspector}
      </Drawer>
    </ProCard>
  );
};

const FlowWorkbenchPage: React.FC = () => {
  const location = useLocation();
  const { message, modal } = App.useApp();

  const initialFlowId = useMemo(
    () => getQueryParam(location.search, 'flowInstanceId') || '',
    [location.search],
  );

  const [flowInstanceId, setFlowInstanceId] = useState<string>(initialFlowId);
  const [flowInput, setFlowInput] = useState<string>(initialFlowId);

  const [sections] = useState<FlowSectionConfig[]>(DEFAULT_SECTIONS);
  const [activeKey, setActiveKey] = useState<string>(sections[0]?.sectionKey || 'analysis');

  const [metaBySectionKey, setMetaBySectionKey] = useState<
    Record<string, { busy: boolean; threadId: string; activeRunId: string }>
  >({});
  const [tabSwitchRequest, setTabSwitchRequest] = useState<
    { id: number; fromKey: string; toKey: string; action: 'cancel' } | null
  >(null);
  const tabSwitchReqSeqRef = React.useRef(1);

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
            onMetaChange={(k, meta) => {
              setMetaBySectionKey((prev) => ({ ...prev, [k]: meta }));
            }}
            tabSwitchRequest={tabSwitchRequest}
            onTabSwitchRequestHandled={(res) => {
              if (!tabSwitchRequest) return;
              if (res.id !== tabSwitchRequest.id) return;
              if (!res.ok) {
                setTabSwitchRequest(null);
                return;
              }
              setActiveKey(tabSwitchRequest.toKey);
              setTabSwitchRequest(null);
            }}
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
          一个页面多分区（Tabs），每个分区固定 agentId，并通过 Control Plane 映射绑定 thread。
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
            onChange={async (k) => {
              const next = String(k || '');
              if (!next) return;
              if (next === activeKey) return;

              const meta = metaBySectionKey[activeKey];
              if (meta?.busy) {
                const choice = await confirmBusySwitch({
                  modal,
                  title: '切换分区？',
                  description:
                    '当前分区的 run 仍在执行。你可以仅断开连接并切换，或先取消 run 再切换。',
                  canCancel: Boolean(meta.threadId && meta.activeRunId),
                });

                if (choice === 'stay') return;
                if (choice === 'cancel') {
                  setTabSwitchRequest({
                    id: tabSwitchReqSeqRef.current++,
                    fromKey: activeKey,
                    toKey: next,
                    action: 'cancel',
                  });
                  return;
                }
              }

              setActiveKey(next);
            }}
            items={tabs}
          />
        </Space>
      </ProCard>
    </PageContainer>
  );
};

export default FlowWorkbenchPage;
