import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openNewRuntimeCredentialFile } from './runtime-credential-file';

async function fixture(run: (paths: { root: string; repository: string; outside: string }) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'runtime-credential-path-test-'));
  const repository = join(root, 'repository');
  const outside = join(root, 'outside');
  try {
    await mkdir(repository); await mkdir(outside);
    await run({ root, repository, outside });
  } finally { await rm(root, { recursive: true, force: true }); }
}
test('credential file helper rejects normal and dot-dot-prefixed repository directories', () => fixture(async ({ repository }) => {
  await mkdir(join(repository, '..secrets'));
  for (const file of [join(repository, 'key'), join(repository, '..secrets', 'key')]) {
    await assert.rejects(openNewRuntimeCredentialFile(file, repository), /outside the repository/);
    await assert.rejects(stat(file), { code: 'ENOENT' });
  }
}));
test('outside symlink parents pointing into the repo are rejected before creating a file', () => fixture(async ({ repository, outside }) => {
  const link = join(outside, 'apparently-external');
  await symlink(repository, link, 'dir');
  await assert.rejects(openNewRuntimeCredentialFile(join(link, 'key'), repository), /outside the repository/);
  await assert.rejects(stat(join(repository, 'key')), { code: 'ENOENT' });
}));
test('canonical repository alias cannot hide containment and file creation remains exclusive', () => fixture(async ({ root, repository, outside }) => {
  const repoAlias = join(root, 'repository-alias');
  await symlink(repository, repoAlias, 'dir');
  await assert.rejects(openNewRuntimeCredentialFile(join(repository, 'key'), repoAlias), /outside the repository/);
  const destination = join(outside, 'key');
  await writeFile(destination, 'fixture-not-a-secret', { mode: 0o600 });
  await assert.rejects(openNewRuntimeCredentialFile(destination, repository), { code: 'EEXIST' });
  assert.equal(await readFile(destination, 'utf8'), 'fixture-not-a-secret');
  const target = join(repository, 'existing-target');
  await writeFile(target, 'untouched');
  const finalSymlink = join(outside, 'final-symlink');
  await symlink(target, finalSymlink);
  await assert.rejects(openNewRuntimeCredentialFile(finalSymlink, repository), { code: 'EEXIST' });
  assert.equal(await readFile(target, 'utf8'), 'untouched');
}));
test('new external files have owner-only permissions and a canonical returned path', () => fixture(async ({ repository, outside }) => {
  const created = await openNewRuntimeCredentialFile(join(outside, 'new-key'), repository);
  try { await created.handle.writeFile('fixture-not-a-secret'); await created.handle.sync(); }
  finally { await created.handle.close(); }
  assert.equal(created.file, await realpath(join(outside, 'new-key')));
  assert.equal((await stat(created.file)).mode & 0o077, 0);
  assert.equal(await readFile(created.file, 'utf8'), 'fixture-not-a-secret');
}));
