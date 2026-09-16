/**
 * Shiksha Academy - Production Environment Configuration & API Base URL Normalizer
 */

export function getApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  let base = envUrl;

  if (!base) {
    if (import.meta.env.DEV) {
      base = 'http://localhost:8000';
    } else {
      base = typeof window !== 'undefined' ? window.location.origin : '';
    }
  }

  const cleanUrl = base.replace(/\/+$/, '');
  if (!cleanUrl) {
    return '/api/v1';
  }

  return cleanUrl.endsWith('/api/v1') ? cleanUrl : `${cleanUrl}/api/v1`;
}
