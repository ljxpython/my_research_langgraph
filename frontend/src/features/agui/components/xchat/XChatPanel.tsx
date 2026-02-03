import { Bubble, Sender } from '@ant-design/x';
import Actions from '@ant-design/x/es/actions';
import type { BubbleItemType, BubbleListProps } from '@ant-design/x';
import type { BubbleListRef } from '@ant-design/x/es/bubble/interface';
import { ArrowDownOutlined } from '@ant-design/icons';
import { App, Alert, Button, Space, Tag, Typography, theme } from 'antd';
import * as React from 'react';

import type { AguiMessage } from '@/services/controlPlane/types';

import type { AguiSessionLike } from './types';

type AntdToken = ReturnType<typeof theme.useToken>['token'];

function normalizeRole(role: string): string {
  return String(role || '').toLowerCase().trim();
}

function aguiRoleToXRole(role: string): string {
  const r = normalizeRole(role);
  if (r === 'user' || r === 'human') return 'user';
  if (r === 'assistant' || r === 'ai') return 'ai';
  if (r === 'system') return 'system';
  if (r === 'tool') return 'tool';
  return 'ai';
}

function runStatusTag(session: AguiSessionLike) {
  if (session.streamConnecting) return <Tag color="processing">Connecting</Tag>;
  if (session.busy && !session.firstTokenReceived) return <Tag color="processing">Waiting</Tag>;
  if (session.busy) return <Tag color="processing">Running</Tag>;
  return <Tag>Idle</Tag>;
}

function messageToBubbleItem(params: {
  message: AguiMessage;
  token: AntdToken;
  feedbackValue?: 'default' | 'like' | 'dislike';
  onFeedbackChange?: (next: 'default' | 'like' | 'dislike') => void;
}): BubbleItemType {
  const { message: m, token, feedbackValue, onFeedbackChange } = params;
  const xRole = aguiRoleToXRole(m.role || '');
  const isTool = normalizeRole(m.role || '') === 'tool';
  const isAi = xRole === 'ai';

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <div />
      <Space size={8} style={{ opacity: 0.85 }}>
        <Actions.Copy text={String(m.content || '')} />
        {isAi ? (
          <Actions.Feedback
            value={feedbackValue || 'default'}
            onChange={(v) => onFeedbackChange?.(v as 'default' | 'like' | 'dislike')}
          />
        ) : null}
      </Space>
    </div>
  );

  const header = isTool ? (
    <Space size={8} wrap>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Tool output
      </Typography.Text>
      {m.toolCallId ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          toolCallId={m.toolCallId}
        </Typography.Text>
      ) : null}
    </Space>
  ) : undefined;

  return {
    key: m.id || `${xRole}-${Math.random().toString(36).slice(2, 10)}`,
    role: xRole === 'tool' ? 'tool' : xRole,
    content: m.content,
    header,
    footer,

    // Keep UI compact by default; tool messages get code-like styling.
    contentRender: (content) => {
      if (!isTool) return content;
      return (
        <pre
          style={{
            margin: 0,
            fontFamily: token.fontFamilyCode,
            fontSize: 12,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            maxHeight: 260,
            overflow: 'auto',
            padding: 10,
            borderRadius: 10,
            background: token.colorFillQuaternary,
          }}
        >
          {String(content || '')}
        </pre>
      );
    },
  };
}

