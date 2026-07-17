import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeOpenRouterAdapter } from './runtime-provider-adapter';

test('fake runtime is forbidden outside CI and test environments', () => {
  const previousRuntime = process.env.AI_PROVIDER_RUNTIME;
  const previousCi = process.env.CI;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.AI_PROVIDER_RUNTIME = 'fake';
  delete process.env.CI;
  setEnvironment('NODE_ENV', 'production');

  try {
    assert.throws(
      () => createRuntimeOpenRouterAdapter(),
      /allowed only when CI=true or NODE_ENV=test/,
    );
  } finally {
    restoreEnvironment('AI_PROVIDER_RUNTIME', previousRuntime);
    restoreEnvironment('CI', previousCi);
    restoreEnvironment('NODE_ENV', previousNodeEnv);
  }
});

test('fake runtime emulates OpenRouter only in test environments', async () => {
  const previousRuntime = process.env.AI_PROVIDER_RUNTIME;
  const previousCredential = process.env.FAKE_AI_PROVIDER_CREDENTIAL;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.AI_PROVIDER_RUNTIME = 'fake';
  process.env.FAKE_AI_PROVIDER_CREDENTIAL = 'ci-secret';
  setEnvironment('NODE_ENV', 'test');

  try {
    const adapter = createRuntimeOpenRouterAdapter();
    assert.equal(adapter.provider, 'openrouter');
    const summary = await adapter.validateCredential({ credential: 'ci-secret' });
    assert.equal(summary.label, 'Fake test credential');
  } finally {
    restoreEnvironment('AI_PROVIDER_RUNTIME', previousRuntime);
    restoreEnvironment('FAKE_AI_PROVIDER_CREDENTIAL', previousCredential);
    restoreEnvironment('NODE_ENV', previousNodeEnv);
  }
});

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function setEnvironment(key: string, value: string) {
  (process.env as Record<string, string | undefined>)[key] = value;
}
