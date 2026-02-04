import { Button, Space, Typography } from 'antd';
import React, { useMemo, useState } from 'react';

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

export function McpPane(props: { events: Record<string, any>[] }) {
  const events = props.events || [];
  const [expanded, setExpanded] = useState(false);

  const list = useMemo(() => {
    const trimmed = events.slice(-50).reverse();
    return expanded ? trimmed : trimmed.slice(0, 8);
  }, [events, expanded]);

  if (events.length === 0) {
    return <Typography.Text type="secondary">No MCP events yet.</Typography.Text>;
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={10}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Text strong>MCP</Typography.Text>
        <Button size="small" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Collapse' : 'Expand'}
        </Button>
      </Space>

      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        {list.map((e, idx) => {
          const serverId = typeof e.serverId === 'string' ? e.serverId : '-';
          const toolName = typeof e.toolName === 'string' ? e.toolName : '-';
          const phase = typeof e.phase === 'string' ? e.phase : '-';
          const content = (e as any).content;
          const title = typeof content?.title === 'string' ? content.title : '';
          const fallback = typeof content?.fallbackMarkdown === 'string' ? content.fallbackMarkdown : '';
          return (
            <div
              key={`${idx}-${serverId}-${toolName}`}
              style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: 10 }}
            >
              <Space direction="vertical" style={{ width: '100%' }} size={6}>
                <Typography.Text>
                  {serverId} / {toolName} <Typography.Text type="secondary">({phase})</Typography.Text>
                </Typography.Text>
                {title ? <Typography.Text type="secondary">{title}</Typography.Text> : null}
                {fallback ? (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{fallback}</pre>
                ) : (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{formatJson(e)}</pre>
                )}
              </Space>
            </div>
          );
        })}
      </Space>
    </Space>
  );
}
