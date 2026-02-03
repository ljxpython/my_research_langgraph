import { useAguiSession } from '@/features/agui/useAguiSession';
import { defaultControlPlaneClient } from '@/features/agui/defaultClient';

export default function useAguiModel() {
  // 兼容现有页面：继续提供单例 model，但内部实现来自“可实例化 session”。
  return useAguiSession(defaultControlPlaneClient);
}
