import {
  DEFAULT_BASE_URL,
  buildHubUrl,
  buildStatusUrl,
  normalizeBaseUrl,
} from '../signalRConfig';

describe('signalRConfig', () => {
  it('keeps the default base URL scoped to a path', () => {
    expect(DEFAULT_BASE_URL).toBe('http://10.0.2.2:3000/my/path');
  });

  it('normalizes trailing slashes before building endpoint URLs', () => {
    expect(normalizeBaseUrl('https://my.domain/my/path/')).toBe(
      'https://my.domain/my/path',
    );
    expect(buildStatusUrl('https://my.domain/my/path/')).toBe(
      'https://my.domain/my/path/status',
    );
    expect(buildHubUrl('https://my.domain/my/path/')).toBe(
      'https://my.domain/my/path/hub',
    );
  });
});
