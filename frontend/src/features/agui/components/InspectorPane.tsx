import { Collapse, Segmented, Space, Tabs, Typography } from 'antd';
import React, { useMemo, useState } from 'react';

import type { AguiMessage, AguiState } from '@/services/controlPlane/types';

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

type ToolCall = {
  id: string;
  name: string;
  argumentsText: string;
  parsedArgs?: unknown;
  resultText?: string;
};

function extractToolCalls(messages: AguiMessage[]): ToolCall[] {
  const toolOutputs = new Map<string, string>();
  for (const m of messages) {
    if ((m.role || '').toLowerCase().trim() === 'tool') {
      const tid = (m as any).toolCallId;
      if (typeof tid === 'string' && tid) {
        toolOutputs.set(tid, String(m.content || ''));
      }
    }
  }

  const calls: ToolCall[] = [];
  for (const m of messages) {
    const toolCalls = Array.isArray((m as any).toolCalls) ? (m as any).toolCalls : [];
    for (const tc of toolCalls) {
      const id = String(tc?.id || '');
      const name = String(tc?.function?.name || 'tool');
      const argumentsText = String(tc?.function?.arguments || '{}');
      const parsedArgs = safeJsonParse(argumentsText);
      const resultText = id ? toolOutputs.get(id) : undefined;
      calls.push({ id, name, argumentsText, parsedArgs, resultText });
    }
  }
  return calls;
}

function stateTabItems(state: AguiState) {
  return [
    {
      key: 'ui',
      label: 'ui',
      children: (
        <pre style={{ margin: 0, overflowX: 'auto' }}>{formatJson(state.ui)}</pre>
      ),
    },
    {
      key: 'app',
      label: 'app',
      children: (
        <pre style={{ margin: 0, overflowX: 'auto' }}>{formatJson(state.app)}</pre>
      ),
    },
    {
      key: 'debug',
      label: 'debug',
      children: (
        <pre style={{ margin: 0, overflowX: 'auto' }}>{formatJson(state.debug)}</pre>
      ),
    },
  ];
}

export function InspectorPane(props: {
  messages: AguiMessage[];
  state: AguiState;
}) {
  const { messages, state } = props;
  const [view, setView] = useState<'state' | 'tools'>('state');

  const toolCalls = useMemo(() => extractToolCalls(messages), [messages]);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Segmented
        value={view}
        onChange={(v) => setView(v as any)}
        options={[
          { label: 'State', value: 'state' },
          { label: 'Tools', value: 'tools' },
        ]}
        block
      />

      {view === 'state' ? (
        <Tabs size="small" items={stateTabItems(state)} />
      ) : (
        <div>
          {toolCalls.length === 0 ? (
            <Typography.Text type="secondary">No tool calls yet.</Typography.Text>
          ) : (
            <Collapse
              size="small"
              items={toolCalls
                .slice(-30)
                .reverse()
                .map((tc, idx) => ({
                  key: tc.id || String(idx),
                  label: (
                    <Space size={8} wrap>
                      <Typography.Text>{tc.name}</Typography.Text>
                      {tc.id ? (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {tc.id}
                        </Typography.Text>
                      ) : null}
                    </Space>
                  ),
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size={10}>
                      <div>
                        <Typography.Text type="secondary">arguments</Typography.Text>
                        <pre style={{ margin: 0, overflowX: 'auto' }}>
                          {tc.parsedArgs ? formatJson(tc.parsedArgs) : tc.argumentsText}
                        </pre>
                      </div>
                      {typeof tc.resultText === 'string' ? (
                        <div>
                          <Typography.Text type="secondary">result</Typography.Text>
                          <pre style={{ margin: 0, overflowX: 'auto' }}>
                            {tc.resultText}
                          </pre>
                        </div>
                      ) : null}
                    </Space>
                  ),
                }))}
            />
          )}
        </div>
      )}
    </Space>
  );
}
