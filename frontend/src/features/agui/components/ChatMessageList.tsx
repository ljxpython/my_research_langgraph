import { theme, Typography } from 'antd';
import React, { useEffect, useMemo, useRef } from 'react';

import type { AguiMessage } from '@/services/controlPlane/types';

function roleLabel(role: string): string {
  const r = (role || '').toLowerCase().trim();
  if (r === 'user' || r === 'human') return 'User';
  if (r === 'assistant' || r === 'ai') return 'Assistant';
  if (r === 'tool') return 'Tool';
  if (r === 'system') return 'System';
  return role || 'Unknown';
}

export function ChatMessageList(props: {
  messages: AguiMessage[];
  loading?: boolean;
}) {
  const { token } = theme.useToken();
  const { messages, loading } = props;

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastId = useMemo(() => {
    const m = messages.length ? messages[messages.length - 1] : undefined;
    return m?.id || '';
  }, [messages]);

  useEffect(() => {
    // 简单策略：新消息到达时滚到底。
    // 如果后续需要“用户滚动上去就不抢焦点”，再加 near-bottom 判断。
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lastId]);

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: 12,
        background: token.colorBgLayout,
        borderRadius: 12,
        border: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      {loading ? (
        <Typography.Text type="secondary">Loading…</Typography.Text>
      ) : null}

      {messages.map((m) => {
        const role = (m.role || '').toLowerCase().trim();
        const isUser = role === 'user' || role === 'human';
        const isTool = role === 'tool';

        const bubbleBg = isUser ? token.colorPrimaryBg : token.colorBgContainer;
        const bubbleBorder = isUser ? token.colorPrimaryBorder : token.colorBorderSecondary;
        const bubbleText = token.colorText;

        return (
          <div
            key={m.id}
            style={{
              display: 'flex',
              justifyContent: isUser ? 'flex-end' : 'flex-start',
              padding: '6px 0',
            }}
          >
            <div style={{ maxWidth: '72ch', width: 'fit-content' }}>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'baseline',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                  marginBottom: 4,
                }}
              >
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {roleLabel(m.role)}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {m.id}
                </Typography.Text>
              </div>

              <div
                style={{
                  background: bubbleBg,
                  border: `1px solid ${bubbleBorder}`,
                  borderRadius: 12,
                  padding: 12,
                  color: bubbleText,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                }}
              >
                {isTool ? (
                  <pre
                    style={{
                      margin: 0,
                      fontFamily: token.fontFamilyCode,
                      fontSize: 12,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {m.content}
                  </pre>
                ) : (
                  m.content
                )}
              </div>
            </div>
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}
