import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import test from 'node:test';
import { readIdentityClientConfig } from '@reverie/identity-client';
test('production template uses the actual OIDC issuer path and independent HTTPS callback', () => {
  const env = parseEnv(readFileSync('.env.production.example', 'utf8'));
  const config = readIdentityClientConfig({ ...env, NODE_ENV: 'production' }, 'image-production');
  assert(config);
  assert.equal(config.issuer, 'https://id.apption.space/api/auth');
  assert.equal(config.redirectURI, 'https://production.apption.space/api/auth/identity/callback');
  assert.equal(env.REVERIE_IDENTITY_EMAIL_ENABLED, 'false');
});
