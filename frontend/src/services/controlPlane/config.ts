// ==================== Control Plane 客户端配置 ====================

/**
 * 单一后端入口：
 * - 优先使用环境变量 CONTROL_PLANE_BASE_URL（例如 https://cp.example.com ）
 * - 未设置时，走同域路径（开发环境可通过 umi proxy 将 /v1/** 代理到后端）
 */

const BASE_URL_KEY = 'control_plane_base_url';

function normalizeBaseURL(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  // 避免 baseURL 末尾带 / 导致双斜杠
  return v.endsWith('/') ? v.slice(0, -1) : v;
}

export function setControlPlaneBaseURL(baseURL: string): void {
  try {
    localStorage.setItem(BASE_URL_KEY, normalizeBaseURL(baseURL));
  } catch {
    // ignore
  }
}

export function clearControlPlaneBaseURL(): void {
  try {
    localStorage.removeItem(BASE_URL_KEY);
  } catch {
    // ignore
  }
}

export function getControlPlaneBaseURL(): string {
  try {
    const stored = localStorage.getItem(BASE_URL_KEY);
    if (stored) return normalizeBaseURL(stored);
  } catch {
    // ignore (SSR / privacy mode)
  }

  const raw = process.env.CONTROL_PLANE_BASE_URL;
  return raw ? normalizeBaseURL(raw) : '';
}

export function getSuggestedControlPlaneBaseURL(): string {
  // Prefer explicit baseURL if set; otherwise suggest proxy target / common dev default.
  const configured = getControlPlaneBaseURL();
  if (configured) return configured;

  const envProxy = (process.env.CONTROL_PLANE_PROXY_TARGET as unknown as string) || '';
  if (envProxy) return normalizeBaseURL(envProxy);

  return 'http://127.0.0.1:8000';
}
