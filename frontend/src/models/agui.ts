import type { ControlPlaneClient } from '@/features/agui/controlPlaneClient';
import { useAguiSession } from '@/features/agui/useAguiSession';
import { parseControlPlaneError, streamAgentRun } from '@/services/controlPlane/runs';
import { cancelRun, createThread, getThreadSnapshot } from '@/services/controlPlane/threads';

const defaultClient: ControlPlaneClient = {
  createThread,
  getThreadSnapshot,
  cancelRun,
  streamAgentRun,
  parseError: parseControlPlaneError,
};

export default function useAguiModel() {
  // 兼容现有页面：继续提供单例 model，但内部实现来自“可实例化 session”。
  return useAguiSession(defaultClient);
}
