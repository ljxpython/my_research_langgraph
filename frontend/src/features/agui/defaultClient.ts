import type { ControlPlaneClient } from '@/features/agui/controlPlaneClient';
import { parseControlPlaneError, streamAgentRun } from '@/services/controlPlane/runs';
import { cancelRun, createThread, getThreadSnapshot } from '@/services/controlPlane/threads';

export const defaultControlPlaneClient: ControlPlaneClient = {
  createThread,
  getThreadSnapshot,
  cancelRun,
  streamAgentRun,
  parseError: parseControlPlaneError,
};
