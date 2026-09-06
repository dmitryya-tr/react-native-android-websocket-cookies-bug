export const DEFAULT_BASE_URL = 'http://10.0.2.2:3000/my/path';

export function normalizeBaseUrl(baseUrl: string) {
  const trimmedBaseUrl = baseUrl.trim();

  return trimmedBaseUrl.endsWith('/')
    ? trimmedBaseUrl.slice(0, -1)
    : trimmedBaseUrl;
}

export function buildStatusUrl(baseUrl: string) {
  return `${normalizeBaseUrl(baseUrl)}/status`;
}

export function buildHubUrl(baseUrl: string) {
  return `${normalizeBaseUrl(baseUrl)}/hub`;
}
