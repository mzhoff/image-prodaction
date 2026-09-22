import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkReleasePackageSources } from './check-release-package-sources.mjs';

const name = '@prodaction/stories-platform-contracts';
const archive = '.local-packages/stories.tgz';
const source = `file:${archive}`;
const fakeIntegrity = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;
const run = (cwd, executable, args) => {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'package-source-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  run(root, 'git', ['init', '--quiet']);
  await mkdir(join(root, '.local-packages'));
  await mkdir(join(root, 'package'));
  const packageManifest = { name, version: '3.0.0-canary.0' };
  const manifest = { dependencies: { [name]: source, clsx: '2.1.1' } };
  const lock = {
    lockfileVersion: 3,
    packages: {
      '': structuredClone(manifest),
      [`node_modules/${name}`]: { version: packageManifest.version, resolved: source, integrity: '' },
      'node_modules/clsx': {
        version: '2.1.1', resolved: 'https://registry.npmjs.org/clsx/-/clsx-2.1.1.tgz', integrity: fakeIntegrity,
      },
    },
  };
  const record = lock.packages[`node_modules/${name}`];
  const buildArchive = async () => {
    await writeFile(join(root, 'package/package.json'), JSON.stringify(packageManifest));
    run(root, 'tar', ['-czf', archive, 'package/package.json']);
    record.integrity = `sha512-${createHash('sha512').update(await readFile(join(root, archive))).digest('base64')}`;
    run(root, 'git', ['add', '--', archive]);
  };
  await buildArchive();
  const check = async () => {
    await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
    await writeFile(join(root, 'package-lock.json'), JSON.stringify(lock));
    return checkReleasePackageSources(root);
  };
  return { root, manifest, lock, record, packageManifest, buildArchive, check };
}

test('allows a tracked Stories contracts archive and pinned registry sources without node_modules', async (t) => {
  const f = await fixture(t);
  const result = await f.check();
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.localArchives, [archive]);
  assert.equal(result.remotePackages, 1);
});

test('rejects an untracked or ignored local archive', async (t) => {
  const f = await fixture(t);
  run(f.root, 'git', ['rm', '--cached', '--', archive]);
  await writeFile(join(f.root, '.gitignore'), '.local-packages/\n');
  assert.match((await f.check()).failures.join('\n'), /not tracked/);
});

test('rejects working archive bytes that have not been staged, even if the checksum was updated', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.root, archive), 'different bytes');
  f.record.integrity = `sha512-${createHash('sha512').update('different bytes').digest('base64')}`;
  assert.match((await f.check()).failures.join('\n'), /differs from the Git index/);
});

test('rejects mismatched archive integrity', async (t) => {
  const f = await fixture(t);
  f.record.integrity = fakeIntegrity;
  assert.match((await f.check()).failures.join('\n'), /checksum does not match/);
});

for (const field of ['name', 'version']) {
  test(`rejects a valid archive with wrong package ${field}`, async (t) => {
    const f = await fixture(t);
    f.packageManifest[field] = field === 'name' ? '@prodaction/other' : '99.0.0';
    await f.buildArchive();
    assert.match((await f.check()).failures.join('\n'), /name\/version differs/);
  });
}

test('rejects missing files and symlinks instead of archives', async (t) => {
  const f = await fixture(t);
  await rm(join(f.root, archive));
  assert.match((await f.check()).failures.join('\n'), /missing/);
  await symlink('../package/package.json', join(f.root, archive));
  assert.match((await f.check()).failures.join('\n'), /symlink/);
});

test('rejects file sources escaping the repository', async (t) => {
  const f = await fixture(t);
  f.record.resolved = 'file:../elsewhere.tgz';
  f.manifest.dependencies[name] = f.record.resolved;
  f.lock.packages[''].dependencies[name] = f.record.resolved;
  assert.match((await f.check()).failures.join('\n'), /inside the repository/);
});

test('rejects manifest/lock root drift and direct version drift', async (t) => {
  const f = await fixture(t);
  f.manifest.dependencies.clsx = '2.0.0';
  const errors = (await f.check()).failures.join('\n');
  assert.match(errors, /manifest and lock root disagree/);
  assert.match(errors, /exact manifest version differs/);
});

test('rejects a direct dependency absent from the lock packages table', async (t) => {
  const f = await fixture(t);
  delete f.lock.packages['node_modules/clsx'];
  assert.match((await f.check()).failures.join('\n'), /direct dependency is missing/);
});

test('rejects file/registry source changes hidden in the lockfile', async (t) => {
  const f = await fixture(t);
  f.manifest.dependencies[name] = f.record.version;
  f.lock.packages[''].dependencies[name] = f.record.version;
  assert.match((await f.check()).failures.join('\n'), /unexpectedly resolves to a local archive/);
});

test('rejects malformed integrity on transitive records', async (t) => {
  const f = await fixture(t);
  f.lock.packages['node_modules/clsx/node_modules/nested'] = {
    version: '1.0.0', resolved: 'https://registry.npmjs.org/nested/-/nested-1.0.0.tgz', integrity: 'sha512-short',
  };
  assert.match((await f.check()).failures.join('\n'), /valid SHA-512/);
});

test('validates GitHub registry package identity without fetching private URLs', async (t) => {
  const f = await fixture(t);
  f.record.resolved = `https://npm.pkg.github.com/download/${name}/${f.record.version}/artifact`;
  f.manifest.dependencies[name] = f.record.version;
  f.lock.packages[''].dependencies[name] = f.record.version;
  assert.deepEqual((await f.check()).failures, []);
  f.record.resolved = f.record.resolved.replace('/3.0.0-canary.0/', '/2.0.0/');
  assert.match((await f.check()).failures.join('\n'), /does not match/);
});

test('rejects unsafe remote sources without printing embedded credentials', async (t) => {
  const f = await fixture(t);
  for (const resolved of [
    'https://secret:never-log-me@registry.npmjs.org/clsx/-/clsx-2.1.1.tgz',
    'http://registry.npmjs.org/clsx/-/clsx-2.1.1.tgz',
    'https://registry.npmjs.org/clsx/-/clsx-2.1.1.tgz?token=never-log-me',
    'https://unexpected.example/clsx-2.1.1.tgz',
  ]) {
    f.lock.packages['node_modules/clsx'].resolved = resolved;
    const errors = (await f.check()).failures.join('\n');
    assert.match(errors, /approved HTTPS registry/);
    assert.doesNotMatch(errors, /never-log-me/);
  }
});

test('rejects Git URLs, workspace links and npm aliases in manifest', async (t) => {
  const f = await fixture(t);
  for (const source of ['git+https://example.org/repo.git#main', 'workspace:*', 'npm:other@1.0.0']) {
    f.manifest.dependencies.clsx = source;
    f.lock.packages[''].dependencies.clsx = source;
    assert.match((await f.check()).failures.join('\n'), /unsupported manifest source/);
  }
});

test('rejects lockfiles without a versioned packages table', async (t) => {
  const f = await fixture(t);
  f.lock.lockfileVersion = 1;
  assert.match((await f.check()).failures.join('\n'), /v2\/v3 packages table/);
});
