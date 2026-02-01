import { App, Select, Space, Typography } from 'antd';
import React from 'react';
import { formatPlatformError } from '@/services/platform/request';
import { listProjects } from '@/services/platform/projects';
import type { PlatformProject } from '@/services/platform/types';

type ProjectOption = {
  label: React.ReactNode;
  value: string;
};

export type ProjectPickerProps = {
  value?: string;
  onChange: (next?: string) => void;
  style?: React.CSSProperties;
};

const ProjectPicker: React.FC<ProjectPickerProps> = ({ value, onChange, style }) => {
  const { message } = App.useApp();

  const [loading, setLoading] = React.useState<boolean>(false);
  const [projects, setProjects] = React.useState<PlatformProject[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listProjects()
      .then((data) => {
        if (cancelled) return;
        setProjects(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (cancelled) return;
        message.error(formatPlatformError(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options: ProjectOption[] = projects.map((p) => {
    return {
      value: p.project_id,
      label: (
        <Space size={8}>
          <Typography.Text ellipsis style={{ maxWidth: 260 }}>
            {p.name}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {p.project_id}
          </Typography.Text>
        </Space>
      ),
    };
  });

  return (
    <Select
      style={{ width: 420, ...style }}
      placeholder="选择 Project"
      loading={loading}
      showSearch
      allowClear
      optionFilterProp="value"
      value={value}
      onChange={(v) => onChange(typeof v === 'string' ? v : undefined)}
      options={options}
    />
  );
};

export default ProjectPicker;