export function XChatPanel(props: {
  title?: React.ReactNode;
  session: AguiSessionLike;
  requireThread?: boolean;
  height?: number;
}) {
  const { title, session, requireThread, height = 520 } = props;
  const { message } = App.useApp();
  const { token } = theme.useToken();

  const [composer, setComposer] = React.useState('');
  const [feedback, setFeedback] = React.useState<Record<string, 'default' | 'like' | 'dislike'>>({});

  const listRef = React.useRef<BubbleListRef | null>(null);
  const setListRef = React.useCallback((inst: BubbleListRef | null) => {
    listRef.current = inst;
  }, []);
  const [stickToBottom, setStickToBottom] = React.useState(true);
  const [hasNewMessages, setHasNewMessages] = React.useState(false);

  // When streaming, the last message id typically stays the same while content grows.
  // Track a lightweight revision so our auto-scroll can keep up with deltas.
  const lastMessageRevision = React.useMemo(() => {
    const m = session.messages.length ? session.messages[session.messages.length - 1] : undefined;
    if (!m?.id) return '';
    const len = String(m.content || '').length;
    return `${m.id}:${len}`;
  }, [session.messages]);

  const scrollRafRef = React.useRef<number | null>(null);
  const scheduleScrollToBottom = React.useCallback(() => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      listRef.current?.scrollTo({ top: 'bottom', behavior: 'auto' });
    });
  }, []);

  React.useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, []);

  const bubbleItems = React.useMemo(() => {
    return (session.messages || []).map((m) =>
      messageToBubbleItem({
        message: m,
        token,
        feedbackValue: feedback[m.id],
        onFeedbackChange: (next) => {
          setFeedback((prev) => ({ ...prev, [m.id]: next }));
        },
      }),
    );
  }, [feedback, session.messages, token]);

  // ==================== Auto scroll control ====================
  // - 只有当用户靠近底部时才自动滚动；否则提示“Jump to latest”。
  React.useEffect(() => {
    const box = listRef.current?.scrollBoxNativeElement;
    if (!box) return;

    const thresholdPx = 96;
    let raf: number | null = null;

    const onScroll = () => {
      if (raf != null) return;
      raf = window.requestAnimationFrame(() => {
        raf = null;
        const distanceToBottom = box.scrollHeight - box.scrollTop - box.clientHeight;
        const nearBottom = distanceToBottom <= thresholdPx;
        setStickToBottom(nearBottom);
        if (nearBottom) setHasNewMessages(false);
      });
    };

    box.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      if (raf != null) window.cancelAnimationFrame(raf);
      box.removeEventListener('scroll', onScroll);
    };
  }, []);

  React.useEffect(() => {
    if (!lastMessageRevision) return;

    if (stickToBottom) {
      // Keep sticking while the last message grows (streaming).
      scheduleScrollToBottom();
      setHasNewMessages(false);
      return;
    }

    // User is reading history: show jump affordance even for streaming deltas.
    setHasNewMessages(true);
  }, [lastMessageRevision, scheduleScrollToBottom, stickToBottom]);

  const role: BubbleListProps['role'] = React.useMemo(
    () => ({
      user: {
        placement: 'end',
        variant: 'filled',
        shape: 'corner',
      },
      ai: {
        placement: 'start',
        variant: 'outlined',
        shape: 'corner',
      },
      tool: {
        placement: 'start',
        variant: 'borderless',
        shape: 'default',
      },
      system: {
        placement: 'start',
        variant: 'borderless',
        shape: 'default',
      },
    }),
    [],
  );

  const senderDisabled =
    session.snapshotLoading ||
    session.busy ||
    !session.selectedAgentId ||
    (!!requireThread && !session.threadId);

  const onSubmit = async () => {
    const text = composer;
    setComposer('');

    const res = await session.sendUserMessage(text);
    if (res?.ok) return;
    switch (res?.reason) {
      case 'NO_AGENT':
        message.warning('Select an agent first');
        return;
      case 'NO_THREAD':
        message.warning('Create or restore a thread first');
        return;
      case 'BUSY':
        message.warning('Thread is busy (cancel or wait)');
        return;
      case 'THREAD_BUSY':
        message.warning('THREAD_BUSY: another run is active; you can cancel it');
        return;
      default:
        message.error('Failed to start run');
        return;
    }
  };

  const onCancel = async () => {
    try {
      await session.requestCancel();
      message.success('Cancel requested');
    } catch (e) {
      console.log(e);
      message.error('Cancel failed');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <Space size={10} wrap>
          {title ? <Typography.Text strong>{title}</Typography.Text> : null}
          {runStatusTag(session)}
          {session.activeRunId ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              run={session.activeRunId}
            </Typography.Text>
          ) : null}
          {session.threadId ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              thread={session.threadId}
            </Typography.Text>
          ) : null}
        </Space>

        <Space size={8} wrap>
          <Button
            size="small"
            onClick={() => session.threadId && session.loadSnapshot(session.threadId)}
            disabled={!session.threadId}
            loading={session.snapshotLoading}
          >
            Refresh
          </Button>
        </Space>
      </div>

      {session.busy && !session.streamConnecting && !session.firstTokenReceived ? (
        <Alert
          type="warning"
          showIcon
          message="A run may still be active server-side"
          description="If you refreshed the page or lost the stream, use Refresh to reconcile snapshot/busy state."
        />
      ) : null}

      <div
        style={{
          height,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 12,
          background: token.colorBgContainer,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {hasNewMessages ? (
          <div style={{ position: 'absolute', right: 12, bottom: 12, zIndex: 2 }}>
            <Button
              size="small"
              icon={<ArrowDownOutlined />}
              onClick={() => {
                listRef.current?.scrollTo({ top: 'bottom', behavior: 'smooth' });
                setHasNewMessages(false);
                setStickToBottom(true);
              }}
            >
              Jump to latest
            </Button>
          </div>
        ) : null}

        <Bubble.List ref={setListRef} items={bubbleItems} role={role} autoScroll={false} style={{ height: '100%' }} />
      </div>

      <Sender
        value={composer}
        onChange={(v) => setComposer(v)}
        placeholder={
          session.busy
            ? session.firstTokenReceived
              ? 'Run in progress...'
              : 'Connecting/Waiting...'
            : 'Type a message'
        }
        autoSize={{ minRows: 2, maxRows: 8 }}
        submitType="enter"
        disabled={senderDisabled}
        loading={session.busy}
        onSubmit={() => onSubmit()}
        onCancel={() => onCancel()}
      />
    </div>
  );
}
