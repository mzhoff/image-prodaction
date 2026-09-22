import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./check-chatmodule-versions.mjs', import.meta.url));
const ui = '@prodactionpro/chat-ui';
const domain = '@prodactionpro/chat-domain';

async function check(packages, dependencies = { [ui]: '0.13.0' }) {
  const cwd = await mkdtemp(join(tmpdir(), 'chatmodule-version-policy-'));
  try {
    await Promise.all([
      writeFile(join(cwd, 'package.json'), JSON.stringify({ dependencies })),
      writeFile(join(cwd, 'package-lock.json'), JSON.stringify({ packages })),
    ]);
    return spawnSync(process.execPath, [script], { cwd, encoding: 'utf8', timeout: 10_000 });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test('accepts a single stable family including nested dependencies', async () => {
  const result = await check({
    [`node_modules/${ui}`]: { version: '0.13.0' },
    [`node_modules/consumer/node_modules/${domain}`]: { version: '0.13.0' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 packages at 0\.13\.0/);
});

test('rejects an older nested ChatModule package', async () => {
  const result = await check({
    [`node_modules/${ui}`]: { version: '0.13.0' },
    [`node_modules/consumer/node_modules/${domain}`]: { version: '0.12.1' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /consumer\/node_modules\/@prodactionpro\/chat-domain.*0\.12\.1/);
});

test('rejects a direct dependency missing from the lockfile', async () => {
  const result = await check({
    [`node_modules/${domain}`]: { version: '0.13.0' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /chat-ui is missing from package-lock\.json/);
});

test('keeps rejecting a local archive instead of an exact stable version', async () => {
  const result = await check({
    [`node_modules/${ui}`]: { version: '0.13.0' },
  }, { [ui]: 'file:.local-packages/chat-ui.tgz' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must use an exact stable version/);
});
