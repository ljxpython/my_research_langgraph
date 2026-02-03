import { PageContainer, ProCard } from '@ant-design/pro-components';
import { history, useModel } from '@umijs/max';
import { Button, Space, Tag, Typography, theme } from 'antd';
import React from 'react';

const Welcome: React.FC = () => {
  const { token } = theme.useToken();
  const { initialState } = useModel('@@initialState');

  // Keep this page lightweight: show a hint of current baseURL.
  const baseURL = typeof window !== 'undefined' ? window.localStorage.getItem('CONTROL_PLANE_BASE_URL') : '';

  const isLoggedIn = Boolean(initialState?.currentUser);

  return (
    <PageContainer>
      <ProCard
        bordered={false}
        style={{ borderRadius: 12 }}
        bodyStyle={{
          background:
            initialState?.settings?.navTheme === 'realDark'
              ? 'linear-gradient(120deg, rgba(24,24,28,0.9) 0%, rgba(20,20,22,0.95) 70%, rgba(18,18,20,0.98) 100%)'
              : 'linear-gradient(120deg, #fbfdff 0%, #f5f7ff 55%, #f7faff 100%)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <Typography.Title level={3} style={{ margin: 0, color: token.colorTextHeading }}>
              欢迎来到测试管理
            </Typography.Title>
            <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0, color: token.colorTextSecondary }}>
              这里是统一入口：既能用“工作台”与 Agent 对话，也能管理 Project/Environment/Run/Artifact/Audit 等通用能力。
            </Typography.Paragraph>
          </div>

          <Space size={8} wrap>
            <Tag color={isLoggedIn ? 'green' : 'default'}>
              {isLoggedIn ? `已登录：${initialState?.currentUser?.name || 'user'}` : '未登录'}
            </Tag>
            <Tag>
              Control Plane：{baseURL ? baseURL : 'proxy (/v1)'}
            </Tag>
          </Space>

          <Space size={10} wrap>
            <Button type="primary" onClick={() => history.push('/connect')}>
              1) 连接 / 登录
            </Button>
            <Button onClick={() => history.push('/platform/workbench')}>
              2) 打开工作台
            </Button>
            <Button onClick={() => history.push('/db-query/ai')}>
              智能数据库（AI 查询）
            </Button>
            <Button onClick={() => history.push('/db-query/history')}>
              智能数据库（历史对话）
            </Button>
            <Button onClick={() => history.push('/platform/projects')}>
              3) 项目管理
            </Button>
            <Button onClick={() => history.push('/platform/environments')}>
              环境管理
            </Button>
            <Button onClick={() => history.push('/platform/runs')}>
              运行记录
            </Button>
          </Space>

          <ProCard
            bordered
            style={{ borderRadius: 12, background: token.colorBgContainer }}
            title={<Typography.Text strong>推荐路径（新同学）</Typography.Text>}
          >
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Typography.Text>
                1) 先到 <Typography.Text code>/connect</Typography.Text> 绑定 Control Plane URL 并登录（dev 默认 test/test）。
              </Typography.Text>
              <Typography.Text>
                2) 在 <Typography.Text code>/platform/workbench</Typography.Text> 选择 agentId 开始对话（例如 sql_agent）。
              </Typography.Text>
              <Typography.Text>
                3) 需要可追溯执行与协作时：使用 <Typography.Text code>/platform</Typography.Text> 下的 Project/Environment/Run/Artifact/Audit。
              </Typography.Text>
            </Space>
          </ProCard>
        </div>
      </ProCard>
    </PageContainer>
  );
};

export default Welcome;
