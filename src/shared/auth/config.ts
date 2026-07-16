const AUTH_SECRET_MIN_LENGTH = 32;

export interface AuthServerConfig {
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
}

interface AuthEnvironment {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  BETTER_AUTH_URL?: string;
  NODE_ENV?: string;
}

export function readAuthServerConfig(environment: AuthEnvironment = process.env) {
  const baseURL = readBaseURL(environment.BETTER_AUTH_URL, environment.NODE_ENV);
  const secret = readSecret(environment.BETTER_AUTH_SECRET, environment.NODE_ENV);

  return {
    baseURL,
    secret,
    trustedOrigins: readTrustedOrigins(baseURL, environment.BETTER_AUTH_TRUSTED_ORIGINS),
  } satisfies AuthServerConfig;
}

function readBaseURL(value: string | undefined, nodeEnvironment: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) throw new Error('BETTER_AUTH_URL is required for Better Auth.');

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('BETTER_AUTH_URL must be a valid absolute URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('BETTER_AUTH_URL must be an HTTP(S) URL without credentials.');
  }
  if (url.search || url.hash) {
    throw new Error('BETTER_AUTH_URL must not contain query parameters or a hash.');
  }
  if (nodeEnvironment === 'production' && url.protocol !== 'https:' && !isLoopbackHost(url.hostname)) {
    throw new Error('BETTER_AUTH_URL must use HTTPS in production.');
  }

  return normalized.replace(/\/+$/, '');
}

function isLoopbackHost(hostname: string) {
  return hostname === 'localhost'
    || hostname === '::1'
    || hostname.startsWith('127.')
    || hostname.endsWith('.localhost');
}

function readSecret(value: string | undefined, nodeEnvironment: string | undefined) {
  const secret = value?.trim();
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required for Better Auth.');
  if (nodeEnvironment === 'production' && secret.length < AUTH_SECRET_MIN_LENGTH) {
    throw new Error(`BETTER_AUTH_SECRET must contain at least ${AUTH_SECRET_MIN_LENGTH} characters in production.`);
  }
  return secret;
}

function readTrustedOrigins(baseURL: string, configuredValue: string | undefined) {
  const values = [new URL(baseURL).origin, ...splitOrigins(configuredValue)];
  return Array.from(new Set(values.map(readExactOrigin)));
}

function splitOrigins(value: string | undefined) {
  return value?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
}

function readExactOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('BETTER_AUTH_TRUSTED_ORIGINS must contain only valid absolute origins.');
  }

  if (!['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash) {
    throw new Error('BETTER_AUTH_TRUSTED_ORIGINS must contain only exact HTTP(S) origins.');
  }

  return url.origin;
}
