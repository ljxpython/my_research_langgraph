import { Card, Typography } from 'antd';
import React from 'react';

type Props = {
  value?: Record<string, any>;
};

export const ReasoningPane: React.FC<Props> = ({ value }) => {
  const summary = typeof value?.summary === 'string' ? value?.summary : '';
  const highlights = Array.isArray(value?.highlights) ? (value?.highlights as any[]) : [];

  if (!summary && !highlights.length) {
    return (
      <Card size="small" title="Reasoning">
        <Typography.Text type="secondary">No reasoning summary yet.</Typography.Text>
      </Card>
    );
  }

  return (
    <Card size="small" title="Reasoning">
      {summary ? (
        <Typography.Paragraph style={{ marginBottom: 8 }}>{summary}</Typography.Paragraph>
      ) : null}
      {highlights.length ? (
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          {highlights
            .filter((x) => typeof x === 'string' && x.trim())
            .slice(0, 12)
            .map((x, idx) => (
              <div key={`${idx}-${x}`}>- {x}</div>
            ))}
        </Typography.Paragraph>
      ) : null}
    </Card>
  );
};
