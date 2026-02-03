import { PageContainer, ProCard, ProForm, ProFormText } from '@ant-design/pro-components';
import { App, Badge, Button, Divider, Space, Typography } from 'antd';
import React, { useMemo, useState } from 'react';

import type { ControlPlaneLoginResponse } from '@/services/controlPlane/types';

import { getSuggestedControlPlaneBaseURL, setControlPlaneBaseURL } from '@/services/controlPlane/config';
import { setAccessToken, clearAccessToken } from '@/services/controlPlane/token';

type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

function normalizeBaseURL(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  return v.endsWith('/') ? v.slice(0, -1) : v;
}

async function loginWithFetch(params: {
  baseURL: string;
  username: string;
  password: string;
}): Promise<ControlPlaneLoginResponse> {
  const url = `${params.baseURL}/v1/auth/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ username: params.username, password: params.password }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = (await res.json()) as ControlPlaneLoginResponse;
  if (!data?.access_token) {
    throw new Error('invalid login response');
  }
  return data;
}

const ConnectPage: React.FC = () => {
  const { message } = App.useApp();

  const [status, setStatus] = useState<ConnStatus>('disconnected');
  const [errorText, setErrorText] = useState<string>('');
  const [connectedBaseURL, setConnectedBaseURL] = useState<string>('');

  const badge = useMemo(() => {
    switch (status) {
      case 'connected':
        return <Badge status="success" text="Connected" />;
      case 'connecting':
        return <Badge status="processing" text="Connecting" />;
      case 'error':
        return <Badge status="error" text="Error" />;
      default:
        return <Badge status="default" text="Disconnected" />;
    }
  }, [status]);

  return (
    <PageContainer
      title="Connect"
      content={
        <Typography.Text type="secondary">
          设置 Control Plane Base URL，并用账号密码登录（Phase-1：单一 baseURL）。
        </Typography.Text>
      }
    >
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <ProCard
          bordered={false}
          style={{ borderRadius: 12 }}
          title={
            <Space size={12}>
              <Typography.Text strong>Connection Profile</Typography.Text>
              {badge}
            </Space>
          }
          extra={
            <Space size={8}>
              {connectedBaseURL ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {connectedBaseURL}
                </Typography.Text>
              ) : null}
              <Button
                size="small"
                onClick={() => {
                  clearAccessToken();
                  setConnectedBaseURL('');
                  setStatus('disconnected');
                  setErrorText('');
                  message.success('Disconnected');
                }}
                disabled={status === 'connecting'}
              >
                Disconnect
              </Button>
            </Space>
          }
        >
          <ProForm
            layout="vertical"
            initialValues={{
              baseURL: getSuggestedControlPlaneBaseURL(),
              username: 'test',
            }}
            submitter={{
              searchConfig: { submitText: 'Connect' },
            }}
            onFinish={async (values) => {
              const baseURL = normalizeBaseURL(String(values.baseURL || ''));
              const username = String(values.username || '').trim();
              const password = String(values.password || '');
              const agentId = String(values.agentId || '').trim();

              if (!baseURL) {
                message.error('Missing baseURL');
                return false;
              }
              if (!username || !password) {
                message.error('Missing username/password');
                return false;
              }

              setStatus('connecting');
              setErrorText('');
              try {
                // 清掉旧 token，避免“旧 token + 新 baseURL”造成误判。
                clearAccessToken();
                const resp = await loginWithFetch({ baseURL, username, password });
                setAccessToken(resp.access_token);
                setControlPlaneBaseURL(baseURL);
                setConnectedBaseURL(baseURL);
                setStatus('connected');

                message.success('Connected. Reloading…');
                // 让整个应用在新的 baseURL/token 下重新初始化 request/baseURL。
                 const next = agentId
                   ? `/platform/workbench?agentId=${encodeURIComponent(agentId)}`
                   : '/platform/workbench';
                 window.location.href = next;
                 return true;
              } catch (e: any) {
                setStatus('error');
                setErrorText(e?.message || 'Connect failed');
                message.error('Connect failed');
                return false;
              }
            }}
          >
            <ProFormText
              name="baseURL"
              label="Control Plane Base URL"
              placeholder="http://127.0.0.1:8000"
              rules={[{ required: true }]}
            />

            <Divider style={{ margin: '8px 0 16px' }} />

            <ProFormText
              name="username"
              label="Username"
              placeholder="test"
              rules={[{ required: true }]}
            />
            <ProFormText.Password
              name="password"
              label="Password"
              placeholder="test"
              rules={[{ required: true }]}
            />

            <Divider style={{ margin: '8px 0 16px' }} />

            <ProFormText
              name="agentId"
              label="(Optional) Agent ID"
              placeholder="sql_agent"
            />

            {status === 'error' && errorText ? (
              <Typography.Paragraph type="danger" style={{ marginTop: 8 }}>
                {errorText}
              </Typography.Paragraph>
            ) : null}
          </ProForm>
        </ProCard>
      </div>
    </PageContainer>
  );
};

export default ConnectPage;
