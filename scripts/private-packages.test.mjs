import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  npmInvocation, packagesEnvironment, readPackagesToken, verifyPackagesToken,
} from './private-packages.mjs';

const credential = 'fixture-only-not-a-real-credential';

test('reads only the configured Keychain entry without leaking on failure', () => {
  assert.equal(readPackagesToken({
    env: {}, platform: 'darwin', readKeychain: () => `${credential}\n`,
  }), credential);
  assert.throws(() => readPackagesToken({
    env: {}, platform: 'darwin', readKeychain: () => { throw new Error(credential); },
  }), (error) => !error.message.includes(credential));
});

test('supports protected CI injection, rejects missing and multiline credentials', () => {
  assert.equal(readPackagesToken({
    env: { PRODACTION_PACKAGES_READ_TOKEN: credential },
    readKeychain: () => { throw new Error('Keychain must not be read'); },
  }), credential);
  assert.throws(() => readPackagesToken({ env: {}, platform: 'linux' }));
  assert.throws(() => readPackagesToken({
    env: { PRODACTION_PACKAGES_READ_TOKEN: 'first\nsecond' },
  }));
});

test('npm auth config has a reference, never a credential value', () => {
  const config = readFileSync(new URL('./private-packages.npmrc', import.meta.url), 'utf8');
  assert.ok(config.includes('//npm.pkg.github.com/:_authToken=${PRODACTION_PACKAGES_READ_TOKEN}'));
  assert.ok(!config.includes(credential));
});

test('passes credential only to the child environment; keeps parent unchanged', () => {
  const parent = { PATH: '/test/bin' };
  const child = packagesEnvironment(credential, parent);
  assert.equal(child.PRODACTION_PACKAGES_READ_TOKEN, credential);
  assert.equal(child.NPM_CONFIG_IGNORE_SCRIPTS, 'true');
  assert.equal(child.NPM_CONFIG_LOGS_MAX, '0');
  assert.deepEqual(parent, { PATH: '/test/bin' });
  assert.ok(!JSON.stringify(npmInvocation(['install'])).includes(credential));
});

test('only consumer commands are allowed; lifecycle scripts and debug files disabled', () => {
  for (const command of ['ci', 'install', 'view', 'pack']) {
    const invocation = npmInvocation([command, '--ignore-scripts=false', '--loglevel=silly']);
    assert.equal(invocation.command, 'npm');
    assert.equal(invocation.args.filter((arg) => arg.startsWith('--loglevel')).at(-1), '--loglevel=error');
    assert.equal(invocation.args.filter((arg) => arg.startsWith('--ignore-scripts')).at(-1), '--ignore-scripts');
    assert.ok(invocation.args.includes('--logs-max=0'));
  }
  for (const command of ['config', 'publish', 'run', 'exec', 'login', 'unpublish']) {
    assert.throws(() => npmInvocation([command]));
  }
});

test('verifies only read:packages and never reads profile body or redirects credentials', async () => {
  const result = await verifyPackagesToken(credential, async (url, options) => {
    assert.equal(url, 'https://api.github.com/user');
    assert.equal(options.headers.Authorization, `Bearer ${credential}`);
    assert.equal(options.redirect, 'error');
    return new Response('body intentionally not JSON', {
      headers: { 'x-oauth-scopes': 'read:packages', 'github-authentication-token-expiration': '2026-12-09' },
    });
  });
  assert.deepEqual(result, { scopes: ['read:packages'], expires: '2026-12-09' });
  for (const scopes of ['', 'repo', 'read:packages, write:packages']) {
    await assert.rejects(verifyPackagesToken(credential, async () => new Response('', {
      headers: { 'x-oauth-scopes': scopes },
    })), /только с read:packages/);
  }
});

test('auth and network failures cannot expose credential headers', async () => {
  await assert.rejects(verifyPackagesToken(credential, async () => {
    throw new Error(`Authorization: Bearer ${credential}`);
  }), (error) => !error.message.includes(credential));
  await assert.rejects(verifyPackagesToken(credential, async () => new Response('', {
    status: 401,
  })), /HTTP 401/);
});
