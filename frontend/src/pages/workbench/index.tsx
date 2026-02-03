import { PageContainer } from '@ant-design/pro-components';
import { history, useLocation, useModel, useRequest } from '@umijs/max';
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Grid,
  Input,
  Modal,
  Select,
  Space,
  Typography,
} from 'antd';
import React, { useEffect, useMemo, useState } from 'react';

import { InspectorPane } from '@/features/agui/components/InspectorPane';
import { confirmBusySwitch } from '@/features/agui/components/xchat/confirmBusySwitch';
import { useAguiThreads } from '@/features/agui/components/xchat/useAguiThreads';
import { XChatPanel } from '@/features/agui/components/xchat/XChatPanel';
import { XChatThreadList } from '@/features/agui/components/xchat/XChatThreadList';
import { listAgents } from '@/services/controlPlane/agents';
import {
  clearControlPlaneBaseURL,
  getControlPlaneBaseURL,
  getSuggestedControlPlaneBaseURL,
  setControlPlaneBaseURL,
} from '@/services/controlPlane/config';
import { getAccessToken } from '@/services/controlPlane/token';
import type { ControlPlaneAgent } from '@/services/controlPlane/types';

function normalizeBaseURL(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  return v.endsWith('/') ? v.slice(0, -1) : v;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

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

const WorkbenchPage: React.FC = () => {
  const agui = useModel('agui');
  const { message, modal } = App.useApp();
  const location = useLocation();
  const screens = Grid.useBreakpoint();

  const [threadsDrawerOpen, setThreadsDrawerOpen] = useState(false);
  const [inspectorDrawerOpen, setInspectorDrawerOpen] = useState(false);

  const token = getAccessToken();
  const currentBaseURL = getControlPlaneBaseURL();
  const [baseURLInput, setBaseURLInput] = useState<string>(
    currentBaseURL || getSuggestedControlPlaneBaseURL(),
  );

  const threads = useAguiThreads({
    agentId: agui.selectedAgentId || undefined,
    limit: 100,
    enabled: true,
  });

  const switchToThread = async (threadId: string) => {
    const next = String(threadId || '').trim();
    if (!next) return;
    if (next === agui.threadId) return;

    if (agui.busy) {
      const choice = await confirmBusySwitch({
        modal,
        title: '切换 Thread？',
        description:
          '当前 run 仍在执行。你可以仅断开连接（run 会在服务端继续），或者先取消 run 再切换。',
        canCancel: Boolean(agui.threadId && agui.activeRunId),
      });

      if (choice === 'stay') return;
      if (choice === 'cancel') {
        try {
          await agui.requestCancel();
          message.success('Cancel requested');
        } catch (e) {
          console.log(e);
          message.error('Cancel failed');
          return;
        }
      }
    }

    agui.stopStream();
    history.push({
      pathname: location.pathname,
      search: setQueryParam(location.search, 'threadId', next),
    });
  };

  const [resumeMessage, setResumeMessage] = useState<string>('approve');
  const [resumeInputJson, setResumeInputJson] = useState<string>(
    JSON.stringify({ approved: true }, null, 2),
  );

  const agentsReq = useRequest(async () => {
    return await listAgents({ skipErrorHandler: true });
  });

  // Allow deep-linking to an agent after /connect.
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const agentId = sp.get('agentId') || '';
    if (agentId && agentId !== agui.selectedAgentId) {
      agui.setSelectedAgentId(agentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Allow deep-linking to a threadId.
  useEffect(() => {
    const tid = getQueryParam(location.search, 'threadId');
    if (!tid) return;
    if (tid === agui.threadId) return;

    agui
      .loadSnapshot(tid)
      .then(() => {
        message.success('Snapshot loaded');
      })
      .catch((e: unknown) => {
        console.log(e);
        message.error('Failed to load snapshot');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const agentOptions = useMemo(() => {
    const agents = (agentsReq.data || []) as ControlPlaneAgent[];
    return agents.map((a) => ({
      label: `${a.displayName} (${a.agentId})`,
      value: a.agentId,
    }));
  }, [agentsReq.data]);

  const agentsLoadError = agentsReq.error;
  const showAgentLoadError = Boolean(agentsLoadError);

  const onCreateThread = async () => {
    try {
      const tid = await agui.ensureThread();
      history.push({
        pathname: location.pathname,
        search: setQueryParam(location.search, 'threadId', tid),
      });
      message.success(`Thread created: ${tid}`);
      threads.refresh();
    } catch (e) {
      console.log(e);
      message.error('Failed to create thread (check agent selection)');
    }
  };

  const onRestoreSnapshot = async (id: string) => {
    const tid = id.trim();
    if (!tid) return;
    try {
      await agui.loadSnapshot(tid);
      history.push({
        pathname: location.pathname,
        search: setQueryParam(location.search, 'threadId', tid),
      });
      message.success('Snapshot loaded');
      threads.refresh();
    } catch (e) {
      console.log(e);
      message.error('Failed to load snapshot');
    }
  };

  const onRefreshSnapshot = async () => {
    if (!agui.threadId) {
      message.warning('No threadId');
      return;
    }
    await onRestoreSnapshot(agui.threadId);
  };

  const drawerWidth = screens.lg ? 520 : '92vw';
  const chatHeaderExtra = (
    <Space size={8} wrap>
      <Button size="small" onClick={() => setThreadsDrawerOpen(true)}>
        Threads
      </Button>
      <Button size="small" onClick={() => setInspectorDrawerOpen(true)}>
        Inspector
      </Button>
    </Space>
  );

  return (
    <PageContainer>
      <Card title="Chat" size="small" extra={chatHeaderExtra}>
        <XChatPanel title={undefined} session={agui} />
      </Card>

      <Drawer
        title="Threads"
        open={threadsDrawerOpen}
        onClose={() => setThreadsDrawerOpen(false)}
        placement="left"
        width={drawerWidth}
        destroyOnClose
      >
        <Card title="Thread" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Typography.Text type="secondary">Control Plane URL</Typography.Text>
              <Input.Search
                style={{ marginTop: 4 }}
                allowClear
                value={baseURLInput}
                placeholder="(blank = use /v1 proxy)"
                onChange={(e) => setBaseURLInput(e.target.value)}
                enterButton="Apply"
                onSearch={(v) => {
                  const next = normalizeBaseURL(String(v || ''));
                  if (!next) {
                    clearControlPlaneBaseURL();
                    message.success('Switched to proxy mode (/v1) — reloading…');
                    window.location.reload();
                    return;
                  }
                  setControlPlaneBaseURL(next);
                  message.success('Control Plane URL saved — reloading…');
                  window.location.reload();
                }}
              />
              <div style={{ marginTop: 6 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Active: {currentBaseURL ? currentBaseURL : 'proxy (/v1)'}
                </Typography.Text>
              </div>
            </div>

            {!token ? (
              <Alert
                type="warning"
                showIcon
                message="Not logged in"
                description={
                  <span>
                    You need a Control Plane token to list agents. Use{' '}
                    <Typography.Text code>/user/login</Typography.Text> or{' '}
                    <Typography.Text code>/connect</Typography.Text>.
                  </span>
                }
              />
            ) : null}

            {showAgentLoadError ? (
              <Alert
                type="error"
                showIcon
                message="Failed to load agents"
                description={
                  <span>
                    Check Control Plane URL/token. You can also type agentId manually.
                  </span>
                }
                action={
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button size="small" onClick={() => agentsReq.refresh()}>
                      Retry
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        clearControlPlaneBaseURL();
                        window.location.reload();
                      }}
                    >
                      Use Proxy (/v1)
                    </Button>
                  </Space>
                }
              />
            ) : null}

            <div>
              <Typography.Text type="secondary">Agent</Typography.Text>
              <Select
                style={{ width: '100%', marginTop: 4 }}
                placeholder="Select an agent"
                loading={agentsReq.loading}
                options={agentOptions}
                notFoundContent={
                  agentsReq.loading
                    ? 'Loading…'
                    : showAgentLoadError
                      ? 'Failed to load agents'
                      : 'No agents'
                }
                value={agui.selectedAgentId || undefined}
                onChange={(v) => {
                  const next = String(v || '');
                  const doSwitch = () => {
                    agui.reset();
                    agui.setSelectedAgentId(next);
                    history.push({
                      pathname: location.pathname,
                      search: setQueryParam(
                        setQueryParam(location.search, 'threadId', undefined),
                        'agentId',
                        next,
                      ),
                    });
                  };

                  if (!agui.busy) {
                    doSwitch();
                    return;
                  }

                  confirmBusySwitch({
                    modal,
                    title: '切换 Agent？',
                    description:
                      '当前 run 仍在执行。切换 agent 会清空当前 session 状态。',
                    canCancel: Boolean(agui.threadId && agui.activeRunId),
                  }).then(async (choice) => {
                    if (choice === 'stay') return;
                    if (choice === 'cancel') {
                      try {
                        await agui.requestCancel();
                        message.success('Cancel requested');
                      } catch (e) {
                        console.log(e);
                        message.error('Cancel failed');
                        return;
                      }
                    }
                    agui.stopStream();
                    doSwitch();
                  });
                }}
              />
              {agentOptions.length === 0 ? (
                <Input
                  style={{ marginTop: 8 }}
                  placeholder="agentId (manual) e.g. sql_agent"
                  value={agui.selectedAgentId || ''}
                  onChange={(e) => {
                    const next = e.target.value;
                    const doSwitch = () => {
                      agui.reset();
                      agui.setSelectedAgentId(next);
                      history.push({
                        pathname: location.pathname,
                        search: setQueryParam(
                          setQueryParam(location.search, 'threadId', undefined),
                          'agentId',
                          next,
                        ),
                      });
                    };

                    if (!agui.busy) {
                      doSwitch();
                      return;
                    }

                    confirmBusySwitch({
                      modal,
                      title: '切换 Agent？',
                      description:
                        '当前 run 仍在执行。切换 agent 会清空当前 session 状态。',
                      canCancel: Boolean(agui.threadId && agui.activeRunId),
                    }).then(async (choice) => {
                      if (choice === 'stay') return;
                      if (choice === 'cancel') {
                        try {
                          await agui.requestCancel();
                          message.success('Cancel requested');
                        } catch (err) {
                          console.log(err);
                          message.error('Cancel failed');
                          return;
                        }
                      }
                      agui.stopStream();
                      doSwitch();
                    });
                  }}
                />
              ) : null}
            </div>

            <XChatThreadList
              threads={threads.threads}
              loading={threads.loading}
              activeKey={agui.threadId || undefined}
              onRefresh={() => threads.refresh()}
              disableNew={!agui.selectedAgentId}
              onNewThread={async () => {
                await onCreateThread();
                setThreadsDrawerOpen(false);
              }}
              onRestoreThread={async (tid) => {
                await onRestoreSnapshot(tid);
                setThreadsDrawerOpen(false);
              }}
              onActiveChange={(tid) => {
                void (async () => {
                  await switchToThread(tid);
                  setThreadsDrawerOpen(false);
                })();
              }}
            />
          </Space>
        </Card>
      </Drawer>

      <Drawer
        title="Inspector"
        open={inspectorDrawerOpen}
        onClose={() => setInspectorDrawerOpen(false)}
        placement="right"
        width={drawerWidth}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Card title="Run" size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Typography.Text type="secondary">activeRunId</Typography.Text>
                <div style={{ marginTop: 6 }}>
                  <Typography.Text code>{agui.activeRunId || '-'}</Typography.Text>
                </div>
              </div>

              <Space style={{ width: '100%' }} direction="vertical">
                <Button
                  danger
                  block
                  onClick={async () => {
                    try {
                      await agui.requestCancel();
                      message.success('Cancel requested');
                    } catch (e) {
                      console.log(e);
                      message.error('Cancel failed');
                    }
                  }}
                  disabled={!agui.busy || !agui.threadId || !agui.activeRunId}
                >
                  Cancel
                </Button>
                <Button block onClick={onRefreshSnapshot} disabled={!agui.threadId}>
                  Refresh Snapshot
                </Button>
              </Space>
            </Space>
          </Card>

          <Card title="Inspector" size="small">
            <InspectorPane messages={agui.messages} state={agui.state} />
          </Card>
        </Space>
      </Drawer>

      <Modal
        open={!!agui.interrupt}
        title={agui.interrupt?.title || 'Interrupt'}
        okText="Resume"
        cancelText="Close"
        onCancel={() => agui.closeInterrupt()}
        onOk={async () => {
          let parsed: any = {};
          try {
            parsed = JSON.parse(resumeInputJson || '{}');
          } catch {
            message.error('Resume input must be valid JSON');
            return;
          }
          const res = await agui.resumeInterrupt({
            message: resumeMessage,
            input: parsed && typeof parsed === 'object' ? parsed : {},
          });
          if (!res.ok) {
            message.error('Failed to resume');
            return;
          }
          message.success('Resume started');
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {agui.interrupt?.description && (
            <Typography.Paragraph>{agui.interrupt.description}</Typography.Paragraph>
          )}

          <div>
            <Typography.Text type="secondary">User message</Typography.Text>
            <Input
              style={{ marginTop: 4 }}
              value={resumeMessage}
              onChange={(e) => setResumeMessage(e.target.value)}
            />
          </div>

          <div>
            <Typography.Text type="secondary">Resume input (JSON)</Typography.Text>
            <Input.TextArea
              style={{ marginTop: 4 }}
              autoSize={{ minRows: 4, maxRows: 10 }}
              value={resumeInputJson}
              onChange={(e) => setResumeInputJson(e.target.value)}
            />
          </div>

          <div>
            <Typography.Text type="secondary">Payload</Typography.Text>
            <pre style={{ marginTop: 8, marginBottom: 0, overflowX: 'auto' }}>
              {formatJson(agui.interrupt)}
            </pre>
          </div>
        </Space>
      </Modal>
    </PageContainer>
  );
};

export default WorkbenchPage;
