import type { AguiMessage } from '@/services/controlPlane/types';

// ==================== AG-UI Session (UI-facing) ====================
//
// 说明：这里刻意只暴露“聊天 UI 必须依赖”的最小接口面，
// 让页面既可以接 useAguiSession() 的实例，也可以接其它实现。

export type AguiSessionLike = {
  threadId: string;
  busy: boolean;
  streamConnecting: boolean;
  snapshotLoading: boolean;
  firstTokenReceived: boolean;
  activeRunId: string;
  selectedAgentId: string;
  messages: AguiMessage[];

  loadSnapshot: (threadId: string) => Promise<unknown>;
  sendUserMessage: (text: string) => Promise<any>;
  requestCancel: () => Promise<any>;

  // Optional (session 内核一般都有；但 UI 不强依赖)
  stopStream?: () => void;
  ensureThread?: () => Promise<string>;
};
