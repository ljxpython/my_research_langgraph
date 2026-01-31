// ==================== Control Plane 客户端配置 ====================

/**
 * 单一后端入口：
 * - 优先使用环境变量 CONTROL_PLANE_BASE_URL（例如 https://cp.example.com ）
 * - 未设置时，走同域路径（开发环境可通过 umi proxy 将 /v1/** 代理到后端）
 */
export function getControlPlaneBaseURL(): string {
  const raw = process.env.CONTROL_PLANE_BASE_URL;
  if (!raw) return '';

  // 避免 baseURL 末尾带 / 导致双斜杠
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}
