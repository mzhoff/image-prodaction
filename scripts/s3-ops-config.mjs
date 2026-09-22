import { pathToFileURL } from 'node:url';

function required(env, name) {
  const value = env[name]?.trim();
  if (!value || value.startsWith('replace-with-')) throw new Error(`${name} must be configured`);
  return value;
}

export function readStorageConfig(env = process.env, { allowLocal = false } = {}) {
  const endpoint = new URL(required(env, 'S3_ENDPOINT'));
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  if ((endpoint.protocol !== 'https:' && !(allowLocal && local && endpoint.protocol === 'http:'))
    || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
    || endpoint.pathname !== '/' || endpoint.hostname.endsWith('.invalid')) {
    throw new Error('S3_ENDPOINT must be an HTTPS service origin without credentials or bucket path');
  }
  if (local && !allowLocal) throw new Error('External S3 must not use a localhost endpoint');
  const pathStyle = env.S3_FORCE_PATH_STYLE?.trim() || 'true';
  if (!['true', 'false'].includes(pathStyle)) throw new Error('S3_FORCE_PATH_STYLE must be true or false');
  return {
    bucket: required(env, 'S3_BUCKET'),
    clientOptions: {
      endpoint: endpoint.origin,
      region: required(env, 'S3_REGION'),
      forcePathStyle: pathStyle === 'true',
      credentials: {
        accessKeyId: required(env, 'S3_ACCESS_KEY_ID'),
        secretAccessKey: required(env, 'S3_SECRET_ACCESS_KEY'),
      },
      maxAttempts: 3,
      requestHandler: { connectionTimeout: 10_000, requestTimeout: 60_000 },
    },
  };
}

export function copySource(bucket, key) {
  return `${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export function isMain(meta) {
  return Boolean(process.argv[1] && meta.url === pathToFileURL(process.argv[1]).href);
}

export function reportFailure(label, error) {
  // SDK/fetch errors can contain signed URLs. Never log the exception or its message.
  const name = /^[A-Za-z0-9_]+$/.test(error?.name ?? '') ? error.name : 'Error';
  console.error(`${label} failed (${name}); no credentials or signed URLs were logged.`);
  process.exitCode = 1;
}
