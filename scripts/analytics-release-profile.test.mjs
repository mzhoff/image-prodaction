import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { validateAnalyticsCompose, validateAnalyticsRegistry, validatePublicAnalyticsProfile } from './analytics-release-profile.mjs';

const registry = JSON.parse(readFileSync(new URL('../deploy/analytics/image-production-beta.json', import.meta.url), 'utf8'));
const profile = parseEnv(readFileSync(new URL('../deploy/analytics/beta.public.env', import.meta.url), 'utf8'));
const fixture = (overrides = {}) => ({ name: registry.composeProject, services: { web: { environment: {
  ...profile, APP_BASE_URL: registry.counter.origin, DATABASE_URL: 'private-database-value', ...overrides,
} } } });

test('approved public profile and goal registry agree with the live SDK event allowlist', () => {
  validatePublicAnalyticsProfile(profile, registry);
  assert.equal(registry.counter.id, 112833712);
  assert.equal(registry.counter.origin, 'https://production.apption.space');
  assert.deepEqual(validateAnalyticsCompose(fixture(), registry), {
    counterId: 112833712, host: 'production.apption.space', goals: registry.goals.length,
  });
});

for (const [name, override] of [
  ['wrong counter', { METRICA_COUNTER_ID: '12345678' }],
  ['extra domain', { METRICA_ALLOWED_HOSTS: 'production.apption.space,hub.apption.space' }],
  ['wrong application domain', { APP_BASE_URL: 'https://hub.apption.space' }],
  ['local debug environment', { METRICA_MODE: 'debug', APP_BASE_URL: 'http://localhost:3004' }],
  ['mode overridden by a later overlay', { METRICA_MODE: 'off' }],
  ['private URL accidentally supplied', { APP_BASE_URL: 'https://private-token@example.test/path' }],
]) {
  test(`rejects ${name} without echoing environment values`, () => {
    assert.throws(() => validateAnalyticsCompose(fixture(override), registry), (error) => {
      assert.doesNotMatch(error.message, /private-token|private-database-value/);
      return true;
    });
  });
}

test('rejects a mismatched legacy Compose project', () => {
  assert.throws(() => validateAnalyticsCompose({ ...fixture(), name: 'reverie-stage' }, registry), /Timeweb/);
});

test('the public profile cannot grow to include credentials or unrelated runtime settings', () => {
  assert.throws(() => validatePublicAnalyticsProfile({ ...profile, DATABASE_URL: 'private' }, registry), /exactly three/);
});

test('registry rejects missing events, duplicate IDs and unregistered events', () => {
  for (const goals of [
    registry.goals.slice(1),
    registry.goals.map((goal) => ({ ...goal, goalId: 1 })),
    registry.goals.map((goal, index) => index ? goal : { ...goal, event: 'ip_unregistered' }),
  ]) assert.throws(() => validateAnalyticsRegistry({ ...registry, goals }), /live event contract/);
});
