import { BEHAVIOR_EVENTS } from '../src/shared/analytics/contracts.ts';

const PUBLIC_KEYS = ['METRICA_MODE', 'METRICA_COUNTER_ID', 'METRICA_ALLOWED_HOSTS'];

export function validateAnalyticsRegistry(registry) {
  if (registry?.schemaVersion !== 1 || registry?.profile !== 'image-production-beta') {
    throw new Error('Unsupported analytics release registry.');
  }
  const { counter, goals } = registry;
  if (!Number.isSafeInteger(counter?.id) || counter.id <= 0 || !counter.name) {
    throw new Error('Analytics registry counter is invalid.');
  }
  const origin = parseOrigin(counter.origin);
  if (origin !== counter.origin || !registry.composeProject) {
    throw new Error('Analytics registry must bind an exact HTTPS origin and Compose project.');
  }
  if (!Array.isArray(goals) || goals.length !== BEHAVIOR_EVENTS.length
    || new Set(goals.map((goal) => goal.event)).size !== goals.length
    || new Set(goals.map((goal) => goal.goalId)).size !== goals.length
    || goals.some((goal) => !BEHAVIOR_EVENTS.includes(goal.event)
      || !Number.isSafeInteger(goal.goalId) || goal.goalId <= 0)) {
    throw new Error('Analytics goals must match the live event contract exactly with unique goal IDs.');
  }
  return { origin, hostname: new URL(origin).hostname };
}

export function validatePublicAnalyticsProfile(profile, registry) {
  const { hostname } = validateAnalyticsRegistry(registry);
  if (!profile || Object.keys(profile).sort().join(',') !== [...PUBLIC_KEYS].sort().join(',')) {
    throw new Error('Public analytics profile must contain exactly three METRICA settings and no other values.');
  }
  if (profile.METRICA_MODE !== 'live'
    || profile.METRICA_COUNTER_ID !== String(registry.counter.id)
    || profile.METRICA_ALLOWED_HOSTS !== hostname) {
    throw new Error('Public analytics profile does not match the approved counter/domain pairing.');
  }
}

export function validateAnalyticsCompose(config, registry) {
  const { origin, hostname } = validateAnalyticsRegistry(registry);
  if (config?.name !== registry.composeProject) {
    throw new Error('Analytics beta profile requires the registered Timeweb Compose project.');
  }
  const env = config?.services?.web?.environment;
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    throw new Error('Final web runtime environment is missing.');
  }
  validatePublicAnalyticsProfile(Object.fromEntries(PUBLIC_KEYS.map((key) => [key, env[key]])), registry);
  if (parseOrigin(env.APP_BASE_URL) !== origin) {
    throw new Error('Final web APP_BASE_URL does not match the approved analytics domain.');
  }
  // Return only public fields. Never serialize the expanded Compose configuration.
  return { counterId: registry.counter.id, host: hostname, goals: registry.goals.length };
}

function parseOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password
      && !url.port && url.pathname === '/' && !url.search && !url.hash) return url.origin;
  } catch { /* validation below intentionally omits the supplied value */ }
  throw new Error('Analytics domain must be an exact HTTPS origin without credentials, path, port or query.');
}
