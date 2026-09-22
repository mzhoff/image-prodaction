import type { AnalyticsConfig } from './contracts';

export function readAnalyticsConfig(env: Record<string, string | undefined>): AnalyticsConfig {
  const mode = env.METRICA_MODE ?? (env.NODE_ENV === 'development' ? 'debug' : 'off');
  const rawId = env.METRICA_COUNTER_ID ?? '';
  const counterId = /^[1-9]\d{0,14}$/.test(rawId) && Number.isSafeInteger(Number(rawId))
    ? Number(rawId) : null;
  const allowedHosts = (env.METRICA_ALLOWED_HOSTS ?? 'production.apption.space')
    .split(',').map((host) => host.trim().toLowerCase())
    .filter((host) => /^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(host));
  return {
    mode: mode === 'debug' ? 'debug' : mode === 'live' && counterId ? 'live' : 'off',
    counterId, allowedHosts,
  };
}

export function analyticsModeForOrigin(config: AnalyticsConfig, origin: string): AnalyticsConfig['mode'] {
  try {
    const url = new URL(origin);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (local) return config.mode === 'debug' ? 'debug' : 'off';
    return config.mode === 'live' && config.counterId && url.protocol === 'https:'
      && config.allowedHosts.includes(url.hostname) ? 'live' : 'off';
  } catch { return 'off'; }
}
