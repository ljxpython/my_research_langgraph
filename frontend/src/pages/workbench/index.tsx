import { PageContainer } from '@ant-design/pro-components';
import { useLocation, useModel, useRequest } from '@umijs/max';
import {
  App,
  Alert,
  Button,
  Card,
  Collapse,
  Col,
  Input,
  List,
  Modal,
  Row,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import React, { useEffect, useMemo, useState } from 'react';

import { listAgents } from '@/services/controlPlane/agents';
import {
  clearControlPlaneBaseURL,
  getControlPlaneBaseURL,
  getSuggestedControlPlaneBaseURL,
  setControlPlaneBaseURL,
} from '@/services/controlPlane/config';
import { getAccessToken } from '@/services/controlPlane/token';
import type {
  AguiMessage,
  AguiState,
  ControlPlaneAgent,
} from '@/services/controlPlane/types';

function normalizeBaseURL(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  return v.endsWith('/') ? v.slice(0, -1) : v;
}

function formatJson(value: any): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

function coerceAguiState(value: any): AguiState {
  const ui = value?.ui && typeof value.ui === 'object' ? value.ui : {};
  const app = value?.app && typeof value.app === 'object' ? value.app : {};
  const debug = value?.debug && typeof value.debug === 'object' ? value.debug : {};
  return { ui, app, debug };
}

function roleToTagColor(role: string): string {
  switch (role) {
    case 'user':
      return 'geekblue';
    case 'assistant':
      return 'green';
    case 'tool':
      return 'gold';
    case 'system':
      return 'default';
    default:
      return 'default';
  }
}

function parseToolArgs(argText: string): any {
  try {
    return JSON.parse(argText);
  } catch {
    return undefined;
  }
}

const WorkbenchPage: React.FC = () => {
  const agui = useModel('agui');
  const { message } = App.useApp();
  const location = useLocation();

  const token = getAccessToken();
  const currentBaseURL = getControlPlaneBaseURL();
  const [baseURLInput, setBaseURLInput] = useState<string>(
    currentBaseURL || getSuggestedControlPlaneBaseURL(),
  );

  const [restoreThreadId, setRestoreThreadId] = useState<string>('');
  const [composer, setComposer] = useState<string>('');

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

  const agentOptions = useMemo(() => {
    const agents = (agentsReq.data || []) as ControlPlaneAgent[];
    return agents.map((a) => ({
      label: `${a.displayName} (${a.agentId})`,
      value: a.agentId,
    }));
  }, [agentsReq.data]);

  const agentsLoadError = agentsReq.error as any;
  const showAgentLoadError = Boolean(agentsLoadError);

  const runStatusTag = useMemo(() => {
    if (agui.busy) {
      return (
        <Tag color="processing">Running</Tag>
      );
    }
    return <Tag color="default">Idle</Tag>;
  }, [agui.busy]);

  const state = useMemo(() => coerceAguiState(agui.state), [agui.state]);

  const onCreateThread = async () => {
    try {
      const tid = await agui.ensureThread();
      message.success(`Thread created: ${tid}`);
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
      message.success('Snapshot loaded');
    } catch (e) {
      console.log(e);
      message.error('Failed to load snapshot');
    }
  };

  const onSend = async () => {
    const text = composer;
    setComposer('');

    const res = await agui.sendUserMessage(text);
    if (!res.ok) {
      switch ((res as any).reason) {
        case 'NO_AGENT':
          message.warning('Select an agent first');
          break;
        case 'NO_THREAD':
          message.warning('Create or restore a thread first');
          break;
        case 'BUSY':
          message.warning('Thread is busy (cancel or wait)');
          break;
        case 'THREAD_BUSY':
          message.warning('THREAD_BUSY: another run is active; you can cancel it');
          break;
        default:
          message.error('Failed to start run');
      }
    }
  };

  const onCancel = async () => {
    try {
      await agui.requestCancel();
      message.success('Cancel requested');
    } catch (e) {
      console.log(e);
      message.error('Cancel failed');
    }
  };

  const onRefreshSnapshot = async () => {
    if (!agui.threadId) {
      message.warning('No threadId');
      return;
    }
    await onRestoreSnapshot(agui.threadId);
  };

  const renderMessage = (m: AguiMessage) => {
    const role = m.role || 'unknown';

    const toolCalls = Array.isArray(m.toolCalls) ? m.toolCalls : [];

    return (
      <List.Item>
        <div style={{ width: '100%' }}>
          <Space size={8} style={{ marginBottom: 4 }} wrap>
            <Tag color={roleToTagColor(role)}>
              {role}
            </Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {m.id}
            </Typography.Text>
            {m.toolCallId && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                toolCallId={m.toolCallId}
              </Typography.Text>
            )}
          </Space>

          {role === 'tool' ? (
            <pre
              style={{
                margin: 0,
                padding: 12,
                background: 'rgba(0,0,0,0.03)',
                borderRadius: 6,
                overflowX: 'auto',
              }}
            >
              {m.content}
            </pre>
          ) : (
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}>
              {m.content}
            </Typography.Paragraph>
          )}

          {toolCalls.length > 0 && (
            <Collapse
              size="small"
              items={toolCalls.map((tc, idx) => {
                const argText = tc?.function?.arguments || '{}';
                const parsedArgs = parseToolArgs(argText);
                return {
                  key: tc.id || String(idx),
                  label: (
                    <Space size={8} wrap>
                      <Typography.Text>{tc.function?.name || 'tool'}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {tc.id}
                      </Typography.Text>
                    </Space>
                  ),
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size={8}>
                      <div>
                        <Typography.Text type="secondary">arguments</Typography.Text>
                        <pre style={{ margin: 0, overflowX: 'auto' }}>
                          {parsedArgs ? formatJson(parsedArgs) : argText}
                        </pre>
                      </div>
                    </Space>
                  ),
                };
              })}
            />
          )}
        </div>
      </List.Item>
    );
  };

  return (
    <PageContainer>
      <Row gutter={[16, 16]}>
        <Col xs={{ span: 24, order: 1 }} lg={{ span: 6, order: 1 }}>
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
                  onChange={(v) => agui.setSelectedAgentId(v)}
                />
                {agentOptions.length === 0 ? (
                  <Input
                    style={{ marginTop: 8 }}
                    placeholder="agentId (manual) e.g. sql_agent"
                    value={agui.selectedAgentId || ''}
                    onChange={(e) => agui.setSelectedAgentId(e.target.value)}
                  />
                ) : null}
              </div>

              <Button
                type="primary"
                block
                disabled={!agui.selectedAgentId}
                onClick={onCreateThread}
              >
                Create Thread
              </Button>

              <div>
                <Typography.Text type="secondary">Restore from threadId</Typography.Text>
                <Input.Search
                  style={{ marginTop: 4 }}
                  placeholder="th_..."
                  value={restoreThreadId}
                  onChange={(e) => setRestoreThreadId(e.target.value)}
                  onSearch={onRestoreSnapshot}
                  enterButton="Load"
                />
              </div>

              <div>
                <Typography.Text type="secondary">Current</Typography.Text>
                <div style={{ marginTop: 6 }}>
                  <Typography.Text code>{agui.threadId || '-'}</Typography.Text>
                </div>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={{ span: 24, order: 2 }} lg={{ span: 12, order: 2 }}>
          <Card
            title="Chat"
            size="small"
            extra={
              <Space size={8} wrap>
                {runStatusTag}
                {agui.activeRunId && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    run={agui.activeRunId}
                  </Typography.Text>
                )}
              </Space>
            }
          >
            <div style={{ minHeight: 240, maxHeight: 520, overflow: 'auto' }}>
              <List
                dataSource={agui.messages}
                locale={{ emptyText: 'No messages yet' }}
                renderItem={renderMessage}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <Input.TextArea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder={
                  agui.busy
                    ? 'Run in progress...'
                    : 'Type a message and click Send'
                }
                autoSize={{ minRows: 2, maxRows: 6 }}
                disabled={agui.busy}
              />
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  type="primary"
                  onClick={onSend}
                  disabled={agui.busy || !agui.threadId || !agui.selectedAgentId}
                >
                  Send
                </Button>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={{ span: 24, order: 3 }} lg={{ span: 6, order: 3 }}>
          <Card title="Run" size="small" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Typography.Text type="secondary">Status</Typography.Text>
                <div style={{ marginTop: 6 }}>{runStatusTag}</div>
              </div>

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
                  onClick={onCancel}
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

          <Card title="State" size="small">
            <Tabs
              size="small"
              items={[
                {
                  key: 'ui',
                  label: 'ui',
                  children: (
                    <pre style={{ margin: 0, overflowX: 'auto' }}>
                      {formatJson(state.ui)}
                    </pre>
                  ),
                },
                {
                  key: 'app',
                  label: 'app',
                  children: (
                    <pre style={{ margin: 0, overflowX: 'auto' }}>
                      {formatJson(state.app)}
                    </pre>
                  ),
                },
                {
                  key: 'debug',
                  label: 'debug',
                  children: (
                    <pre style={{ margin: 0, overflowX: 'auto' }}>
                      {formatJson(state.debug)}
                    </pre>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

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
