import { PageContainer, ProCard, ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { history, useLocation } from '@umijs/max';
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Select,
  Space,
  Typography,
  Upload,
} from 'antd';
import type { UploadRequestOption as RcUploadRequestOption } from 'rc-upload/lib/interface';
import React, { useMemo, useState } from 'react';
import ProjectPicker from '../components/ProjectPicker';
import { uploadProjectArtifact } from '@/services/platform/artifacts';
import { listRunArtifacts } from '@/services/platform/runs';
import { formatPlatformError } from '@/services/platform/request';
import type { PlatformArtifact } from '@/services/platform/types';

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

const columns: ProColumns<PlatformArtifact>[] = [
  {
    title: 'Filename',
    dataIndex: 'filename',
    ellipsis: true,
  },
  {
    title: 'Kind',
    dataIndex: 'kind',
    width: 140,
  },
  {
    title: 'Artifact ID',
    dataIndex: 'artifact_id',
    copyable: true,
    ellipsis: true,
  },
  {
    title: 'Run',
    dataIndex: 'run_id',
    copyable: true,
    ellipsis: true,
  },
  {
    title: 'Size',
    dataIndex: 'size_bytes',
    valueType: 'digit',
    width: 120,
  },
  {
    title: 'Created At',
    dataIndex: 'created_at',
    valueType: 'dateTime',
    width: 190,
  },
];

const ArtifactsPage: React.FC = () => {
  const { message } = App.useApp();
  const location = useLocation();

  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);

  const projectId = useMemo(() => {
    return getQueryParam(location.search, 'projectId');
  }, [location.search]);

  const runId = useMemo(() => {
    return getQueryParam(location.search, 'runId');
  }, [location.search]);

  return (
    <PageContainer>
      <ProCard split="horizontal" bordered>
        <ProCard
          title="Upload"
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
              message="请选择一个 Project 以便上传 artifacts（POST /v1/projects/{project_id}/artifacts）。"
              style={{ marginBottom: 16 }}
            />
          ) : null}

          <Form
            form={form}
            layout="inline"
            initialValues={{ kind: 'attachment', runId }}
          >
            <Form.Item name="kind" label="Kind" rules={[{ required: true }]}>
              <Select
                style={{ width: 160 }}
                options={[
                  { value: 'log', label: 'log' },
                  { value: 'report', label: 'report' },
                  { value: 'export', label: 'export' },
                  { value: 'attachment', label: 'attachment' },
                  { value: 'other', label: 'other' },
                ]}
              />
            </Form.Item>
            <Form.Item name="runId" label="Run ID (optional)">
              <Input
                placeholder="run_..."
                style={{ width: 280 }}
                onBlur={(e) => {
                  const next = e.target.value?.trim() || undefined;
                  history.push({
                    pathname: location.pathname,
                    search: setQueryParam(location.search, 'runId', next),
                  });
                }}
              />
            </Form.Item>
            <Form.Item>
              <Upload
                maxCount={1}
                showUploadList={{ showRemoveIcon: !uploading }}
                beforeUpload={() => {
                  if (!projectId) {
                    message.error('请先选择 Project');
                    return Upload.LIST_IGNORE;
                  }
                  return true;
                }}
                customRequest={async (options: RcUploadRequestOption) => {
                  if (!projectId) {
                    options.onError?.(new Error('Missing projectId'));
                    return;
                  }
                  const file = options.file as File;
                  const kind = String(form.getFieldValue('kind') ?? 'attachment');
                  const runIdValue = (form.getFieldValue('runId') as string | undefined)?.trim();

                  setUploading(true);
                  try {
                    const artifact = await uploadProjectArtifact({
                      projectId,
                      file,
                      kind,
                      runId: runIdValue,
                    });
                    message.success(`Uploaded: ${artifact.filename}`);
                    options.onSuccess?.(artifact);
                  } catch (err) {
                    message.error(formatPlatformError(err));
                    options.onError?.(err as Error);
                  } finally {
                    setUploading(false);
                  }
                }}
              >
                <Button type="primary" loading={uploading} disabled={!projectId}>
                  Upload File
                </Button>
              </Upload>
            </Form.Item>
          </Form>
        </ProCard>

        <ProCard
          title="List (Run-scoped)"
          extra={
            <Space>
              <Typography.Text type="secondary">
                GET /v1/runs/{'{run_id}'}/artifacts
              </Typography.Text>
              <Input
                placeholder="run_..."
                allowClear
                defaultValue={runId}
                style={{ width: 320 }}
                onPressEnter={(e) => {
                  const v = (e.currentTarget.value || '').trim() || undefined;
                  history.push({
                    pathname: location.pathname,
                    search: setQueryParam(location.search, 'runId', v),
                  });
                }}
              />
            </Space>
          }
        >
          {!runId ? (
            <Alert
              showIcon
              type="info"
              message="当前列表按 Run 维度展示，请在右侧输入 Run ID。"
              style={{ marginBottom: 16 }}
            />
          ) : null}

          <ProTable<PlatformArtifact>
            rowKey="artifact_id"
            search={false}
            options={{ density: false, fullScreen: true, reload: true, setting: true }}
            request={async () => {
              if (!runId) return { data: [], success: true };
              try {
                const data = await listRunArtifacts(runId);
                return { data, success: true };
              } catch (err) {
                message.error(formatPlatformError(err));
                return { data: [], success: false };
              }
            }}
            columns={columns}
          />
        </ProCard>
      </ProCard>
    </PageContainer>
  );
};

export default ArtifactsPage;
