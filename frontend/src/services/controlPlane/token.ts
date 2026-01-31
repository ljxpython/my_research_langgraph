// ==================== Control Plane Token 存取 ====================

const ACCESS_TOKEN_KEY = 'control_plane_access_token';

export function getAccessToken(): string | undefined {
  try {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    return token || undefined;
  } catch {
    return undefined;
  }
}

export function setAccessToken(token: string): void {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearAccessToken(): void {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // ignore
  }
}
